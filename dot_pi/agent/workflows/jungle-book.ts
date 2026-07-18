// @description: Read-only recurring-pattern analysis for a repository or scope up to 160 files: up to 5 agents, concurrency 3, $4 budget
// @model-invocation: automatic
// @args: [scope]
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { SpawnResult, WorkflowContext } from "pi-workflows";

/**
 * Jungle-book pattern (ported from the jungle-book skill).
 *
 * "Accentuate the positive, eliminate the negative, look out for Mr. Inbetween."
 * Relentless, opinionated pattern analysis with a strict separation:
 *
 *   1. Map     — one recon scout proposes a balanced, low-overlap division of the
 *                codebase (or scope) into at most 3 slices.
 *   2. Explore — up to 3 parallel scouts DESCRIBE patterns in their slice. Scouts
 *                never classify — that's the classifier's job (avoids self-preferential
 *                bias where the describer also grades its own findings).
 *   3. Classify— a SEPARATE classifier agent dedups, buckets every recurring pattern
 *                into positive / negative / inbetween, cross-references each negative
 *                and inbetween entry to a concrete positive migration target, assesses
 *                the codebase grain, and ranks the top 3 migration priorities.
 *
 * Maximum of 3 exploration scouts, per the skill. The classifier loads the
 * jungle-book skill so it uses the exact six-term vocabulary and artifact format.
 *
 * Usage: /jungle-book [scope]   (scope optional: a module, dir, or feature area)
 */
const MAX_MANIFEST_FILES = 160;
const EXCLUDED_DIRECTORIES = new Set([".git", ".jj", "node_modules"]);

type ManifestResult = { files: string[]; error?: string };

function boundedFilesystemManifest(cwd: string): ManifestResult {
  const files: string[] = [];
  const directories = [cwd];
  try {
    while (directories.length > 0 && files.length <= MAX_MANIFEST_FILES) {
      const directory = directories.pop()!;
      const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => b.name.localeCompare(a.name));
      for (const entry of entries) {
        if (files.length > MAX_MANIFEST_FILES) break;
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (!EXCLUDED_DIRECTORIES.has(entry.name)) directories.push(entryPath);
        } else if (entry.isFile()) {
          files.push(path.relative(cwd, entryPath));
        }
      }
    }
    return files.length > MAX_MANIFEST_FILES
      ? { files: [], error: `Repository manifest exceeds ${MAX_MANIFEST_FILES} files; refusing partial pattern analysis.` }
      : { files: files.sort() };
  } catch {
    return { files: [], error: "Could not enumerate a bounded repository manifest." };
  }
}

function repositoryManifest(cwd: string): ManifestResult {
  try {
    const files = execFileSync("git", ["--no-optional-locks", "ls-files", "--cached", "--others", "--exclude-standard"], {
      cwd,
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: 128 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    }).split("\n").filter(Boolean).sort();
    return files.length > MAX_MANIFEST_FILES
      ? { files: [], error: `Repository manifest exceeds ${MAX_MANIFEST_FILES} files; refusing partial pattern analysis.` }
      : { files };
  } catch (error) {
    if (error instanceof Error && /maxBuffer/i.test(error.message)) {
      return { files: [], error: "Git manifest exceeded the bounded output buffer; refusing unbounded fallback." };
    }
    return boundedFilesystemManifest(cwd);
  }
}

