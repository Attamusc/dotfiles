import test from "node:test";
import assert from "node:assert/strict";
import iteratePr from "../workflows/iterate-pr.ts";

const ZERO = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 };
function result(output = "ITERATE_STATUS: GREEN", ok = true) { return { agent: "worker", output, ok, durationMs: 1, model: "fake", usage: { ...ZERO, cost: .1, turns: 1 }, ...(ok ? {} : { errorMessage: "worker failed" }) }; }
function harness(results, answer = "APPROVE") {
  const queue = [...results], spawns = [], checkpoints = [], asks = [];
  const wf = { args: "42", cwd: process.cwd(), runId: "fake", budgetValue: undefined,
    budget(v) { this.budgetValue = v; }, log() {}, usage() { return { ...ZERO, cost: spawns.length * .1 }; }, report(v) { return v; },
    async ask(question, options) { asks.push({ question, options }); return answer; },
    async spawn(spec) { spawns.push(spec); return queue.shift(); }, checkpoint(label, state) { checkpoints.push({ label, state }); } };
  return { wf, spawns, checkpoints, asks };
}

test("denial occurs before budget, spawn, network, or mutation work", async () => {
  const h = harness([], "DENY");
  const report = await iteratePr(h.wf);
  assert.equal(report.reason, "approval denied");
  assert.equal(h.spawns.length, 0);
  assert.equal(h.wf.budgetValue, undefined);
  assert.match(h.asks[0].question, /Attamusc\/dotfiles.*PR 42/s);
  assert.match(h.asks[0].question, /network access and credentials.*commits.*push.*reply/s);
});

test("approved run uses supported legacy final status only", async () => {
  const h = harness([result()]);
  const report = await iteratePr(h.wf);
  assert.equal(report.done, true);
  assert.deepEqual(h.wf.budgetValue, { cost: 6 });
  assert.equal(h.spawns[0].taskOutcome, undefined);
  assert.match(h.spawns[0].task, /commit protocol\/skill is available/);
  assert.equal(h.checkpoints[0].state.status, "GREEN");
  assert.equal("taskOutcomeObservation" in h.checkpoints[0].state, false);
});

test("BLOCKED and agent failure stop with partial evidence", async () => {
  for (const [entry, reason] of [[result("details\nITERATE_STATUS: BLOCKED"), "BLOCKED"], [result("", false), "agent pass failed"]]) {
    const h = harness([entry]);
    const report = await iteratePr(h.wf);
    assert.equal(report.reason, reason);
    assert.equal(report.history.length, 1);
    assert.equal(h.spawns.length, 1);
  }
});

test("PENDING stops after one pass for a later explicit invocation", async () => {
  const h = harness([result("ITERATE_STATUS: PENDING")]);
  const report = await iteratePr(h.wf);
  assert.equal(h.spawns.length, 1);
  assert.match(report.reason, /^PENDING/);
});

test("same stable failure signature twice stops BLOCKED", async () => {
  const failing = result("ITERATE_FAILURE_SIGNATURE: ci/test-timeout\nITERATE_STATUS: FAILING");
  const h = harness([failing, failing]);
  const report = await iteratePr(h.wf);
  assert.equal(h.spawns.length, 2);
  assert.match(report.reason, /same actionable failure repeated twice/);
  assert.match(h.spawns[1].task, /preceding pass failure signature was ci\/test-timeout/);
});

test("six distinct failures enforce the finite pass stop", async () => {
  const h = harness(Array.from({ length: 6 }, (_, index) => result(`ITERATE_FAILURE_SIGNATURE: ci/failure-${index}\nITERATE_STATUS: FAILING`)));
  const report = await iteratePr(h.wf);
  assert.equal(h.spawns.length, 6);
  assert.match(report.reason, /within 6 passes/);
});

test("spawn timeout is capped by remaining hard run time", async () => {
  const original = Date.now;
  let calls = 0;
  Date.now = () => calls++ === 0 ? 1_000 : 1_000 + (2 * 60 * 60 * 1000) - 12_345;
  try {
    const h = harness([result()]);
    await iteratePr(h.wf);
    assert.equal(h.spawns[0].timeoutMs, 12_345);
  } finally { Date.now = original; }
});

for (const output of ["Example: ITERATE_STATUS: GREEN\nNo final status", "ITERATE_STATUS: GREEN-ish", "ITERATE_STATUS: FAILING\nITERATE_STATUS: GREEN", "ITERATE_STATUS: GREEN\nTrailing prose"]) {
  test(`malformed legacy status stops safely: ${output.split("\\n")[0]}`, async () => {
    const h = harness([result(output)]);
    const report = await iteratePr(h.wf);
    assert.equal(report.reason, "malformed or missing final status");
    assert.equal(h.spawns.length, 1);
  });
}
