// @description: Read-only validation of one report's local links, figures, artifacts, and intended changed paths (1 agent, 5 min, $0.75)
// @model-invocation: automatic
// @args: <report-path>
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { WorkflowContext } from "pi-workflows";

const SPAWN_TIMEOUT_MS = 5 * 60 * 1000;

function reportRepository(reportPath: string): string | undefined {
  for (const [command, args] of [
    ["git", ["--no-optional-locks", "rev-parse", "--show-toplevel"]],
    ["jj", ["--ignore-working-copy", "root"]],
  ] as const) {
    try {
      return execFileSync(command, args, {
        cwd: path.dirname(reportPath),
        encoding: "utf8",
        timeout: 10_000,
        maxBuffer: 64 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      // Try the other supported VCS without changing repository state.
    }
  }
  return undefined;
}

function readOnlyVcsStatus(repository: string): string {
  for (const [command, args] of [
    ["jj", ["--ignore-working-copy", "--no-pager", "status"]],
    ["git", ["--no-optional-locks", "status", "--short", "--branch"]],
  ] as const) {
    try {
      return execFileSync(command, args, {
        cwd: repository,
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
  const requestedReportPath = wf.args.trim();
  if (!requestedReportPath) {
    return wf.report({ error: "Pass the report path to validate." });
  }

  const requestedAbsolutePath = path.resolve(wf.cwd, requestedReportPath);
  const relativeRequestedPath = path.relative(wf.cwd, requestedAbsolutePath);
  if (relativeRequestedPath === ".." || relativeRequestedPath.startsWith(`..${path.sep}`) || path.isAbsolute(relativeRequestedPath)) {
    return wf.report({ error: "Report path must be inside the workflow working directory." });
  }
  if (!fs.existsSync(requestedAbsolutePath)) {
    return wf.report({ error: `Report does not exist: ${requestedAbsolutePath}` });
  }

  const reportPath = fs.realpathSync(requestedAbsolutePath);
  const relativeReportPath = path.relative(fs.realpathSync(wf.cwd), reportPath);
  if (relativeReportPath === ".." || relativeReportPath.startsWith(`..${path.sep}`) || path.isAbsolute(relativeReportPath)) {
    return wf.report({ error: "Report path resolves outside the workflow working directory." });
  }

  const repository = reportRepository(reportPath);
  if (!repository) {
    return wf.report({ error: `No supported repository contains report: ${reportPath}` });
  }

  wf.budget({ cost: 0.75 });
  try {
    const validation = await wf.spawn({
      agent: "scout",
      label: "validate report evidence",
      tools: ["read"],
      timeoutMs: SPAWN_TIMEOUT_MS,
      task: [
        `Validate the report at: ${reportPath}`,
        `Read the report and every local linked figure or artifact it names when available. Do not fetch URLs, run commands, modify files, or execute tests.`,
        `Compare the report's stated intended changed paths against this read-only VCS status snapshot from the report repository (${repository}):`,
        readOnlyVcsStatus(repository),
        `Return a table with categories LINK, FIGURE, ARTIFACT, and CHANGED_PATH; each row must be PASS, MISSING, STALE, or UNVERIFIABLE with evidence.`,
        `Finish with VALID, NEEDS_EVIDENCE, or INVALID.`,
      ].join("\n\n"),
    });

    if (!validation.ok) {
      return wf.report({
        error: "Report validation failed.",
        validationError: validation.errorMessage,
        reportPath,
        repository,
        usageTotal: wf.usage(),
      });
    }

    return wf.report({ reportPath, repository, validation: validation.output, usageTotal: wf.usage() });
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "BudgetExceededError") throw error;
    return wf.report({
      partial: true,
      reason: "Budget exhausted before report validation.",
      reportPath,
      repository,
      usageTotal: wf.usage(),
    });
  }
}
