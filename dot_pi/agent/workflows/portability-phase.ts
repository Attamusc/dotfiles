// @description: Execute one Fedora portability task in an isolated workspace with protected-local-state gates and read-only review (2 agents, $4)
// @model-invocation: explicit
// @args: <commit-message> newline ---TASK--- newline <resolved-task>
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { WorkflowContext } from "pi-workflows";

const SPAWN_TIMEOUT_MS = 20 * 60 * 1000;
const TASK_SEPARATOR = "\n---TASK---\n";
const MAX_DIFF_BYTES = 256 * 1024;
const PROTECTED_TRACKED_PATHS = new Set([
  ".data/nvim/lazy-lock.json",
  ".data/tuna/config.toml",
  "dot_config/herdr/config.toml",
  "dot_config/nvim/lua/plugins/pi-hunk-review.lua",
]);

function runExact(
  wf: WorkflowContext,
  label: string,
  command: string,
  args: string[],
  cwd: string,
  maxBuffer = 128 * 1024,
): string {
  wf.log("command_start", { label, command, args, cwd: path.relative(wf.cwd, cwd) || "." });
  try {
    const output = execFileSync(command, args, {
      cwd,
      encoding: "utf8",
      timeout: 5 * 60 * 1000,
      maxBuffer,
      stdio: ["ignore", "pipe", "pipe"],
    });
    wf.log("command_end", { label, status: 0 });
    return output.trim();
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error ? error.status : "unknown";
    wf.log("command_end", { label, status });
    throw new Error(`${label} failed with status ${status}`);
  }
}

function snapshotArgs(cwd: string, output: string): string[] {
  return [
    path.join(cwd, "scripts/protected-local-state.py"),
    "snapshot",
    "--repo", cwd,
    "--output", output,
    "--path", `tracked-lazy-lock=${path.join(cwd, ".data/nvim/lazy-lock.json")}`,
    "--path", `tracked-tuna=${path.join(cwd, ".data/tuna/config.toml")}`,
    "--path", `tracked-herdr=${path.join(cwd, "dot_config/herdr/config.toml")}`,
    "--path", `tracked-hunk-review=${path.join(cwd, "dot_config/nvim/lua/plugins/pi-hunk-review.lua")}`,
  ];
}

function captureProtectedState(wf: WorkflowContext, output: string, label: string): void {
  runExact(wf, label, "python3", snapshotArgs(wf.cwd, output), wf.cwd);
}

function compareProtectedState(wf: WorkflowContext, before: string, after: string, label: string): void {
  runExact(wf, label, "python3", [
    path.join(wf.cwd, "scripts/protected-local-state.py"),
    "compare",
    "--before", before,
    "--after", after,
  ], wf.cwd);
}

type CapturedDiff = { paths: string[]; patch: string; digest: string };

function isolatedDiff(cwd: string, vcs: "jj" | "git", changeId: string): CapturedDiff {
  const command = vcs === "jj" ? "jj" : "git";
  const common = vcs === "jj" ? ["--ignore-working-copy", "--no-pager"] : [];
  const pathArgs = vcs === "jj"
    ? [...common, "diff", "--name-only", "-r", changeId]
    : ["show", "--format=", "--name-only", changeId];
  const patchArgs = vcs === "jj"
    ? [...common, "diff", "--git", "-r", changeId]
    : ["show", "--format=", "--patch", changeId];

  const paths = execFileSync(command, pathArgs, {
    cwd,
    encoding: "utf8",
    timeout: 15_000,
    maxBuffer: 128 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  }).split("\n").filter(Boolean);
  const patch = execFileSync(command, patchArgs, {
    cwd,
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: MAX_DIFF_BYTES,
    stdio: ["ignore", "pipe", "ignore"],
  });
  const digest = createHash("sha256")
    .update(JSON.stringify(paths))
    .update("\0")
    .update(patch)
    .digest("hex");
  return { paths, patch, digest };
}