export default async function (wf: WorkflowContext) {
  const scope = wf.args.trim();
  const scopeLabel = scope || "the whole codebase";

  wf.budget({ cost: 4.0 });
  const manifestResult = repositoryManifest(wf.cwd);
  if (manifestResult.error) return wf.report({ error: manifestResult.error, scope: scopeLabel });
  const manifest = manifestResult.files;
  const manifestText = manifest.map((file) => `- ${file}`).join("\n") || "(no repository files found)";
  wf.log("Jungle-book started", { scope: scopeLabel, manifestFiles: manifest.length });

  // ---- Phase 1: Map — propose an intelligent division (not mechanical) ----
  let map;
  try {
    map = await wf.spawn({
    agent: "scout",
    label: "map shape + division",
    task: [
      `Survey ${scopeLabel} to plan a jungle-book analysis.`,
      `Do a fast structural pass (file tree, languages, frameworks, major areas).`,
      `Then propose how to divide the work across AT MOST 3 scouts for balanced load and`,
      `minimal overlap — split by feature area / layer / domain as fits THIS codebase, not`,
      `blindly by top-level directory. For a small scope, say "1 scout suffices".`,
      ``,
      `Output exactly:`,
      `DIVISION: <n>   (1, 2, or 3)`,
      `Then for each scout a line: SLICE <i>: <concrete area description + key paths>`,
      `Use only this bounded trusted file manifest; do not inspect paths outside it:`,
      `--- TRUSTED FILE MANIFEST ---`,
      manifestText,
    ].join("\n"),
    timeoutMs: 6 * 60 * 1000,
    tools: ["read"],
    });
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "BudgetExceededError") throw error;
    return wf.report({ partial: true, reason: "Budget exhausted before mapping the analysis scope.", scope: scopeLabel, manifest, usageTotal: wf.usage() });
  }

  if (!map.ok) {
    return wf.report({ error: "Mapping scout failed", scope: scopeLabel, detail: map.errorMessage, manifest, usageTotal: wf.usage() });
  }

  // Parse the proposed slices (maximum 3).
  const slices = map.output
    .split("\n")
    .map((l) => l.match(/^\s*SLICE\s*\d+\s*:\s*(.+)$/i)?.[1]?.trim())
    .filter((x): x is string => Boolean(x))
    .slice(0, 3);

  const explorationSlices = slices.length > 0 ? slices : [scopeLabel];
  wf.checkpoint("after-map", { scouts: explorationSlices.length });

  // ---- Phase 2: Explore — describe-only scouts ----
  const scoutBrief = [
    `JUNGLE-BOOK SCOUT. Explore your assigned slice and DESCRIBE recurring patterns —`,
    `naming conventions, abstractions, error handling, file layout, data flow, test shape.`,
    `For each pattern: name it, show 1-2 concrete examples (file paths), and describe how`,
    `clearly it communicates intent. You DESCRIBE only — do NOT classify as good/bad and do`,
    `NOT recommend changes. Note where similar things have quietly diverged (drift).`,
  ].join("\n");

  let exploration: SpawnResult[];
  try {
    exploration = await wf.parallel(
      explorationSlices.map((slice, i) => ({
        agent: "scout" as const,
        label: `scout: slice ${i + 1}`,
        task: [scoutBrief, ``, `Your slice: ${slice}`, ``, `Scope boundary: ${scopeLabel}.`, `--- TRUSTED FILE MANIFEST ---`, manifestText].join("\n"),
        timeoutMs: 8 * 60 * 1000,
        tools: ["read"],
      })),
      { concurrency: 3 },
    );
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "BudgetExceededError") throw error;
    return wf.report({
      partial: true,
      reason: "Budget exhausted before all pattern exploration could start.",
      scope: scopeLabel,
      map: map.output,
      manifest,
      usageTotal: wf.usage(),
    });
  }

  const exploreOk = exploration.filter((r) => r.ok);
  if (exploreOk.length === 0) {
    return wf.report({ error: "All exploration scouts failed", scope: scopeLabel, detail: exploration.map((result) => result.errorMessage), manifest, usageTotal: wf.usage() });
  }
  wf.checkpoint("after-exploration", { ok: exploreOk.length });

  const observations = explorationSlices
    .map((slice, i) => `## Slice ${i + 1}: ${slice}\n${exploration[i].ok ? exploration[i].output.trim() : `(scout failed: ${exploration[i].errorMessage})`}`)
    .join("\n\n");

  // ---- Phase 3: Classify — SEPARATE judge, loads the skill ----
  try {
    const classification = await wf.spawn({
    agent: "reviewer",
    label: "classify + migrate",
    tools: ["read"],
    task: [
      `Load the jungle-book skill and follow its synthesis rules and ARTIFACT-FORMAT exactly.`,
      `You are the classifier — the scouts only described; you judge. Be blunt and economical.`,
      `Use only this bounded trusted file manifest if you need to inspect source:`,
      `--- TRUSTED FILE MANIFEST ---`,
      manifestText,
      ``,
      `From the describe-only scout observations below for ${scopeLabel}:`,
      `1. DEDUPLICATE patterns reported by adjacent scouts.`,
      `2. CLASSIFY every recurring pattern into positive / negative / inbetween.`,
      `3. CROSS-REFERENCE: every negative and inbetween entry must point at a concrete positive`,
      `   pattern as its migration target. If none exists, say so explicitly — that's a finding.`,
      `4. Assess the codebase GRAIN in 1-2 sentences.`,
      `5. Rank the TOP 3 migration priorities.`,
      `Use only the six glossary terms (Pattern, Friction, Creep, Signal, Drift, Grain).`,
      `Output the self-contained artifact markdown (do not write files — return it).`,
      ``,
      `--- SCOUT OBSERVATIONS ---`,
      observations,
    ].join("\n"),
    timeoutMs: 12 * 60 * 1000,
  });

    if (!classification.ok) {
      return wf.report({
        partial: true,
        reason: "Pattern classification failed after usable exploration evidence.",
        classificationError: classification.errorMessage,
        scope: scopeLabel,
        scouts: explorationSlices.length,
        observations,
        manifest,
        usageTotal: wf.usage(),
      });
    }
    return wf.report({
      partial: exploration.some((result) => !result.ok) || undefined,
      scope: scopeLabel,
      scouts: explorationSlices.length,
      artifact: classification.output,
      explorationErrors: exploration.some((result) => !result.ok) ? exploration.map((result) => result.ok ? undefined : result.errorMessage) : undefined,
      manifest,
      usageTotal: wf.usage(),
    });
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "BudgetExceededError") throw error;
    return wf.report({
      partial: true,
      reason: "Budget exhausted before pattern classification.",
      scope: scopeLabel,
      scouts: explorationSlices.length,
      observations,
      manifest,
      usageTotal: wf.usage(),
    });
  }
}
