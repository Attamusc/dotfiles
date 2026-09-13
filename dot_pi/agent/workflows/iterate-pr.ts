// @description: Explicit PR CI iteration: up to 6 sequential worker passes, then stop with the latest state; $6 budget
// @model-invocation: explicit
// @args: [pull-request]
import type { TaskOutcomeObservation, WorkflowContext } from "pi-workflows";

/**
 * Iterate-PR pattern (ported from the iterate-pr skill).
 *
 * The feedback → fix → push → wait cycle, with the LOOP lifted out of the agent
 * and into deterministic JavaScript. Each pass spawns a FRESH agent context, which
 * removes the goal drift a single long-running agent accumulates ("I'll just fix
 * the obvious ones"). The loop owns the termination condition; the agent owns one
 * pass of work.
 *
 * Each pass, the agent (loaded with the iterate-pr skill) does exactly one cycle:
 * fetch checks + review feedback, fix root causes, verify locally, commit (commit
 * skill) and push. During the shadow period it reports the same decision twice:
 * first through task_outcome, then through one exact final legacy status line. The
 * legacy line remains authoritative while checkpoints measure agreement.
 *
 *   GREEN   → all checks pass and post-CI feedback is clean → done
 *   FAILING → checks failed; changes pushed → loop again
 *   PENDING → checks still running; nothing to do yet → loop again (agent waits next pass)
 *   BLOCKED → needs human (same failure 2×, ambiguous feedback, rebase needed) → stop
 *   NO_PR   → no PR for the branch → stop
 *
 * The shadow task_outcome mapping is:
 *   succeeded/ci-green, incomplete/fixes-pushed, incomplete/checks-pending,
 *   blocked/human-required, and failed/no-pr.
 *
 * Sequential by nature (each pass depends on the last push). MAX_PASSES caps cost.
 *
 * Usage: /iterate-pr [pr-number]   (defaults to the PR for the current branch)
 */
const MAX_PASSES = 6;
const STATUSES = ["GREEN", "FAILING", "PENDING", "BLOCKED", "NO_PR"] as const;
type Status = (typeof STATUSES)[number];
type ShadowStatus = Status | "unknown";
type Agreement = "agree" | "disagree" | "invalid-domain" | "unavailable";
const STATUS_LINE_PATTERN = /^ITERATE_STATUS:\s*(GREEN|FAILING|PENDING|BLOCKED|NO_PR)$/i;

function parseStatus(output: string): Status | null {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const statusLines = lines.filter((line) => STATUS_LINE_PATTERN.test(line));
  if (statusLines.length !== 1 || statusLines[0] !== lines.at(-1)) return null;
  const match = statusLines[0].match(STATUS_LINE_PATTERN);
  return match ? (match[1].toUpperCase() as Status) : null;
}

function structuredStatus(observation: TaskOutcomeObservation): Status | null {
  if (observation.kind !== "reported") return null;
  const { status, code } = observation.value;
  if (status === "succeeded" && code === "ci-green") return "GREEN";
  if (status === "incomplete" && code === "fixes-pushed") return "FAILING";
  if (status === "incomplete" && code === "checks-pending") return "PENDING";
  if (status === "blocked" && code === "human-required") return "BLOCKED";
  if (status === "failed" && code === "no-pr") return "NO_PR";
  return null;
}

function agreement(
  observation: TaskOutcomeObservation,
  legacyStatus: Status | null,
  reportedStatus: Status | null,
): Agreement {
  if (observation.kind !== "reported" || legacyStatus === null) return "unavailable";
  if (reportedStatus === null) return "invalid-domain";
  return reportedStatus === legacyStatus ? "agree" : "disagree";
}