function assertSameDiff(expected: CapturedDiff, actual: CapturedDiff, stage: string): void {
  if (expected.digest !== actual.digest || JSON.stringify(expected.paths) !== JSON.stringify(actual.paths)) {
    throw new Error(`isolated change drifted after ${stage}; refusing integration`);
  }
}

function vcsStatus(cwd: string): string {
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
      // Try the other supported VCS.
    }
  }
  return "No supported VCS status available.";
}

function parseArgs(raw: string): { message: string; task: string } | undefined {
  const separator = raw.indexOf(TASK_SEPARATOR);
  if (separator < 1) return undefined;
  const message = raw.slice(0, separator).trim();
  const task = raw.slice(separator + TASK_SEPARATOR.length).trim();
  return message && task ? { message, task } : undefined;
}

export default async function (wf: WorkflowContext) {
  const request = parseArgs(wf.args);
  if (!request) {
    return wf.report({
      error: "Arguments must be: <commit-message> newline ---TASK--- newline <resolved-task>.",
    });
  }

  wf.budget({ cost: 4.0 });
  const guardDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "portability-phase-guard."));
  fs.chmodSync(guardDirectory, 0o700);
  const baseline = path.join(guardDirectory, "baseline.json");
  let lastSnapshot = baseline;
  let stage = "preflight";

  const assertProtectedState = (checkpoint: string) => {
    const next = path.join(guardDirectory, `${checkpoint}.json`);
    captureProtectedState(wf, next, `capture protected state: ${checkpoint}`);
    compareProtectedState(wf, baseline, next, `compare protected state: ${checkpoint}`);
    lastSnapshot = next;
    wf.checkpoint(checkpoint, { protectedIgnoredState: "unchanged" });
  };

  try {
    captureProtectedState(wf, baseline, "capture protected state: baseline");
    wf.checkpoint("baseline", {
      trackedGitState: "recorded separately",
      protectedIgnoredState: "captured",
    });

    stage = "implementation";
    const implementation = await wf.spawn({
      agent: "worker",
      isolate: true,
      label: "isolated portability implementation",
      tools: ["read", "write", "edit"],
      timeoutMs: SPAWN_TIMEOUT_MS,
      task: [
        "Implement the resolved Fedora portability task below in your isolated VCS workspace.",
        "Read the plan and repository conventions first. Edit only task-owned tracked paths.",
        "Do not access absolute paths outside your isolated workspace. Do not inspect, create, edit, move, or remove `.data-private`, `.local-skills`, home-local configuration, credentials, or the four protected tracked paths named by the plan.",
        "You intentionally have no shell tool. Do not run tests, commit, stage, invoke workflows, or update todos; the orchestrator performs exact validation and integration.",
        "--- RESOLVED TASK ---",
        request.task,
      ].join("\n\n"),
    });

    assertProtectedState("after-worker");
    if (!implementation.ok || !implementation.isolation?.path || !implementation.isolation.changeId) {
      await wf.cleanupIsolation();
      return wf.report({
        stage,
        error: implementation.errorMessage ?? "Isolated worker produced no captured change.",
        trackedGitStatus: vcsStatus(wf.cwd),
        protectedIgnoredState: "unchanged",
        usageTotal: wf.usage(),
      });
    }

    const isolated = implementation.isolation.path;
    const isolatedVcs = implementation.isolation.vcs;
    const isolatedChangeId = implementation.isolation.changeId;
    const diff = isolatedDiff(isolated, isolatedVcs, isolatedChangeId);
    const protectedChanges = diff.paths.filter((changedPath) => PROTECTED_TRACKED_PATHS.has(changedPath));
    if (protectedChanges.length > 0) {
      await wf.cleanupIsolation();
      return wf.report({
        stage,
        error: "Isolated change touched protected tracked paths.",
        protectedChanges,
        trackedGitStatus: vcsStatus(wf.cwd),
        protectedIgnoredState: "unchanged",
        usageTotal: wf.usage(),
      });
    }

    stage = "validation";
    const bashSyntax = runExact(wf, "bash syntax", "bash", ["-n", "scripts/check-portability.sh"], isolated);
    const portabilityCheck = runExact(wf, "portability check", "bash", ["scripts/check-portability.sh"], isolated, 256 * 1024);
    runExact(wf, "diff whitespace", "git", ["diff", "--check", "HEAD"], isolated);
    assertSameDiff(diff, isolatedDiff(isolated, isolatedVcs, isolatedChangeId), "validation");
    assertProtectedState("after-validation");

    stage = "review";
    const review = await wf.spawn({
      agent: "reviewer",
      cwd: isolated,
      label: "read-only portability review",
      tools: ["read"],
      timeoutMs: SPAWN_TIMEOUT_MS,
      task: [
        "Review this isolated Fedora portability change. You have read-only tooling by design.",
        "Inspect every changed file named below. Check correctness, task scope, repository conventions, and whether tests cover the declared behavior.",
        "Do not run commands, edit files, commit, invoke workflows, inspect paths outside this isolated workspace, or access private/local state.",
        "Return a first line of exactly APPROVED or NEEDS_CHANGES, followed by concise findings with file references.",
        "--- RESOLVED TASK ---",
        request.task,
        "--- CHANGED PATHS ---",
        diff.paths.join("\n"),
        "--- PATCH ---",
        diff.patch,
        "--- ORCHESTRATOR VALIDATION ---",
        `bash -n status: 0${bashSyntax ? `\n${bashSyntax}` : ""}`,
        portabilityCheck,
        "git diff --check HEAD status: 0",
      ].join("\n\n"),
    });

    assertSameDiff(diff, isolatedDiff(isolated, isolatedVcs, isolatedChangeId), "review");
    assertProtectedState("after-review");
    if (!review.ok || !review.output.trimStart().startsWith("APPROVED")) {
      await wf.cleanupIsolation();
      return wf.report({
        stage,
        implementation: implementation.output,
        review: review.ok ? review.output : undefined,
        reviewError: review.ok ? undefined : review.errorMessage,
        trackedGitStatus: vcsStatus(wf.cwd),
        protectedIgnoredState: "unchanged",
        usageTotal: wf.usage(),
      });
    }

    stage = "integration";
    const integrated = await wf.integrate([implementation], { message: request.message });
    assertProtectedState("after-integration");
    if (!integrated.changeId || integrated.conflicted) {
      return wf.report({
        stage,
        error: integrated.conflicted ? "Integration produced conflicts." : "Integration produced no change.",
        integration: integrated,
        trackedGitStatus: vcsStatus(wf.cwd),
        protectedIgnoredState: "unchanged",
        usageTotal: wf.usage(),
      });
    }

    stage = "post-integration-validation";
    const finalCheck = runExact(wf, "post-integration portability check", "bash", ["scripts/check-portability.sh"], wf.cwd, 256 * 1024);
    assertProtectedState("complete");

    return wf.report({
      stage: "complete",
      implementation: implementation.output,
      review: review.output,
      integration: integrated,
      validation: finalCheck,
      trackedGitStatus: vcsStatus(wf.cwd),
      protectedIgnoredState: "unchanged",
      usageTotal: wf.usage(),
    });
  } catch (error) {
    try {
      if (fs.existsSync(baseline)) assertProtectedState("failure-boundary");
    } catch (guardError) {
      return wf.report({
        stage,
        error: error instanceof Error ? error.message : String(error),
        protectedStateError: guardError instanceof Error ? guardError.message : String(guardError),
        trackedGitStatus: vcsStatus(wf.cwd),
        protectedIgnoredState: "CHANGED",
        usageTotal: wf.usage(),
      });
    }
    return wf.report({
      stage,
      error: error instanceof Error ? error.message : String(error),
      trackedGitStatus: vcsStatus(wf.cwd),
      protectedIgnoredState: "unchanged",
      usageTotal: wf.usage(),
    });
  } finally {
    await wf.cleanupIsolation();
    fs.rmSync(guardDirectory, { recursive: true, force: true });
    void lastSnapshot;
  }
}
