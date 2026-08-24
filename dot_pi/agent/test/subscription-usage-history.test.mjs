import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { createQuotaHistory } from "../extensions/subscription-usage/history.ts";

const temporaryRoots = [];
afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function temporaryRoot() {
  const root = await mkdtemp(join(tmpdir(), "quota-history-"));
  temporaryRoots.push(root);
  return root;
}

function snapshot(usedPercent) {
  return {
    providerId: "openai-codex",
    providerName: "Codex",
    windows: [{ id: "primary", label: "5h", usedPercent }],
    details: [],
  };
}

test("quota history survives restart and merges runtime shards chronologically", async () => {
  const stateRoot = await temporaryRoot();
  const first = createQuotaHistory({
    stateRoot,
    runtimeSeriesId: "first",
    clock: () => new Date("2026-09-06T12:00:02.000Z"),
  });
  const second = createQuotaHistory({
    stateRoot,
    runtimeSeriesId: "second",
    clock: () => new Date("2026-09-06T12:00:01.000Z"),
  });

  first.record(snapshot(20), "agent_settled");
  second.record(snapshot(10), "session_start");
  await Promise.all([first.flush(1_000), second.flush(1_000)]);

  const historyDir = join(stateRoot, "pi", "subscription-usage");
  assert.deepEqual((await readdir(historyDir)).sort(), [
    "runtime-first.jsonl",
    "runtime-second.jsonl",
  ]);
  assert.equal((await readFile(join(historyDir, "runtime-first.jsonl"), "utf8")).endsWith("\n"), true);

  const restarted = createQuotaHistory({ stateRoot, runtimeSeriesId: "third" });
  const { observations, diagnostics } = await restarted.read();
  assert.deepEqual(diagnostics, [{ shard: "runtime-first.jsonl", reason: "multiple anonymous runtime series observed" }]);
  assert.deepEqual(observations.map(({ runtimeSeriesId, windows }) => [runtimeSeriesId, windows[0].usedPercent]), [
    ["second", 10],
    ["first", 20],
  ]);
});

test("quota history serializes records within its runtime shard", async () => {
  const stateRoot = await temporaryRoot();
  let milliseconds = 0;
  const history = createQuotaHistory({
    stateRoot,
    runtimeSeriesId: "serial",
    clock: () => new Date(1_000 + milliseconds++),
  });

  for (let value = 0; value < 40; value++) history.record(snapshot(value), "usage");
  await history.flush(1_000);

  const contents = await readFile(join(stateRoot, "pi", "subscription-usage", "runtime-serial.jsonl"), "utf8");
  const lines = contents.trimEnd().split("\n");
  assert.equal(lines.length, 40);
  assert.deepEqual(lines.map((line) => JSON.parse(line).windows[0].usedPercent), [...Array(40).keys()]);
});

test("quota history disables writes after one secret-free storage diagnostic", async () => {
  const root = await temporaryRoot();
  const unusableStateRoot = join(root, "not-a-directory");
  await writeFile(unusableStateRoot, "private-canary");
  const diagnostics = [];
  const history = createQuotaHistory({
    stateRoot: unusableStateRoot,
    runtimeSeriesId: "failure",
    stderr: { write: (message) => diagnostics.push(message) },
  });

  history.record(snapshot(1), "usage");
  history.record(snapshot(2), "usage");
  await history.flush(1_000);

  assert.deepEqual(history.health(), { enabled: false, diagnostic: "storage_unavailable" });
  assert.deepEqual(diagnostics, [
    "subscription-usage: quota history storage unavailable; history disabled\n",
  ]);
  assert.equal(diagnostics[0].includes("private-canary"), false);
});

test("quota history ignores shard symlinks", async () => {
  const stateRoot = await temporaryRoot();
  const historyDir = join(stateRoot, "pi", "subscription-usage");
  const history = createQuotaHistory({ stateRoot, runtimeSeriesId: "real" });
  history.record(snapshot(1), "usage");
  await history.flush(1_000);
  await symlink(join(historyDir, "runtime-real.jsonl"), join(historyDir, "runtime-link.jsonl"));

  assert.equal((await history.read()).observations.length, 1);
});

test("missing history directory reads as empty without disabling later writes", async () => {
  const stateRoot = await temporaryRoot();
  const history = createQuotaHistory({ stateRoot, runtimeSeriesId: "new" });

  assert.deepEqual(await history.read(), { observations: [], diagnostics: [] });
  assert.deepEqual(history.health(), { enabled: true });
  history.record(snapshot(1), "usage");
  await history.flush(1_000);
  assert.equal((await history.read()).observations.length, 1);
});

