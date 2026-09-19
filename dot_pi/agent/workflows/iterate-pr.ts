// @description: Explicit approved PR CI iteration: up to 6 sequential worker passes, then stop; $6 budget
// @model-invocation: explicit
// @args: <pull-request-number-or-url>
import { execFileSync } from "node:child_process";
import type { WorkflowContext } from "pi-workflows";

const MAX_PASSES = 6;
const MAX_RUN_MS = 2 * 60 * 60 * 1000;
const STATUS_LINE_PATTERN = /^ITERATE_STATUS:\s*(GREEN|FAILING|PENDING|BLOCKED|NO_PR)$/i;
const SIGNATURE_LINE_PATTERN = /^ITERATE_FAILURE_SIGNATURE:\s*([a-z0-9][a-z0-9._:/-]{0,119})$/i;
type Status = "GREEN" | "FAILING" | "PENDING" | "BLOCKED" | "NO_PR";

function parseProtocol(output: string): { status: Status; signature?: string } | null {
  const lines = output.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const statusLines = lines.filter(line => STATUS_LINE_PATTERN.test(line));
  const signatureLines = lines.filter(line => SIGNATURE_LINE_PATTERN.test(line));
  if (statusLines.length !== 1 || statusLines[0] !== lines.at(-1) || signatureLines.length > 1) return null;
  const status = statusLines[0].match(STATUS_LINE_PATTERN)?.[1].toUpperCase() as Status;
  const signature = signatureLines[0]?.match(SIGNATURE_LINE_PATTERN)?.[1].toLowerCase();
  if (status === "FAILING" && !signature) return null;
  return { status, signature };
}

function repository(cwd: string): string | null {
  try {
    const remote = execFileSync("git", ["--no-optional-locks", "remote", "get-url", "origin"], { cwd, encoding: "utf8", timeout: 10_000, maxBuffer: 16 * 1024, stdio: ["ignore", "pipe", "ignore"] }).trim();
    const match = remote.match(/(?:github\.com[/:])([^/]+\/[^/]+?)(?:\.git)?$/);
    return match?.[1] ?? null;
  } catch { return null; }
}

export default async function (wf: WorkflowContext) {
  const pr = wf.args.trim();
  if (!pr) return wf.report({ done: false, reason: "Pass an explicit pull request number or URL; branch inference is not permitted." });
  const repo = repository(wf.cwd);
  if (!repo) return wf.report({ done: false, reason: "Cannot identify the GitHub repository from the local origin remote." });

  const approval = await wf.ask([
    `Approve iterate-pr for repository ${repo}, PR ${pr}?`,
    "This run will use GitHub network access and credentials; inspect CI/review data; edit files; create commits; push to the PR branch; and reply to review threads.",
    `It stops after ${MAX_PASSES} passes, $6, two hours, an agent failure, BLOCKED, NO_PR, or malformed status. It never resumes after restart.`,
    "Type APPROVE to begin. Any other response denies the run before worker, network, or mutation effects.",
  ].join("\n\n"), { default: "DENY" });
  if (approval.trim() !== "APPROVE") return wf.report({ done: false, reason: "approval denied", repository: repo, pr, passes: 0 });

  wf.budget({ cost: 6 });
  const started = Date.now();
  const passes: Array<Record<string, unknown>> = [];
  let previousFailureSignature: string | undefined;
  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    const remainingMs = MAX_RUN_MS - (Date.now() - started);
    if (remainingMs <= 0) return wf.report({ done: false, reason: "time limit reached", repository: repo, pr, passes: pass - 1, history: passes, usageTotal: wf.usage() });
    const result = await wf.spawn({
      agent: "worker", label: `iterate-pr pass ${pass}`, timeoutMs: Math.min(20 * 60 * 1000, remainingMs),
      task: [
        `Perform EXACTLY ONE iteration cycle for repository ${repo}, PR ${pr}. Do not loop or sleep-poll.`,
        "Before doing anything else, verify the commit protocol/skill is available. If unavailable, make no changes and finish BLOCKED.",
        "1. Fetch bounded CI checks and review feedback using gh and the repository's existing scripts where applicable.",
        "2. If all checks pass and post-CI feedback is clean, finish GREEN without mutation.",
        "3. Otherwise fix actionable high/medium feedback and CI failures at their verified root cause. Read logs; do not guess from check names. Fix all instances.",
        "4. Run the focused local test/linter for every fix. If verification fails or the same failure repeats, finish BLOCKED.",
        "5. Using the mandatory commit protocol, commit only this pass's verified changes and push to the PR branch.",
        "6. Reply only to inline review threads actioned in this pass. Do not resolve ambiguous feedback; finish BLOCKED.",
        "For FAILING, first emit exactly one ITERATE_FAILURE_SIGNATURE: <stable-signature> line. Derive the bounded signature from stable failing check names and normalized root-cause category, not volatile IDs, timestamps, URLs, or prose.",
        previousFailureSignature ? `The preceding pass failure signature was ${previousFailureSignature}. If the same actionable failure remains, do not mutate or push; finish BLOCKED.` : "There is no preceding failure signature in this run.",
        "End with exactly one final line: ITERATE_STATUS: GREEN, FAILING, PENDING, BLOCKED, or NO_PR.",
        "FAILING means verified fixes were pushed; PENDING means checks are running and nothing is actionable and this run must stop; NO_PR means the specified PR does not exist.",
        "Never invoke another workflow and never claim this run continues after restart.",
      ].join("\n\n"),
    });
    const protocol = result.ok ? parseProtocol(result.output) : null;
    const status = protocol?.status ?? null;
    const repeatedFailure = status === "FAILING" && protocol?.signature === previousFailureSignature;
    const record = { pass, status: status ?? "unknown", failureSignature: protocol?.signature, repeatedFailure, ok: result.ok, model: result.model ?? "unknown", stopReason: result.stopReason, error: result.errorMessage, turns: result.usage.turns, inputTokens: result.usage.input, outputTokens: result.usage.output, cacheReadTokens: result.usage.cacheRead, cacheWriteTokens: result.usage.cacheWrite, contextTokens: result.usage.contextTokens, cost: result.usage.cost };
    passes.push(record);
    wf.checkpoint(`pass-${pass}`, record);
    if (!result.ok) return wf.report({ done: false, reason: "agent pass failed", repository: repo, pr, pass, detail: result.errorMessage, history: passes, usageTotal: wf.usage() });
    if (!status) return wf.report({ done: false, reason: "malformed or missing final status", repository: repo, pr, pass, lastOutput: result.output, history: passes, usageTotal: wf.usage() });
    if (status === "GREEN") return wf.report({ done: true, reason: "CI green", repository: repo, pr, passes: pass, history: passes, usageTotal: wf.usage() });
    if (repeatedFailure) return wf.report({ done: false, reason: "BLOCKED: same actionable failure repeated twice", repository: repo, pr, passes: pass, history: passes, lastOutput: result.output, usageTotal: wf.usage() });
    if (status === "PENDING") return wf.report({ done: false, reason: "PENDING: rerun explicitly after checks settle", repository: repo, pr, passes: pass, history: passes, usageTotal: wf.usage() });
    if (status === "BLOCKED" || status === "NO_PR") return wf.report({ done: false, reason: status, repository: repo, pr, passes: pass, history: passes, lastOutput: result.output, usageTotal: wf.usage() });
    previousFailureSignature = protocol?.signature;
  }
  return wf.report({ done: false, reason: `Did not go green within ${MAX_PASSES} passes`, repository: repo, pr, passes: MAX_PASSES, history: passes, usageTotal: wf.usage() });
}
