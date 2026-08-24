import assert from "node:assert/strict";
import { test } from "node:test";
import { createUsageLifecycle } from "../extensions/subscription-usage/lifecycle.ts";

const snapshots = {
  "openai-codex": { providerId: "openai-codex", providerName: "Codex", windows: [] },
  anthropic: { providerId: "anthropic", providerName: "Claude", windows: [] },
};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness(fetchUsage = async (providerId) => snapshots[providerId], historyOverrides = {}) {
  const records = [];
  const footer = [];
  const history = {
    record: (snapshot, reason) => records.push({ snapshot, reason }),
    health: () => ({ enabled: true }),
    flush: async () => {},
    ...historyOverrides,
  };
  const lifecycle = createUsageLifecycle({
    fetchUsage,
    createHistory: () => history,
    updateFooter: (state, ctx) => footer.push({ state, ctx }),
  });
  return { lifecycle, records, footer, history };
}

for (const [method, reason] of [
  ["sessionStart", "session_start"],
  ["modelSelect", "model_select"],
  ["agentSettled", "agent_settled"],
  ["usage", "usage"],
]) {
  test(`${method} records accepted refreshes with ${reason} reason`, async () => {
    const { lifecycle, records } = harness();
    const ctx = { hasUI: true, model: { provider: "openai-codex" } };
    if (method === "modelSelect") await lifecycle[method]({ model: ctx.model }, ctx);
    else await lifecycle[method]({}, ctx);
    assert.ok(records.length >= 1);
    assert.ok(records.every((record) => record.reason === reason));
  });
}

test("failed and stale refreshes are not recorded", async () => {
  const old = deferred();
  let calls = 0;
  const { lifecycle, records } = harness(async () => ++calls === 1 ? old.promise : snapshots["openai-codex"]);
  const ctx = { hasUI: true, model: { provider: "openai-codex" } };
  const stale = lifecycle.modelSelect({ model: ctx.model }, ctx);
  await lifecycle.modelSelect({ model: ctx.model }, ctx);
  old.resolve(snapshots["openai-codex"]);
  await stale;
  assert.equal(records.length, 1);

  const failed = harness(async () => { throw new Error("offline"); });
  await failed.lifecycle.modelSelect({ model: ctx.model }, ctx);
  assert.equal(failed.records.length, 0);
});

test("history failures do not suppress successful state and footer updates", async () => {
  const { lifecycle, footer } = harness(undefined, {
    record: () => { throw new Error("history failed"); },
    health: () => { throw new Error("health failed"); },
  });
  const ctx = { hasUI: true, model: { provider: "openai-codex" } };
  await lifecycle.modelSelect({ model: ctx.model }, ctx);
  assert.equal(lifecycle.state().snapshots.get("openai-codex"), snapshots["openai-codex"]);
  assert.equal(footer.length, 2);
  assert.deepEqual(lifecycle.historyHealth(), { enabled: false, diagnostic: "storage_unavailable" });
});

test("rejected history records remain best effort", async () => {
  const { lifecycle, footer } = harness(undefined, {
    record: () => Promise.reject(new Error("async history failed")),
  });
  const ctx = { hasUI: true, model: { provider: "openai-codex" } };
  await lifecycle.modelSelect({ model: ctx.model }, ctx);
  await Promise.resolve();
  assert.equal(footer.length, 2);
  assert.deepEqual(lifecycle.historyHealth(), { enabled: false, diagnostic: "storage_unavailable" });
});

test("history is created lazily only after an accepted refresh", async () => {
  let creations = 0;
  const lifecycle = createUsageLifecycle({
    fetchUsage: async () => { throw new Error("offline"); },
    createHistory: () => { creations++; return harness().history; },
    updateFooter: () => {},
  });
  const ctx = { hasUI: false, model: { provider: "openai-codex" } };
  assert.equal(creations, 0);
  await lifecycle.modelSelect({ model: ctx.model }, ctx);
  assert.equal(creations, 0);
});

test("shutdown invalidates outstanding refresh before bounded flush", async () => {
  const pending = deferred();
  let deadline;
  let calls = 0;
  const { lifecycle, records } = harness(() => ++calls === 1
    ? Promise.resolve(snapshots["openai-codex"])
    : pending.promise, {
    flush: async (value) => { deadline = value; },
  });
  const ctx = { hasUI: true, model: { provider: "openai-codex" } };
  await lifecycle.modelSelect({ model: ctx.model }, ctx);
  const refresh = lifecycle.modelSelect({ model: ctx.model }, ctx);
  await lifecycle.sessionShutdown({}, ctx);
  pending.resolve(snapshots["openai-codex"]);
  await refresh;
  assert.equal(records.length, 1);
  assert.equal(deadline, 100);
});

test("session reset invalidates outstanding refresh", async () => {
  const pending = deferred();
  const { lifecycle, records } = harness(() => pending.promise);
  const ctx = { hasUI: false, model: { provider: "openai-codex" } };
  const refresh = lifecycle.modelSelect({ model: ctx.model }, ctx);
  await lifecycle.sessionStart({}, ctx);
  pending.resolve(snapshots["openai-codex"]);
  await refresh;
  assert.equal(records.length, 0);
});