export default async function (wf: WorkflowContext) {
  const prArg = wf.args.trim();
  wf.budget({ cost: 6.0 });

  const passes: Array<{
    pass: number;
    status: ShadowStatus;
    structuredStatus: ShadowStatus;
    agreement: Agreement;
    taskOutcomeObservation: TaskOutcomeObservation;
    ok: boolean;
    model: string;
    turns: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    contextTokens: number;
    cost: number;
  }> = [];

  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    wf.log("Iterate-PR pass", { pass, of: MAX_PASSES });

    const result = await wf.spawn({
      agent: "worker",
      label: `iterate-pr pass ${pass}`,
      task: [
        `Load the iterate-pr skill and run EXACTLY ONE cycle of it on ${prArg ? `PR #${prArg}` : "the PR for the current branch"}.`,
        ``,
        `One cycle means:`,
        `1. Identify the PR (stop with NO_PR if none exists).`,
        `2. Fetch CI checks and review feedback (use the skill's bundled scripts).`,
        `3. Auto-fix high/medium feedback and CI failures at the ROOT CAUSE — read the logs,`,
        `   don't guess from check names. Fix all instances, not just the mentioned one.`,
        `4. Verify your fixes LOCALLY (re-run the specific failed test / linter) before pushing.`,
        `5. Commit using the commit skill and push.`,
        `6. Reply to inline review threads you actioned (per the skill).`,
        ``,
        `Do NOT loop or sleep-poll yourself — this orchestrator owns the loop and will`,
        `re-invoke you. Do exactly one pass, then STOP.`,
        ``,
        `After completing the pass, call task_outcome exactly once with one of these pairs:`,
        `  succeeded / ci-green       = all checks pass and post-CI feedback is clean`,
        `  incomplete / fixes-pushed  = checks failed and you pushed verified fixes`,
        `  incomplete / checks-pending = checks are still running with nothing actionable`,
        `  blocked / human-required   = ambiguous feedback, repeated failure, or rebase needs a human`,
        `  failed / no-pr             = no PR exists for this branch`,
        `Include a concise summary. The observe-mode tool will then ask for the legacy line below.`,
        ``,
        `End your output with EXACTLY ONE line in the form ITERATE_STATUS: <STATUS>.`,
        `Allowed values: GREEN, FAILING, PENDING, BLOCKED, NO_PR.`,
        `  GREEN   = all checks pass AND post-CI feedback is clean`,
        `  FAILING = checks failed; you pushed fixes this pass`,
        `  PENDING = checks still running; nothing actionable yet`,
        `  BLOCKED = needs a human (same failure twice, ambiguous feedback, rebase needed)`,
        `  NO_PR   = no PR exists for this branch`,
      ].join("\n"),
      timeoutMs: 20 * 60 * 1000,
      taskOutcome: "observe",
    });

    const status = result.ok ? parseStatus(result.output) : null;
    const observedStatus = structuredStatus(result.taskOutcomeObservation);
    const observedAgreement = result.ok
      ? agreement(result.taskOutcomeObservation, status, observedStatus)
      : "unavailable";
    const passRecord = {
      pass,
      status: status ?? "unknown",
      structuredStatus: observedStatus ?? "unknown",
      agreement: observedAgreement,
      taskOutcomeObservation: result.taskOutcomeObservation,
      ok: result.ok,
      model: result.model ?? "unknown",
      turns: result.usage.turns,
      inputTokens: result.usage.input,
      outputTokens: result.usage.output,
      cacheReadTokens: result.usage.cacheRead,
      cacheWriteTokens: result.usage.cacheWrite,
      contextTokens: result.usage.contextTokens,
      cost: result.usage.cost,
    };
    passes.push(passRecord);
    wf.checkpoint(`pass-${pass}`, passRecord);

    if (!result.ok) {
      return wf.report({ done: false, reason: "agent pass failed", pass, detail: result.errorMessage, passes, usageTotal: wf.usage() });
    }
    if (status === "GREEN") {
      return wf.report({ done: true, reason: "CI green", passes: pass, history: passes, usageTotal: wf.usage() });
    }
    if (status === "BLOCKED" || status === "NO_PR") {
      return wf.report({ done: false, reason: status, passes: pass, history: passes, lastOutput: result.output, usageTotal: wf.usage() });
    }
    // FAILING / PENDING / unparseable → loop again.
  }

  return wf.report({
    done: false,
    reason: `Did not go green within ${MAX_PASSES} passes`,
    passes: MAX_PASSES,
    history: passes,
    usageTotal: wf.usage(),
  });
}
