// @description: Explicit repair loop: up to 4 sequential agents to diagnose, fix, test, and review; $5 budget
// @model-invocation: explicit
// @args: <symptom-or-failing-command>
import { execFileSync } from "node:child_process";
import type { WorkflowContext } from "pi-workflows";

const SPAWN_TIMEOUT_MS = 15 * 60 * 1000;

function readOnlyVcsStatus(cwd: string): string {
  for (const [command, args] of [
    ["jj", ["--ignore-working-copy", "--no-pager", "status"]],
    ["git", ["--no-optional-locks", "status", "--short", "--branch"]],
  ] as const) {
    try {
      return execFileSync(command, args, {
        cwd,
        encoding: "utf8",
        timeout: 10_000,
        maxBuffer: 64 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      // Try the other supported VCS without changing repository state.
    }
  }
  return "No supported VCS status available.";
}

export default async function (wf: WorkflowContext) {
  const symptom = wf.args.trim();
  if (!symptom) {
    return wf.report({ error: "Pass the observed symptom or failing command." });
  }

  wf.budget({ cost: 5 });

  const diagnosis = await wf.spawn({
    agent: "scout",
    label: "reproduce and diagnose",
    timeoutMs: SPAWN_TIMEOUT_MS,
    tools: ["read", "bash"],
    task: [
      `Diagnose this symptom: ${symptom}`,
      `Reproduce it with the smallest relevant read/test command. Read the full failure, trace the code path, and verify one root-cause hypothesis against source.`,
      `Do not edit files, commit, push, change configuration, or invoke another workflow.`,
      `Return REPRODUCTION, ROOT_CAUSE, AFFECTED_PATHS, and a focused regression command.`,
    ].join("\n\n"),
  });

  if (!diagnosis.ok) {
    return wf.report({ stage: "diagnosis", error: diagnosis.errorMessage, usageTotal: wf.usage() });
  }

  const fix = await wf.spawn({
    agent: "worker",
    label: "apply focused fix",
    timeoutMs: SPAWN_TIMEOUT_MS,
    tools: ["read", "write", "edit", "bash"],
    task: [
      `Apply the smallest focused fix for the verified diagnosis below.`,
      `Change only the affected paths. Add or update a regression test when the project has an applicable test pattern.`,
      `Run the focused regression command after editing. Do not commit, push, alter unrelated files, or invoke another workflow.`,
      `--- VERIFIED DIAGNOSIS ---`,
      diagnosis.output,
    ].join("\n\n"),
  });

  if (!fix.ok) {
    return wf.report({
      stage: "fix",
      diagnosis: diagnosis.output,
      error: fix.errorMessage,
      workingTreeChanges: readOnlyVcsStatus(wf.cwd),
      usageTotal: wf.usage(),
    });
  }

  const verification = await wf.spawn({
    agent: "reviewer",
    label: "regression and full gate",
    timeoutMs: SPAWN_TIMEOUT_MS,
    tools: ["read", "bash"],
    task: [
      `Verify the focused fix described below.`,
      `Inspect the diff, run its regression test, then run the repository's documented full validation gate if one exists.`,
      `Do not edit files, commit, push, or invoke another workflow. Report exact commands and outcomes.`,
      `--- DIAGNOSIS ---`,
      diagnosis.output,
      `--- FIX REPORT ---`,
      fix.output,
    ].join("\n\n"),
  });

  const review = await wf.spawn({
    agent: "reviewer",
    label: "review focused diff",
    timeoutMs: SPAWN_TIMEOUT_MS,
    tools: ["read", "bash"],
    task: [
      `Review the working-tree diff for the diagnosis and verification below.`,
      `Find only correctness, regression, or scope problems introduced by the fix. Do not edit, commit, push, or invoke another workflow.`,
      `Return APPROVED or NEEDS_CHANGES with evidence.`,
      `--- DIAGNOSIS ---`,
      diagnosis.output,
      `--- VERIFICATION ---`,
      verification.ok ? verification.output : verification.errorMessage ?? "verification failed",
    ].join("\n\n"),
  });

  return wf.report({
    symptom,
    diagnosis: diagnosis.output,
    fix: fix.output,
    verification: verification.ok ? verification.output : "",
    verificationError: verification.ok ? undefined : verification.errorMessage,
    review: review.ok ? review.output : "",
    reviewError: review.ok ? undefined : review.errorMessage,
    usageTotal: wf.usage(),
  });
}
