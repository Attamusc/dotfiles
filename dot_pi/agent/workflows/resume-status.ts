// @description: Read-only safe-frontier status from a handoff or plan, VCS, todo records, and recorded test state (4 agents, concurrency 3, $1.50)
// @model-invocation: automatic
// @args: [handoff-or-plan-path]
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SpawnResult, WorkflowContext } from "pi-workflows";

const SPAWN_TIMEOUT_MS = 4 * 60 * 1000;
const MAX_TODO_RECORDS = 12;
const TERMINAL_TODO_STATUSES = new Set(["done", "closed", "wontfix"]);

type TodoFrontMatter = {
  id?: unknown;
  status?: unknown;
  assigned_to_session?: unknown;
};

type TodoRecord = {
  path: string;
  id: string;
  body: string;
  status: string;
  assigned: boolean;
  modifiedAt: number;
};

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

function leadingJsonObject(content: string): { frontMatter: TodoFrontMatter; body: string } | undefined {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  let started = false;
  for (let index = 0; index < content.length; index++) {
    const character = content[index];
    if (!started) {
      if (/\s/.test(character)) continue;
      if (character !== "{") return undefined;
      started = true;
      depth = 1;
      continue;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "{") depth++;
    else if (character === "}" && --depth === 0) {
      try {
        const frontMatter = JSON.parse(content.slice(0, index + 1)) as TodoFrontMatter;
        return frontMatter && typeof frontMatter === "object"
          ? { frontMatter, body: content.slice(index + 1) }
          : undefined;
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

function todoRecordPaths(cwd: string): string[] {
  const todoDirectory = process.env.PI_TODO_PATH
    || path.join(os.homedir(), ".pi", "history", path.basename(path.resolve(cwd)), "todos");
  try {
    const records = fs.readdirSync(todoDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .flatMap((entry): TodoRecord[] => {
        const recordPath = path.join(todoDirectory, entry.name);
        try {
          const parsed = leadingJsonObject(fs.readFileSync(recordPath, "utf8"));
          if (!parsed) return [];
          const status = typeof parsed.frontMatter.status === "string" ? parsed.frontMatter.status.trim().toLowerCase() : "";
          const assigned = typeof parsed.frontMatter.assigned_to_session === "string" && parsed.frontMatter.assigned_to_session.trim() !== "";
          return [{
            path: recordPath,
            id: typeof parsed.frontMatter.id === "string" ? parsed.frontMatter.id : path.basename(entry.name, ".md"),
            body: parsed.body,
            status,
            assigned,
            modifiedAt: fs.statSync(recordPath).mtimeMs,
          }];
        } catch {
          return [];
        }
      });
    const active = records.filter((record) => !TERMINAL_TODO_STATUSES.has(record.status));
    const included = active.filter((record) => record.assigned || !TERMINAL_TODO_STATUSES.has(record.status));
    const blockerIds = new Set(included.flatMap(({ body }) =>
      [...body.matchAll(/^Blocked by:\s*(.+)$/gim)].flatMap(([, blockers]) =>
        blockers.match(/(?:TODO-)?([a-f0-9]{8})\b/gi)?.map((id) => id.replace(/^TODO-/i, "").toLowerCase()) ?? [],
      ),
    ));
    return records
      .filter((record) => active.includes(record) || record.assigned || blockerIds.has(record.id.toLowerCase()))
      .sort((a, b) => b.modifiedAt - a.modifiedAt || b.path.localeCompare(a.path))
      .slice(0, MAX_TODO_RECORDS)
      .map(({ path: recordPath }) => recordPath);
  } catch {
    return [];
  }
}

export default async function (wf: WorkflowContext) {
  const handoffOrPlanPath = wf.args.trim();
  const todoPaths = todoRecordPaths(wf.cwd);
  const vcsStatus = readOnlyVcsStatus(wf.cwd);
  wf.budget({ cost: 1.5 });

  let inputs: SpawnResult[];
  try {
    inputs = await wf.parallel([
      {
        agent: "scout",
        label: "read handoff or plan",
        tools: ["read"],
        timeoutMs: SPAWN_TIMEOUT_MS,
        task: handoffOrPlanPath
          ? [
              `Read the handoff or plan at: ${handoffOrPlanPath}`,
              `Extract completed work, blockers, remaining tasks, intended paths, and the last recorded test results.`,
              `Do not run tests, execute commands, or modify files.`,
            ].join("\n")
          : `No handoff or plan path was supplied. Report that this evidence is unavailable; do not inspect or modify files.`,
      },
      {
        agent: "scout",
        label: "read todo records",
        tools: ["read"],
        timeoutMs: SPAWN_TIMEOUT_MS,
        task: todoPaths.length > 0
          ? [
              `Read these task-tracker records:`,
              ...todoPaths,
              `Summarize all active work (every status except done, closed, or wontfix), including needs-triage, needs-info, ready-for-agent, and ready-for-human. Retain assigned items and every direct blocker. Do not modify anything.`,
            ].join("\n")
          : `No task-tracker records were found. Report that this evidence is unavailable; do not inspect or modify files.`,
      },
      {
        agent: "scout",
        label: "interpret VCS status",
        tools: ["read"],
        timeoutMs: SPAWN_TIMEOUT_MS,
        task: [
          `Interpret this read-only VCS status snapshot for the current working directory:`,
          vcsStatus || "Clean working tree or no status output.",
          `State the safe mutation frontier and any conflict with an intended path. Do not run commands or modify files.`,
        ].join("\n"),
      },
    ], { concurrency: 3 });
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "BudgetExceededError") throw error;
    return wf.report({
      partial: true,
      reason: "Budget exhausted before safe-frontier evidence collection completed.",
      handoffOrPlanPath: handoffOrPlanPath || undefined,
      todoRecordsConsidered: todoPaths.length,
      vcsStatus,
      usageTotal: wf.usage(),
    });
  }

  if (inputs.every((input) => !input.ok)) {
    return wf.report({
      error: "All safe-frontier evidence phases failed.",
      handoffOrPlanPath: handoffOrPlanPath || undefined,
      todoRecordsConsidered: todoPaths.length,
      vcsStatus,
      evidenceErrors: inputs.map((input) => input.errorMessage),
      usageTotal: wf.usage(),
    });
  }

  try {
    const synthesis = await wf.spawn({
      agent: "reviewer",
      label: "reconcile safe frontier",
      tools: ["read"],
      timeoutMs: SPAWN_TIMEOUT_MS,
      task: [
        `Reconcile the handoff/plan, VCS, todo, and recorded test evidence below.`,
        `Return: (1) confirmed current state, (2) conflicts or missing evidence, and (3) the next safe action.`,
        `Do not resume work, run tests, edit files, commit, or invoke another workflow.`,
        `--- HANDOFF OR PLAN ---`,
        inputs[0].ok ? inputs[0].output : inputs[0].errorMessage ?? "unavailable",
        `--- TODO RECORDS ---`,
        inputs[1].ok ? inputs[1].output : inputs[1].errorMessage ?? "unavailable",
        `--- VCS ---`,
        inputs[2].ok ? inputs[2].output : inputs[2].errorMessage ?? "unavailable",
      ].join("\n"),
    });

    if (!synthesis.ok) {
      return wf.report({
        partial: true,
        reason: "Safe-frontier synthesis failed after usable evidence was collected.",
        synthesisError: synthesis.errorMessage,
        handoffOrPlanPath: handoffOrPlanPath || undefined,
        todoRecordsConsidered: todoPaths.length,
        vcsStatus,
        evidence: inputs.map((input) => input.ok ? input.output : input.errorMessage),
        usageTotal: wf.usage(),
      });
    }

    return wf.report({
      partial: inputs.some((input) => !input.ok) || undefined,
      handoffOrPlanPath: handoffOrPlanPath || undefined,
      todoRecordsConsidered: todoPaths.length,
      vcsStatus,
      safeFrontier: synthesis.output,
      evidenceErrors: inputs.some((input) => !input.ok) ? inputs.map((input) => input.ok ? undefined : input.errorMessage) : undefined,
      usageTotal: wf.usage(),
    });
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "BudgetExceededError") throw error;
    return wf.report({
      partial: true,
      reason: "Budget exhausted before safe-frontier synthesis.",
      handoffOrPlanPath: handoffOrPlanPath || undefined,
      todoRecordsConsidered: todoPaths.length,
      vcsStatus,
      evidence: inputs.map((input) => input.ok ? input.output : input.errorMessage),
      usageTotal: wf.usage(),
    });
  }
}
