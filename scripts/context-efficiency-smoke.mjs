#!/usr/bin/env node
/** Unmocked Pi extension/history smoke. Intentionally performs no model turn. */
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
const repo = resolve(option("--repo") ?? process.cwd());
const sdkRoot = option("--sdk-root");
assert(sdkRoot, "pass --sdk-root /path/to/installed/@earendil-works/pi-coding-agent");
const packageRoot = resolve(sdkRoot);
const packageMetadata = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
assert.equal(packageMetadata.name, "@earendil-works/pi-coding-agent");
assert.equal(packageMetadata.version, "0.84.4", "smoke targets the pinned Pi contract");
const sdk = await import(pathToFileURL(join(packageRoot, "dist", "index.js")));
const { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager } = sdk;
assert.equal(typeof createAgentSession, "function", "installed Pi SDK export missing");

const artifactRoot = await mkdtemp(join(tmpdir(), "pi-context-efficiency-smoke-"));
process.env.XDG_STATE_HOME = artifactRoot;
process.env.PI_OFFLINE = "1"; // Prevent model-catalog refreshes; /usage still uses existing provider usage endpoints.

const extensionPath = join(repo, "dot_pi", "agent", "extensions", "subscription-usage", "index.ts");
const settingsManager = SettingsManager.inMemory({ retry: { enabled: false } });
const loader = new DefaultResourceLoader({
  cwd: repo,
  agentDir: join(homedir(), ".pi", "agent"),
  settingsManager,
  noExtensions: true,
  noSkills: true,
  noPromptTemplates: true,
  noThemes: true,
  noContextFiles: true,
  additionalExtensionPaths: [extensionPath],
});
await loader.reload();

function assertUsageLoaded() {
  const loaded = loader.getExtensions();
  assert.deepEqual(loaded.errors, [], "extension failed to load");
  assert.equal(loaded.extensions.length, 1, "smoke must load only the source subscription extension");
  assert.equal(resolve(loaded.extensions[0].resolvedPath), resolve(extensionPath), "loaded extension is not the repository source");
  assert(loaded.extensions[0].commands.has("usage"), "usage command was not registered");
}
assertUsageLoaded();

const { session } = await createAgentSession({
  cwd: repo,
  agentDir: join(homedir(), ".pi", "agent"),
  resourceLoader: loader,
  sessionManager: SessionManager.inMemory(repo),
  settingsManager,
  noTools: "all",
});
let modelCallCount = 0;
session.subscribe((event) => {
  if (event.type === "agent_start" || event.type === "before_provider_request") modelCallCount++;
});
await session.bindExtensions({ mode: "print" });

async function withDeadline(operation, label) {
  let timeout;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} exceeded 30 seconds`)), 30_000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
const historyDir = join(artifactRoot, "pi", "subscription-usage");
const readObservations = async () => {
  const names = (await readdir(historyDir)).filter((name) => /^runtime-.+\.jsonl$/.test(name)).sort();
  const records = [];
  for (const name of names) {
    const lines = (await readFile(join(historyDir, name), "utf8")).split("\n").filter(Boolean);
    records.push(...lines.map((line) => JSON.parse(line)));
  }
  return { names, records };
};

const allowedObservationKeys = new Set(["schemaVersion", "observedAt", "runtimeSeriesId", "refreshReason", "providerId", "plan", "windows"]);
const allowedWindowKeys = new Set(["id", "label", "usedPercent", "resetsAt", "scope", "modelId"]);
function assertSafe(records) {
  for (const record of records) {
    assert(Object.keys(record).every((key) => allowedObservationKeys.has(key)), "observation has a non-whitelisted field");
    assert.equal(record.schemaVersion, 1);
    assert.equal(new Date(record.observedAt).toISOString(), record.observedAt);
    assert.equal(record.refreshReason, "usage");
    assert(Array.isArray(record.windows));
    for (const window of record.windows) {
      assert(Object.keys(window).every((key) => allowedWindowKeys.has(key)), "window has a non-whitelisted field");
    }
  }
}

try {
  await withDeadline(session.prompt("/usage"), "first /usage");
  // The real shutdown hook flushes the nonblocking writer before inspection.
  await withDeadline(session.reload(), "first session reload");
  const beforeReload = await readObservations();
  assert(beforeReload.records.length > 0, "no provider returned an accepted usage observation");
  assertSafe(beforeReload.records);
  const prior = new Set(beforeReload.records.map((record) => JSON.stringify(record)));

  await withDeadline(session.reload(), "session reload");
  assertUsageLoaded();
  const { createQuotaHistory } = await import(pathToFileURL(join(dirname(extensionPath), "history.ts")));
  const freshHistory = createQuotaHistory();
  const reloadedRead = await freshHistory.read();
  assert(reloadedRead.observations.length >= beforeReload.records.length, "fresh history reader did not see pre-reload observations");
  assert([...prior].every((record) => reloadedRead.observations.some((candidate) => JSON.stringify(candidate) === record)), "fresh history reader lost a prior observation");
  await withDeadline(session.prompt("/usage"), "post-reload /usage");
  await withDeadline(session.reload(), "post-refresh session reload");
  const afterReload = await readObservations();
  assert(afterReload.records.length > beforeReload.records.length, "post-reload history did not append an observation");
  assert([...prior].every((record) => afterReload.records.some((candidate) => JSON.stringify(candidate) === record)), "reload lost a prior observation");
  assertSafe(afterReload.records);
  assert.equal(modelCallCount, 0, "a model call was attempted");

  console.log(JSON.stringify({
    acceptedObservationCount: afterReload.records.length,
    schemaVersion: 1,
    historyHealth: "enabled",
    reloadPersistence: true,
    modelCallCount,
    artifactRoot,
  }));
} finally {
  session.dispose();
}
