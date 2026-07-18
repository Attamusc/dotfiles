// @description: Explicit PR CI iteration: up to 6 sequential worker passes, then stop with the latest state; $6 budget
// @model-invocation: explicit
// @args: [pull-request]
import type { WorkflowContext } from "pi-workflows";

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
 * skill) and push. It must end its output with a status line the loop parses:
 *
 *   ITERATE_STATUS: GREEN | FAILING | PENDING | BLOCKED | NO_PR
 *
 *   GREEN   → all checks pass and post-CI feedback is clean → done
 *   FAILING → checks failed; changes pushed → loop again
 *   PENDING → checks still running; nothing to do yet → loop again (agent waits next pass)
 *   BLOCKED → needs human (same failure 2×, ambiguous feedback, rebase needed) → stop
 *   NO_PR   → no PR for the branch → stop
 *
 * Sequential by nature (each pass depends on the last push). MAX_PASSES caps cost.
 *
 * Usage: /iterate-pr [pr-number]   (defaults to the PR for the current branch)
 */
const MAX_PASSES = 6;
const STATUSES = ["GREEN", "FAILING", "PENDING", "BLOCKED", "NO_PR"] as const;
type Status = (typeof STATUSES)[number];

function parseStatus(output: string): Status | null {
  const m = output.match(/ITERATE_STATUS:\s*(GREEN|FAILING|PENDING|BLOCKED|NO_PR)/i);
  return m ? (m[1].toUpperCase() as Status) : null;
}

export default async function (wf: WorkflowContext) {
  const prArg = wf.args.trim();
  wf.budget({ cost: 6.0 });

  const passes: Array<{ pass: number; status: Status | null; ok: boolean }> = [];

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
        `End your output with EXACTLY ONE line:`,
        `ITERATE_STATUS: GREEN | FAILING | PENDING | BLOCKED | NO_PR`,
        `  GREEN   = all checks pass AND post-CI feedback is clean`,
        `  FAILING = checks failed; you pushed fixes this pass`,
        `  PENDING = checks still running; nothing actionable yet`,
        `  BLOCKED = needs a human (same failure twice, ambiguous feedback, rebase needed)`,
        `  NO_PR   = no PR exists for this branch`,
      ].join("\n"),
      timeoutMs: 20 * 60 * 1000,
    });

    const status = result.ok ? parseStatus(result.output) : null;
    passes.push({ pass, status, ok: result.ok });
    wf.checkpoint(`pass-${pass}`, { status: status ?? "unknown", ok: result.ok });

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
