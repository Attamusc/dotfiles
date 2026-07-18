// @description: Read-only structural review of a diff up to 12 files; at most 13 agents, concurrency 3, and a $6 budget
// @model-invocation: automatic
// @args: [scope]
import { execFileSync } from "node:child_process";
import type { SpawnResult, WorkflowContext } from "pi-workflows";

/**
 * Deep-review pattern (ported from the deep-review prompt + deep-code-review skill).
 *
 * A strict, second-stage structural / maintainability review. The key addition
 * over the single-shot prompt is a FAN-OUT path for large branches that directly
 * fights "addressed 35 of 50 files" laziness:
 *
 *   - Small diff (≤ FANOUT_THRESHOLD changed files): one reviewer reviews the whole
 *     branch in a single context — fastest, full cross-file visibility, no overhead.
 *   - Large diff (> FANOUT_THRESHOLD): one reviewer per changed file (concurrency-
 *     throttled), each applying the deep-code-review rubric to its file in full, then
 *     a synthesis reviewer aggregates, dedups cross-file structural findings, and
 *     issues the overall verdict. No file gets skipped because every file owns an agent.
 *
 * Threshold is a documented constant below. Tune FANOUT_THRESHOLD / FANOUT_CONCURRENCY
 * to your machine and branch sizes.
 *
 * Usage: /deep-review [scope]   (scope optional; defaults to the current branch vs its base)
 */
const FANOUT_THRESHOLD = 8;     // changed-file count at/below which we stay single-context
const MAX_CHANGED_FILES = 12;   // automatic runs reject broader diffs rather than silently sampling
const FANOUT_CONCURRENCY = 3;   // parallel per-file reviewers above the threshold

