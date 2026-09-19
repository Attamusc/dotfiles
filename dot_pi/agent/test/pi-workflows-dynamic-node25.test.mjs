import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { requireExactCandidate } from "./pi-workflows-candidate.mjs";

const candidate = process.env.PI_WORKFLOWS_CANDIDATE;
const node25 = Number(process.versions.node.split(".")[0]) >= 25;
const revision = "1614faf29c6ad1d0fcc9fe6db86a770f34e2b129";
if (candidate) requireExactCandidate(candidate, revision);

if (!candidate || !node25) {
  test("exact-package Node 25 dynamic contract requires explicit candidate and isolated runtime", {
    skip: !candidate ? "set PI_WORKFLOWS_CANDIDATE to the verified disposable checkout" : "run under isolated Node 25+",
  }, () => {});
} else {
  const { runDynamicWorkflow } = await import(`${new URL(`file://${join(candidate, "src/sandbox.ts")}`).href}?node25`);
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 };
  let fallbackCalls = 0;
  const bridge = {
    spawn: async () => ({ agent: "scout", output: "bounded", usage, ok: true, durationMs: 1 }),
    parallel: async () => [], ask: async () => "DENY", report: value => value,
    log() {}, checkpoint() {}, usage: () => usage, budget() {},
    integrate: async (_, options) => ({ vcs: "git", conflicted: false, integrated: 0, message: options.message }),
    cleanupIsolation: async () => {}, call: async () => { fallbackCalls++; return null; },
    interactive: async () => ({ ok: false, exitCode: 1, durationMs: 0, artifactPath: "", artifact: "" }),
  };

  async function run(source, id) {
    return runDynamicWorkflow({ nodePath: process.execPath, source, args: "", cwd: process.cwd(), runId: id, signal: new AbortController().signal, bridge, timeoutMs: 8_000 });
  }

  test("exact package executes a minimal read-only dynamic workflow", async () => {
    const outcome = await run("return { value: 42, hasAskAgent: typeof askAgent !== 'undefined' }", "success");
    assert.equal(outcome.ok, true);
    assert.deepEqual(outcome.result, { value: 42, hasAskAgent: false });
    assert.equal(fallbackCalls, 0);
  });

  test("dynamic workflow denies undeclared access without import or fallback", async () => {
    const outcome = await run(`
      const fs = process.getBuiltinModule("fs");
      try { fs.readFileSync("/etc/hosts", "utf8"); return { access: "allowed" }; }
      catch (error) { return { access: "denied", code: error.code, hasRequire: typeof require !== "undefined", hasAskAgent: typeof askAgent !== "undefined" }; }
    `, "denial");
    assert.equal(outcome.ok, true);
    assert.deepEqual(outcome.result, { access: "denied", code: "ERR_ACCESS_DENIED", hasRequire: false, hasAskAgent: false });
    assert.equal(fallbackCalls, 0);
  });
}