test("reader preserves valid lines around malformed and partial records", async () => {
  const stateRoot = await temporaryRoot();
  const historyDir = join(stateRoot, "pi", "subscription-usage");
  await writeFile(join(stateRoot, "keep-root"), "protected-canary");
  const history = createQuotaHistory({ stateRoot, runtimeSeriesId: "reader" });
  history.record(snapshot(12), "usage");
  await history.flush(1_000);
  const shard = join(historyDir, "runtime-reader.jsonl");
  const valid = JSON.parse((await readFile(shard, "utf8")).trim());
  await writeFile(shard, `${JSON.stringify(valid)}\n{\"secret\":\"canary\"}\n{\"schemaVersion\":2}\n{\"schemaVersion\":1`, "utf8");

  const result = await history.read();
  assert.equal(result.observations.length, 1);
  assert.deepEqual(result.observations[0], valid);
  assert.deepEqual(result.diagnostics, [
    { shard: "runtime-reader.jsonl", line: 2, reason: "invalid observation schema" },
    { shard: "runtime-reader.jsonl", line: 3, reason: "unsupported observation schema" },
    { shard: "runtime-reader.jsonl", line: 4, reason: "partial trailing line" },
  ]);
  assert.equal(JSON.stringify(result).includes("secret"), false);
  assert.equal(JSON.stringify(result).includes("canary"), false);
  assert.equal(await readFile(join(stateRoot, "keep-root"), "utf8"), "protected-canary");
});

test("reader strictly validates and projects approved v1 fields", async () => {
  const stateRoot = await temporaryRoot();
  const historyDir = join(stateRoot, "pi", "subscription-usage");
  await mkdir(historyDir, { recursive: true });
  const base = {
    schemaVersion: 1,
    observedAt: "2026-09-06T12:00:00.000Z",
    runtimeSeriesId: "strict",
    refreshReason: "usage",
    providerId: "openai-codex",
    sourceSecret: "must-not-escape",
    windows: [{ id: "primary", label: "5h", usedPercent: 10, sourceSecret: "must-not-escape" }],
  };
  await writeFile(join(historyDir, "runtime-strict.jsonl"), [
    JSON.stringify(base),
    JSON.stringify({ ...base, observedAt: "2026-09-06 12:00:00Z" }),
    JSON.stringify({ ...base, windows: [{ id: "primary", label: "5h", usedPercent: 101 }] }),
  ].join("\n") + "\n");

  const result = await createQuotaHistory({ stateRoot, runtimeSeriesId: "reader" }).read();
  assert.deepEqual(result.observations, [{
    schemaVersion: 1,
    observedAt: "2026-09-06T12:00:00.000Z",
    runtimeSeriesId: "strict",
    refreshReason: "usage",
    providerId: "openai-codex",
    windows: [{ id: "primary", label: "5h", usedPercent: 10 }],
  }]);
  assert.equal(JSON.stringify(result).includes("must-not-escape"), false);
  assert.equal(result.diagnostics.length, 2);
});

test("reader detects decreases across interleaved providers and missing windows", async () => {
  const stateRoot = await temporaryRoot();
  let sequence = 0;
  const history = createQuotaHistory({
    stateRoot,
    runtimeSeriesId: "interleaved",
    clock: () => new Date(Date.UTC(2026, 8, 6, 12, 0, sequence++)),
  });
  const codex = (usedPercent, resetsAt = 2_000_000_000) => ({
    ...snapshot(usedPercent),
    windows: [{ id: "primary", label: "5h", usedPercent, resetsAt }],
  });
  history.record(codex(70), "usage");
  history.record({ ...codex(85), providerId: "anthropic", providerName: "Claude" }, "usage");
  history.record({ ...snapshot(10), windows: [] }, "usage");
  history.record(codex(20), "usage");
  history.record(codex(5, 2_000_018_000), "usage");
  await history.flush(1_000);

  const result = await history.read();
  assert.equal(result.observations.length, 5);
  assert.deepEqual(result.diagnostics, [{
    shard: "runtime-interleaved.jsonl",
    reason: "usage decreased without window reset",
  }]);
});

test("retention rewrites only the current shard and removes expired inactive shards", async () => {
  const stateRoot = await temporaryRoot();
  const historyDir = join(stateRoot, "pi", "subscription-usage");
  const oldClock = () => new Date("2026-07-01T00:00:00.000Z");
  for (const id of ["current", "inactive"]) {
    const writer = createQuotaHistory({ stateRoot, runtimeSeriesId: id, clock: oldClock });
    writer.record(snapshot(1), "usage");
    await writer.flush(1_000);
  }
  const inactivePath = join(historyDir, "runtime-inactive.jsonl");
  const inactiveBefore = await readFile(inactivePath, "utf8");
  await utimes(inactivePath, new Date("2026-07-01T00:00:00.000Z"), new Date("2026-07-01T00:00:00.000Z"));
  const current = createQuotaHistory({
    stateRoot,
    runtimeSeriesId: "current",
    clock: () => new Date("2026-09-06T00:00:00.000Z"),
  });

  current.record(snapshot(2), "usage");
  await current.flush(1_000);

  assert.deepEqual(await readdir(historyDir), ["runtime-current.jsonl"]);
  const currentLines = (await readFile(join(historyDir, "runtime-current.jsonl"), "utf8")).trim().split("\n");
  assert.equal(currentLines.length, 1);
  assert.equal(JSON.parse(currentLines[0]).windows[0].usedPercent, 2);
  assert.equal(inactiveBefore.endsWith("\n"), true);
});