function runReadOnly(command: string, args: string[], cwd: string): string | undefined {
  const readOnlyArgs = command === "jj"
    ? ["--ignore-working-copy", "--no-pager", ...args]
    : command === "git"
      ? ["--no-optional-locks", ...args]
      : args;
  try {
    return execFileSync(command, readOnlyArgs, {
      cwd,
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: 64 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function changedFiles(cwd: string, scope: string): string[] | undefined {
  let output: string | undefined;
  if (scope) {
    output = runReadOnly("git", ["diff", "--no-ext-diff", "--no-textconv", "--name-only", scope], cwd)
      ?? runReadOnly("jj", ["diff", "--name-only", "-r", scope], cwd);
  } else {
    const upstream = runReadOnly("git", ["rev-parse", "--abbrev-ref", "@{upstream}"], cwd);
    const base = [upstream, "main", "master", "trunk", "HEAD^"]
      .filter((candidate): candidate is string => Boolean(candidate))
      .map((candidate) => runReadOnly("git", ["merge-base", "HEAD", candidate], cwd))
      .find((candidate): candidate is string => Boolean(candidate));
    output = base
      ? runReadOnly("git", ["diff", "--no-ext-diff", "--no-textconv", "--name-only", `${base}...HEAD`], cwd)
      : runReadOnly("jj", ["diff", "--name-only"], cwd);
  }
  if (output === undefined) return undefined;
  return [...new Set(output.split("\n").map((file) => file.trim()).filter((file) =>
    file.length > 0 && !file.startsWith("/") && !file.split("/").includes(".."),
  ))].sort();
}

export default async function (wf: WorkflowContext) {
  const scope = wf.args.trim();
  if (scope.startsWith("-")) {
    return wf.report({ error: "Review scope must not begin with a VCS option." });
  }

  wf.budget({ cost: 6.0 });

  // ---- Phase 0: enumerate the changed files in trusted read-only workflow code ----
  const files = changedFiles(wf.cwd, scope);
  if (!files) {
    return wf.report({ error: "Could not enumerate changed files from a supported VCS." });
  }

  wf.log("Changed files enumerated", { count: files.length, mode: files.length > FANOUT_THRESHOLD ? "fan-out" : "single-context" });
  wf.checkpoint("after-enumerate", { count: files.length });

  if (files.length > MAX_CHANGED_FILES) {
    return wf.report({
      error: "Review scope exceeds the automatic safety limit",
      changedFiles: files.length,
      maxChangedFiles: MAX_CHANGED_FILES,
    });
  }

  const manifest = files.map((file) => `- ${file}`).join("\n");
  const RUBRIC = `Load the deep-code-review skill and apply its rubric EXACTLY. This is a second-stage structural pass — assume correctness/security/bugs were already covered. Be ambitious about "code judo" simplifications. Prioritise: (1) structural regressions, (2) missed simplifications, (3) spaghetti/branching growth, (4) boundary/abstraction/type-contract problems, (5) file-size & decomposition, (6) modularity, (7) legibility.`;

  // ---- Small diff: single-context review (preserves cross-file visibility) ----
  if (files.length <= FANOUT_THRESHOLD) {
    try {
      const review = await wf.spawn({
        agent: "reviewer",
        label: "deep review (single)",
        tools: ["read"],
        task: [
          RUBRIC,
          ``,
          scope ? `Scope: ${scope}` : `Scope: the current branch vs its base.`,
          `Read only these changed files IN FULL (not just the diff) so you catch file growth, scattered`,
          `--- TRUSTED FILE MANIFEST ---`,
          manifest,
          `conditionals, and layer leaks the diff hides.`,
          ``,
          `Output: a verdict (APPROVED / NEEDS RESTRUCTURING), high-conviction findings`,
          `(each with where / problem / proposed reframing), lower-conviction notes, and what's`,
          `good structurally.`,
        ].join("\n"),
        timeoutMs: 15 * 60 * 1000,
      });
      if (!review.ok) {
        return wf.report({
          error: "Single-context deep review failed.",
          reviewError: review.errorMessage,
          mode: "single-context",
          changedFiles: files.length,
          usageTotal: wf.usage(),
        });
      }
      return wf.report({ mode: "single-context", changedFiles: files.length, review: review.output, usageTotal: wf.usage() });
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "BudgetExceededError") throw error;
      return wf.report({
        partial: true,
        reason: "Budget exhausted before the single-context deep review.",
        mode: "single-context",
        changedFiles: files.length,
        usageTotal: wf.usage(),
      });
    }
  }

  // ---- Large diff: fan-out one reviewer per file, then synthesise ----
  let perFile: SpawnResult[];
  try {
    perFile = await wf.map(
      files,
      (file) => ({
        agent: "reviewer" as const,
        label: `review: ${file}`,
        tools: ["read"],
        task: [
          RUBRIC,
          ``,
          `Review ONLY this file as part of the current branch's changes: ${file}`,
          `Read the file IN FULL. Focus on structural quality of the changes in THIS file:`,
          `--- TRUSTED FILE MANIFEST ---`,
          manifest,
          `file growth past healthy size, new ad-hoc branches, abstraction/type problems,`,
          `logic landing in the wrong layer, duplication of canonical helpers.`,
          ``,
          `Output for this file: a per-file verdict (CLEAN / CONCERNS / NEEDS RESTRUCTURING)`,
          `and the high-conviction structural findings (where / problem / proposed reframing).`,
          `If the file is structurally fine, say so briefly — do not invent nits.`,
        ].join("\n"),
        timeoutMs: 10 * 60 * 1000,
      }),
      { concurrency: FANOUT_CONCURRENCY },
    );
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "BudgetExceededError") throw error;
    return wf.report({
      partial: true,
      reason: "Budget exhausted before all per-file reviews could start.",
      mode: "fan-out",
      changedFiles: files.length,
      manifest: files,
      usageTotal: wf.usage(),
    });
  }

  const okCount = perFile.filter((result) => result.ok).length;
  wf.checkpoint("after-per-file", { ok: okCount, total: files.length });
  if (okCount === 0) {
    return wf.report({
      error: "All per-file deep reviews failed.",
      mode: "fan-out",
      changedFiles: files.length,
      perFile: files.map((file, index) => ({ file, error: perFile[index].errorMessage })),
      usageTotal: wf.usage(),
    });
  }

  const perFileFindings = files
    .map((file, index) => `### ${file}\n${perFile[index].ok ? perFile[index].output.trim() : `(review failed: ${perFile[index].errorMessage})`}`)
    .join("\n\n");

  // Synthesis reviewer: cross-file structural view + overall verdict.
  try {
    const synthesis = await wf.spawn({
      agent: "reviewer",
      label: "synthesise verdict",
      tools: ["read"],
      task: [
        `You are aggregating ${files.length} per-file deep reviews of the current branch.`,
        `--- TRUSTED FILE MANIFEST ---`,
        manifest,
        RUBRIC,
        ``,
        `From the per-file findings below:`,
        `1. Dedup and surface CROSS-FILE structural issues no single-file reviewer could see`,
        `   (duplicated logic across files, a concept smeared across layers, coordinated bloat).`,
        `2. Rank the highest-conviction structural findings overall.`,
        `3. Issue the overall verdict: APPROVED / NEEDS RESTRUCTURING.`,
        `Be economical — a few high-conviction calls beat a long list of nits.`,
        ``,
        `--- PER-FILE FINDINGS ---`,
        perFileFindings,
      ].join("\n"),
      timeoutMs: 12 * 60 * 1000,
    });
    if (!synthesis.ok) {
      return wf.report({
        partial: true,
        reason: "Deep-review synthesis failed after usable per-file evidence.",
        synthesisError: synthesis.errorMessage,
        mode: "fan-out",
        changedFiles: files.length,
        perFileReviewed: okCount,
        perFile: files.map((file, index) => ({ file, ok: perFile[index].ok, output: perFile[index].ok ? perFile[index].output : undefined, error: perFile[index].ok ? undefined : perFile[index].errorMessage })),
        usageTotal: wf.usage(),
      });
    }
    return wf.report({
      partial: perFile.some((result) => !result.ok) || undefined,
      mode: "fan-out",
      changedFiles: files.length,
      threshold: FANOUT_THRESHOLD,
      perFileReviewed: okCount,
      verdict: synthesis.output,
      perFile: files.map((file, index) => ({ file, ok: perFile[index].ok, error: perFile[index].ok ? undefined : perFile[index].errorMessage })),
      usageTotal: wf.usage(),
    });
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "BudgetExceededError") throw error;
    return wf.report({
      partial: true,
      reason: "Budget exhausted before fan-out synthesis.",
      mode: "fan-out",
      changedFiles: files.length,
      perFileReviewed: okCount,
      perFile: files.map((file, index) => ({ file, ok: perFile[index].ok, output: perFile[index].ok ? perFile[index].output : perFile[index].errorMessage })),
      usageTotal: wf.usage(),
    });
  }
}
