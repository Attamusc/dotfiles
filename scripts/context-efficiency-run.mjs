#!/usr/bin/env node
/** Launch one fresh, persisted, read-only Pi pilot run. This script makes real model calls. */
import assert from "node:assert/strict";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const argv = process.argv.slice(2);
const option = (name) => {
  const index = argv.indexOf(name);
  return index < 0 ? undefined : argv[index + 1];
};
const required = (name) => {
  const value = option(name);
  assert(value, `missing ${name}`);
  return value;
};

const sdkRoot = resolve(required("--sdk-root"));
const extensionPath = resolve(required("--subagent-extension"));
const cwd = resolve(required("--cwd"));
const promptFile = resolve(required("--prompt-file"));
const artifactRoot = resolve(required("--artifact-dir"));
const strategy = required("--strategy");
const lifecycleCheck = argv.includes("--lifecycle-check");
assert(["direct", "scout-first"].includes(strategy), "--strategy must be direct or scout-first");
const timeoutMs = Number(option("--timeout-ms") ?? 1_200_000);
assert(Number.isSafeInteger(timeoutMs) && timeoutMs > 0, "--timeout-ms must be a positive integer");

const metadata = JSON.parse(await readFile(join(sdkRoot, "package.json"), "utf8"));
assert.equal(metadata.name, "@earendil-works/pi-coding-agent");
assert.equal(metadata.version, "0.84.4", "launcher targets the pinned Pi SDK contract");
const sdk = await import(pathToFileURL(join(sdkRoot, "dist", "index.js")));
const { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } = sdk;

const prompt = await readFile(promptFile, "utf8");
assert(prompt.trim(), "prompt file is empty");
await mkdir(artifactRoot, { recursive: true });
const sessionDir = join(artifactRoot, "sessions");
await mkdir(sessionDir, { recursive: true });
const resultPath = join(artifactRoot, "run.json");

// The child launcher resolves named agents from this directory. Its checked-in
// scout definition must remain low-thinking; explicit tool/model arguments below
// override its broader default tool list and model without bypassing its lifecycle.
const agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
const scoutDefinition = await readFile(join(agentDir, "agents", "scout.md"), "utf8");
assert(/^thinking:\s*low\s*$/m.test(scoutDefinition), "global scout definition is not low-thinking");
assert(/^auto-exit:\s*true\s*$/m.test(scoutDefinition), "global scout must auto-exit for event-driven completion");

const settingsManager = SettingsManager.inMemory({
  defaultProvider: "openai-codex",
  defaultModel: "gpt-6-astra",
  defaultThinkingLevel: "high",
  retry: { enabled: false },
});
const modelRuntime = await ModelRuntime.create({
  authPath: join(agentDir, "auth.json"),
  modelsPath: join(agentDir, "models.json"),
  allowModelNetwork: false,
});
const parentModel = modelRuntime.getModel("openai-codex", "gpt-6-astra");
assert(parentModel, "openai-codex/gpt-6-astra is unavailable in the installed model registry");

const loader = new DefaultResourceLoader({
  cwd,
  agentDir,
  settingsManager,
  noExtensions: true,
  noSkills: true,
  noPromptTemplates: true,
  noThemes: true,
  noContextFiles: true,
  additionalExtensionPaths: strategy === "scout-first" ? [extensionPath] : [],
});
await loader.reload();
const loaded = loader.getExtensions();
assert.deepEqual(loaded.errors, [], "extension loading failed");
if (strategy === "scout-first") {
  assert.equal(loaded.extensions.length, 1, "scout-first run must load exactly one parent extension");
  assert.equal(resolve(loaded.extensions[0].resolvedPath), extensionPath, "wrong subagent extension loaded");
  assert(loaded.extensions[0].tools.has("subagent"), "pinned extension did not register subagent");
} else {
  assert.equal(loaded.extensions.length, 0, "direct run unexpectedly loaded an extension");
}

const sessionManager = SessionManager.create(cwd, sessionDir);
const { session } = await createAgentSession({
  cwd,
  agentDir,
  model: parentModel,
  modelRuntime,
  thinkingLevel: "high",
  tools: strategy === "scout-first" ? ["read", "bash", "subagent"] : ["read", "bash"],
  resourceLoader: loader,
  sessionManager,
  settingsManager,
});
await session.bindExtensions({ mode: "print" });
const parentSession = session.sessionFile;
assert(parentSession, "parent session was not persisted");

let completion;
let completionSeen = false;
let settledAfterCompletion = false;
let failure;
let resolveFinished;
const finished = new Promise((resolvePromise) => { resolveFinished = resolvePromise; });
const unsubscribe = session.subscribe((event) => {
  if (event.type === "message_end" && event.message?.role === "custom" && event.message.customType === "subagent_result") {
    completion = event.message.details;
    completionSeen = true;
  }
  if (event.type === "message_end" && event.message?.role === "assistant" && ["error", "aborted"].includes(event.message.stopReason)) {
    failure = `parent assistant ${event.message.stopReason}`;
    resolveFinished();
  }
  if (event.type === "agent_settled" && (strategy === "direct" || completionSeen)) {
    settledAfterCompletion = completionSeen;
    resolveFinished();
  }
});

const startedAt = new Date().toISOString();
const startedMs = Date.now();
let timeout;
try {
  const run = lifecycleCheck ? Promise.resolve() : session.prompt(prompt);
  if (lifecycleCheck) resolveFinished();
  const deadline = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`run exceeded ${timeoutMs}ms`)), timeoutMs);
  });
  await Promise.race([Promise.all([run, finished]), deadline]);
  assert(!failure, failure);
  if (strategy === "scout-first" && !lifecycleCheck) {
    assert(completionSeen, "parent settled without a subagent completion event");
    assert(settledAfterCompletion, "parent did not produce a continuation after child completion");
    assert.equal(completion?.exitCode, 0, "scout failed");
    assert(completion?.sessionFile, "completion omitted scout session path");
    assert((await stat(completion.sessionFile)).isFile(), "scout session was not persisted");
  }
  const result = {
    schemaVersion: 1,
    status: lifecycleCheck ? "lifecycle-check" : "complete",
    strategy,
    cwd,
    promptFile,
    parentSession,
    scoutSessions: completion?.sessionFile ? [resolve(completion.sessionFile)] : [],
    startedAt,
    endedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedMs,
    conditions: {
      parentProvider: "openai-codex",
      parentModel: "gpt-6-astra",
      parentThinking: "high",
      parentTools: strategy === "scout-first" ? ["read", "bash", "subagent"] : ["read", "bash"],
      child: strategy === "scout-first"
        ? { agent: "scout", provider: "openai-codex", model: "gpt-5.6-luna", thinking: "low", tools: ["read", "bash"] }
        : null,
    },
  };
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(JSON.stringify({ status: result.status, strategy, parentSession, scoutSessionCount: result.scoutSessions.length, resultPath }));
} catch (error) {
  await session.abort().catch(() => {});
  const attempt = {
    schemaVersion: 1,
    status: "incomplete",
    strategy,
    parentSession,
    startedAt,
    endedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedMs,
    errorType: error?.constructor?.name ?? "Error",
    errorMessage: error?.message ?? String(error),
  };
  await writeFile(join(artifactRoot, `incomplete-${basename(parentSession)}.json`), `${JSON.stringify(attempt, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  throw error;
} finally {
  clearTimeout(timeout);
  unsubscribe();
  try {
    await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
  } finally {
    session.dispose();
  }
}
