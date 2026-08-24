// @description: Read-only investigation for a repository or scope up to 160 files: 4 recon scouts, synthesis, and verification (6 agents, concurrency 4, $5)
// @model-invocation: automatic
// @args: [target]
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { WorkflowContext } from "pi-workflows";

/**
 * Investigate pattern (ported from the codebase-investigation skill).
 *
 * Reconnaissance → Synthesis → Verification, with the deliberate separation
 * that fights single-context laziness and self-preferential bias:
 *
 *   1. Recon  — 4 parallel scouts ENUMERATE/DESCRIBE different facets. Scouts
 *               never judge; they only map the landscape.
 *   2. Synth  — one worker turns raw enumeration into a deliverable (entity
 *               grouping, a matrix, a risk assessment). This is the judgment layer.
 *   3. Verify — a SEPARATE adversarial-reviewer checks the synthesis against the
 *               actual codebase (catching unsupported claims) and classifies every
 *               finding as agent-fixable vs human-required. Verdicts come from a
 *               different agent than the one that produced them — never the
 *               orchestrator, never the synthesiser.
 *
 * Note: the skill's interactive Spec/Planner phases are intentionally omitted —
 * they require user collaboration and belong in a planning session, not an
 * autonomous workflow.
 *
 * Usage: /investigate <target>   (e.g. /investigate "all network timeouts and their fallbacks")
 * Defaults to the overall architecture if no target is given.
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
      ? { files: [], error: `Repository manifest exceeds ${MAX_MANIFEST_FILES} files; refusing partial codebase analysis.` }
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
      ? { files: [], error: `Repository manifest exceeds ${MAX_MANIFEST_FILES} files; refusing partial codebase analysis.` }
      : { files };
  } catch (error) {
    if (error instanceof Error && /maxBuffer/i.test(error.message)) {
      return { files: [], error: "Git manifest exceeded the bounded output buffer; refusing unbounded fallback." };
    }
    return boundedFilesystemManifest(cwd);
  }
}

export default async function (wf: WorkflowContext) {
  const target = wf.args.trim() || "the overall architecture, key abstractions, and notable risks";

  wf.budget({ cost: 5.0 });
  const manifestResult = repositoryManifest(wf.cwd);
  if (manifestResult.error) return wf.report({ error: manifestResult.error, target });
  const manifest = manifestResult.files;
  const manifestText = manifest.map((file) => `- ${file}`).join("\n") || "(no repository files found)";
  wf.log("Investigation started", { target, manifestFiles: manifest.length });

  // ---- Phase 1: Reconnaissance (parallel scouts, describe-only) ----
  const facets = [
    {
      label: "recon: registry",
      brief: "REGISTRY scout. Enumerate every instance relevant to the target (files, classes, configs, call sites). List identities and locations. Do NOT judge or rank — only enumerate.",
    },
    {
      label: "recon: architecture",
      brief: "ARCHITECTURE scout. Describe HOW the relevant code works: abstractions, factories, inheritance, conventions, data flow. Describe mechanisms, not quality.",
    },
    {
      label: "recon: protection",
      brief: "PROTECTION/QUALITY scout. Enumerate the safeguards around the target: tests, monitoring, validation, error handling, alerts. Report what exists and where, not whether it's good.",
    },
    {
      label: "recon: configuration",
      brief: "CONFIGURATION scout. Enumerate where the relevant behaviour is configured: env vars, flags, settings files, defaults. Report locations and what each controls.",
    },
  ];

  let recon;
  try {
    recon = await wf.parallel(
    facets.map((f) => ({
      agent: "scout" as const,
      label: f.label,
      task: [
        `Investigation target: ${target}`,
        ``,
        f.brief,
        ``,
        `Output a structured list (markdown). Be exhaustive within your facet.`,
        `Cite concrete file paths. You ENUMERATE and DESCRIBE — you do not analyse, score, or recommend.`,
        `Inspect only this bounded trusted file manifest; do not inspect paths outside it:`,
        `--- TRUSTED FILE MANIFEST ---`,
        manifestText,
      ].join("\n"),
      timeoutMs: 8 * 60 * 1000,
      tools: ["read"],
    })),
    { concurrency: 4 },
    );
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "BudgetExceededError") throw error;
    return wf.report({ partial: true, reason: "Budget exhausted before reconnaissance completed.", target, manifest, usageTotal: wf.usage() });
  }

  const reconOk = recon.filter((r) => r.ok);
  wf.checkpoint("after-recon", { ok: reconOk.length, total: recon.length });
  if (reconOk.length === 0) {
    return wf.report({ error: "All recon scouts failed", target, detail: recon.map((r) => r.errorMessage) });
  }

  const reconCombined = facets
    .map((f, i) => `## ${f.label}\n${recon[i].ok ? recon[i].output.trim() : `(scout failed: ${recon[i].errorMessage})`}`)
    .join("\n\n");

  // ---- Phase 2: Synthesis (judgment layer) ----
  try {
    const synthesis = await wf.spawn({
    agent: "worker",
    label: "synthesise deliverable",
    tools: ["read"],
    task: [
      `You are the analysis/synthesis layer of a codebase investigation into: ${target}`,
      `Inspect only this bounded trusted file manifest if verification is needed:`,
      `--- TRUSTED FILE MANIFEST ---`,
      manifestText,
      ``,
      `Below is raw, describe-only reconnaissance from four scouts. Turn it into a deliverable:`,
      `1. Group the raw entries into logical entities.`,
      `2. Build a MATRIX (entity × dimension) covering: configuration, relationships, quality signals.`,
      `3. Produce a RISK ASSESSMENT — ranked findings with a brief rationale and a recommendation each.`,
      `4. Name at least one exemplary entity that others should be modelled on.`,
      `Document your scoring/ranking methodology in one short paragraph.`,
      `Do not invent entities that aren't in the recon. Cite file paths.`,
      ``,
      `--- RECONNAISSANCE ---`,
      reconCombined,
    ].join("\n"),
    timeoutMs: 12 * 60 * 1000,
  });

  if (!synthesis.ok) {
    return wf.report({
      partial: true,
      reason: "Synthesis failed after usable reconnaissance.",
      synthesisError: synthesis.errorMessage,
      target,
      reconFacets: facets.map((facet, index) => ({ facet: facet.label, ok: recon[index].ok, output: recon[index].ok ? recon[index].output : recon[index].errorMessage })),
      manifest,
      usageTotal: wf.usage(),
    });
  }
  wf.checkpoint("after-synthesis");

  // ---- Phase 3: Verification + triage (SEPARATE agent) ----
  const verification = await wf.spawn({
    agent: "adversarial-reviewer",
    label: "verify + triage",
    tools: ["read"],
    task: [
      `Adversarially verify this codebase-investigation deliverable for: ${target}`,
      `Inspect only this bounded trusted file manifest:`,
      `--- TRUSTED FILE MANIFEST ---`,
      manifestText,
      ``,
      `Your job is independent verification — you did NOT write this, so check it hard:`,
      `1. For each significant claim/finding, confirm it against the actual codebase. Flag any`,
      `   claim that is unsupported, overstated, or contradicted by the code (cite file/line).`,
      `2. Re-rank risk if the evidence warrants it.`,
      `3. TRIAGE every gap/finding into:`,
      `   - 🤖 agent-fixable: mechanical, clear exemplar to follow, ≤2 files, low blast radius`,
      `   - 🧑 human-required: business-logic judgment, high blast radius, platform-critical, multi-file`,
      `Produce: a verification table (claim → SUPPORTED/REFUTED/UNVERIFIABLE + evidence), a revised`,
      `top-risks list, and the triage classification.`,
      ``,
      `--- DELIVERABLE UNDER REVIEW ---`,
      synthesis.output,
    ].join("\n"),
    timeoutMs: 12 * 60 * 1000,
  });

    if (!verification.ok) {
      return wf.report({
        partial: true,
        reason: "Verification failed after a completed investigation deliverable.",
        verificationError: verification.errorMessage,
        target,
        reconFacets: facets.map((facet, index) => ({ facet: facet.label, ok: recon[index].ok })),
        deliverable: synthesis.output,
        manifest,
        usageTotal: wf.usage(),
      });
    }
    return wf.report({
      partial: recon.some((result) => !result.ok) || undefined,
      target,
      reconFacets: facets.map((facet, index) => ({ facet: facet.label, ok: recon[index].ok })),
      deliverable: synthesis.output,
      verification: verification.output,
      manifest,
      usageTotal: wf.usage(),
    });
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "BudgetExceededError") throw error;
    return wf.report({
      partial: true,
      reason: "Budget exhausted after reconnaissance.",
      target,
      reconFacets: facets.map((facet, index) => ({ facet: facet.label, ok: recon[index].ok, output: recon[index].ok ? recon[index].output : recon[index].errorMessage })),
      manifest,
      usageTotal: wf.usage(),
    });
  }
}
