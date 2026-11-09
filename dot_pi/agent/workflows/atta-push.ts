// @description: Explicit PR publication/readiness lane composing authored iterate-pr; approval required; up to 6 passes/$6; never merge
// @model-invocation: explicit
// @args: <existing pull-request-number-or-url>
import type { WorkflowContext } from "pi-workflows";
// Compose the existing managed PR workflow; no nested controller.
import iteratePr from "./iterate-pr.ts";

export default async function (wf: WorkflowContext) {
  if (!/^(?:[1-9]\d{0,9}|https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/[1-9]\d{0,9})$/.test(wf.args.trim())) {
    return wf.report({ done: false, noMerge: true, reason: "Provide an explicit existing GitHub PR number or URL" });
  }
  // Only direct spawns are composed: context parallel/map closures bypass this proxy.
  // Tests guard iterate-pr against adding those paths without updating composition.
  const composed = new Proxy(wf, { get(target, key) {
    if (key === "spawn") return (spec: Parameters<WorkflowContext["spawn"]>[0]) => target.spawn({ ...spec, agent: "maker", model: "github-copilot/gpt-6.1-sol", thinking: "high", tools: ["read", "bash", "edit", "write", "codemode"], task: `${spec.task}\nNever merge or auto-merge. No nested delegation. Read github and iterate-pr skills before commands.` });
    if (key === "report") return (data: unknown) => target.report({ ...(data as Record<string, unknown>), noMerge: true, approvalBoundary: "iterate-pr explicit APPROVE before effects" });
    const value = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  return iteratePr(composed);
}
