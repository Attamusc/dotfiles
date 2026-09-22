import test from "node:test";
import assert from "node:assert/strict";
import iteratePr from "../workflows/iterate-pr.ts";

const ZERO_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  cost: 0,
  contextTokens: 0,
  turns: 0,
};

function result({
  output = "ITERATE_STATUS: GREEN",
  ok = true,
  taskOutcomeObservation = {
    kind: "reported",
    soleToolBatch: true,
    value: {
      protocol: "agent-task-outcome",
      version: 1,
      status: "succeeded",
      code: "ci-green",
      summary: "CI is green",
    },
  },
} = {}) {
  return {
    agent: "worker",
    output,
    ok,
    durationMs: 10,
    model: "github-copilot/gpt-6-sol",
    usage: { ...ZERO_USAGE, input: 10, output: 5, cost: 0.01, contextTokens: 15, turns: 2 },
    taskOutcomeObservation,
    ...(ok ? {} : { errorMessage: "worker failed" }),
  };
}

function harness(results) {
  const queue = [...results];
  const spawns = [];
  const checkpoints = [];
  const reports = [];
  const logs = [];
  let budget;
  const wf = {
    args: "42",
    cwd: "/repo",
    runId: "run-1",
    budget(value) { budget = value; },
    log(message, fields) { logs.push({ message, fields }); },
    async spawn(spec) {
      spawns.push(spec);
      if (queue.length === 0) throw new Error("missing canned result");
      return queue.shift();
    },
    checkpoint(label, state) { checkpoints.push({ label, state }); },
    report(value) { reports.push(value); return value; },
    usage() { return { ...ZERO_USAGE, input: spawns.length * 10, output: spawns.length * 5, cost: spawns.length * 0.01, contextTokens: 15, turns: spawns.length * 2 }; },
  };
  return { wf, spawns, checkpoints, reports, logs, budget: () => budget };
}

test("observe mode records agreement while legacy status remains authoritative", async () => {
  const h = harness([result()]);
  const report = await iteratePr(h.wf);

  assert.equal(h.spawns.length, 1);
  assert.equal(h.spawns[0].taskOutcome, "observe");
  assert.equal(report.done, true);
  assert.equal(report.reason, "CI green");
  assert.deepEqual(h.checkpoints[0], {
    label: "pass-1",
    state: {
      pass: 1,
      status: "GREEN",
      ok: true,
      taskOutcomeObservation: result().taskOutcomeObservation,
      structuredStatus: "GREEN",
      agreement: "agree",
      model: "github-copilot/gpt-6-sol",
      turns: 2,
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      contextTokens: 15,
      cost: 0.01,
    },
  });
  assert.deepEqual(h.budget(), { cost: 6 });
});

test("structured disagreement is diagnostic and legacy status controls shadow mode", async () => {
  const h = harness([result({
    taskOutcomeObservation: {
      kind: "reported",
      soleToolBatch: true,
      value: {
        protocol: "agent-task-outcome",
        version: 1,
        status: "incomplete",
        code: "checks-pending",
        summary: "Checks pending",
      },
    },
  })]);

  const report = await iteratePr(h.wf);
  assert.equal(report.done, true);
  assert.equal(h.checkpoints[0].state.agreement, "disagree");
  assert.equal(h.checkpoints[0].state.structuredStatus, "PENDING");
});

test("missing structured report is diagnostic and does not change legacy control", async () => {
  const h = harness([result({
    taskOutcomeObservation: {
      kind: "invalid",
      code: "missing",
      message: "missing",
    },
  })]);

  const report = await iteratePr(h.wf);
  assert.equal(report.done, true);
  assert.equal(h.checkpoints[0].state.taskOutcomeObservation.kind, "invalid");
  assert.equal(h.checkpoints[0].state.taskOutcomeObservation.code, "missing");
  assert.equal(h.checkpoints[0].state.agreement, "unavailable");
});

for (const protocolCode of ["malformed", "duplicate"]) {
  test(`${protocolCode} structured report is diagnostic and does not change legacy control`, async () => {
    const h = harness([result({
      taskOutcomeObservation: {
        kind: "invalid",
        code: protocolCode,
        message: protocolCode,
      },
    })]);

    const report = await iteratePr(h.wf);
    assert.equal(report.done, true);
    assert.equal(h.checkpoints[0].state.taskOutcomeObservation.code, protocolCode);
    assert.equal(h.checkpoints[0].state.agreement, "unavailable");
  });
}

test("non-sole structured report is recorded while legacy pending continues", async () => {
  const pending = result({
    output: "ITERATE_STATUS: PENDING",
    taskOutcomeObservation: {
      kind: "reported",
      soleToolBatch: false,
      value: {
        protocol: "agent-task-outcome",
        version: 1,
        status: "incomplete",
        code: "checks-pending",
        summary: "Checks pending",
      },
    },
  });
  const h = harness([pending, result()]);

  const report = await iteratePr(h.wf);
  assert.equal(report.done, true);
  assert.equal(h.spawns.length, 2);
  assert.equal(h.checkpoints[0].state.taskOutcomeObservation.soleToolBatch, false);
  assert.equal(h.checkpoints[0].state.agreement, "agree");
});

test("mismatched structured status and code is recorded as invalid-domain", async () => {
  const h = harness([result({
    taskOutcomeObservation: {
      kind: "reported",
      soleToolBatch: true,
      value: {
        protocol: "agent-task-outcome",
        version: 1,
        status: "succeeded",
        code: "checks-pending",
        summary: "Contradictory pair",
      },
    },
  })]);

  const report = await iteratePr(h.wf);
  assert.equal(report.done, true);
  assert.equal(h.checkpoints[0].state.structuredStatus, "unknown");
  assert.equal(h.checkpoints[0].state.agreement, "invalid-domain");
});

for (const [name, output] of [
  ["quoted marker", "Example: ITERATE_STATUS: GREEN\nNo final status"],
  ["status suffix", "ITERATE_STATUS: GREEN-ish"],
  ["duplicate markers", "ITERATE_STATUS: FAILING\nITERATE_STATUS: GREEN"],
  ["non-final marker", "ITERATE_STATUS: GREEN\nTrailing prose"],
]) {
  test(`hardened legacy parser rejects ${name}`, async () => {
    const h = harness(Array.from({ length: 6 }, () => result({ output })));
    const report = await iteratePr(h.wf);
    assert.equal(h.spawns.length, 6);
    assert.equal(report.done, false);
    assert.match(report.reason, /Did not go green/);
    assert.ok(h.checkpoints.every((checkpoint) => checkpoint.state.status === "unknown"));
  });
}

test("execution failure wins and is excluded from structured compliance", async () => {
  const h = harness([result({
    ok: false,
    output: "ITERATE_STATUS: GREEN",
    taskOutcomeObservation: { kind: "unknown", reason: "execution-failed" },
  })]);

  const report = await iteratePr(h.wf);
  assert.equal(report.done, false);
  assert.equal(report.reason, "agent pass failed");
  assert.equal(h.spawns.length, 1);
  assert.equal(h.checkpoints[0].state.taskOutcomeObservation.kind, "unknown");
  assert.equal(h.checkpoints[0].state.agreement, "unavailable");
});
