import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import extension from "../extensions/herdr-session-title/index.ts";

const task = "Find broken links across the reference notes";
const finished = (text, stopReason = "stop") => ({ stopReason, content: [{ type: "text", text }] });

function harness(t, overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), "herdr-title-test-"));
  const saved = {};
  for (const [key, value] of Object.entries({ HC_TERMINAL_ID: "fixture-t1", PI_SUBAGENT_AGENT: null, PI_OFFLINE: null, ...overrides.env })) {
    saved[key] = process.env[key];
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const callbacks = new Map(), requests = [], written = [];
  let name = overrides.name, id = "new-session";
  const file = join(dir, "fixture.jsonl");
  if (overrides.existing) writeFileSync(file, "Existing-session sentinel. Never inspect this file.");
  const ctx = {
    mode: overrides.mode ?? "tui",
    model: { provider: "offline-fixture", id: "fixture-model" },
    sessionManager: {
      getSessionId: () => id,
      getSessionFile: () => overrides.ephemeral ? undefined : file,
      getHeader: () => ({ parentSession: overrides.fork ? "another-session" : undefined }),
      getEntries() { throw new Error("Do not read conversation history"); },
      getBranch() { throw new Error("Do not read conversation history"); },
    },
    modelRegistry: {
      streamSimple(model, context, options) {
        requests.push({ model, context, options });
        return { result: () => overrides.generate ? overrides.generate() : Promise.resolve(finished("Fix broken reference links")) };
      },
    },
  };
  const emit = (type, data = {}) => callbacks.get(type)?.({ type, ...data }, ctx);
  extension({
    on: (type, handler) => callbacks.set(type, handler),
    getSessionName: () => name,
    setSessionName: next => { name = next; written.push(next); emit("session_info_changed", { name }); },
  });
  return {
    ctx, requests, written, emit,
    start: (reason = "startup") => emit("session_start", { reason }),
    input: (text, extra) => emit("input", { text, source: "interactive", ...extra }),
    run: (prompt, extra) => emit("before_agent_start", {
      prompt, messageType: "user", systemPrompt: "A system prompt that must stay local", ...extra,
    }),
    rename: value => { name = value; emit("session_info_changed", { name }); },
    switchId: () => { id = "other-session"; },
    flush: () => new Promise(resolve => setImmediate(resolve)),
  };
}

test("one bounded request uses the active model and only the first substantive submitted text", async t => {
  const h = harness(t);
  h.start();
  for (const text of ["hi there", "yes please", "/name", "!ls"]) {
    h.input(text);
    h.run(text);
  }
  assert.equal(h.requests.length, 0);
  const first = `${task}\n${"x".repeat(1000)}`;
  h.input(first, { images: ["image-data"] });
  assert.equal(h.run(first, { images: ["image-data"] }), undefined, "must not block the main turn");
  h.input("Now inspect a different part");
  h.run("Now inspect a different part");
  await h.flush();
  assert.equal(h.requests.length, 1);
  const [{ model, context, options }] = h.requests;
  assert.equal(model, h.ctx.model);
  assert.deepEqual(Object.keys(context), ["systemPrompt", "messages"]);
  assert.equal(context.messages.length, 1);
  assert.deepEqual(Object.keys(context.messages[0]), ["role", "content", "timestamp"]);
  assert.equal(context.messages[0].role, "user");
  assert.equal(context.messages[0].content, first.slice(0, 800));
  assert.equal(options.maxTokens, 48);
  assert.equal(options.cacheRetention, "none");
  assert.deepEqual(h.written, ["Fix broken reference links"]);
});

for (const [caseName, overrides, reason] of [
  ["a named session", { name: "Manual title" }, "startup"],
  ["a saved session", { existing: true }, "startup"],
  ["an explicit resume", {}, "resume"],
  ["a fork", { fork: true }, "startup"],
  ["a reload", {}, "reload"],
  ["a print run", { mode: "print" }, "startup"],
  ["an ephemeral session", { ephemeral: true }, "startup"],
  ["a non-Herdr terminal", { env: { HC_TERMINAL_ID: null } }, "startup"],
  ["a managed Pi child", { env: { PI_SUBAGENT_AGENT: "scout" } }, "startup"],
  ["an agent-less managed Pi child", { env: { PI_SUBAGENT_AGENT: "" } }, "startup"],
  ["offline mode", { env: { PI_OFFLINE: "1" } }, "startup"],
]) test(`does not title ${caseName}`, t => {
  const h = harness(t, overrides);
  h.start(reason);
  h.input(task); h.run(task);
  assert.deepEqual(h.requests, []);
});

test("does not send prompts injected, queued, or rewritten by other extensions", t => {
  const h = harness(t);
  h.start();
  h.input(task, { source: "extension" }); h.run(task);
  h.input(task, { streamingBehavior: "followUp" }); h.run(task);
  h.input(task); h.run(`${task}\nExpanded file data`);
  const attached = `<file name="notes.md">private fixture attachment</file>\n${task}`;
  h.input(attached); h.run(attached);
  h.input(task); h.run(task, { messageType: "custom" });
  assert.deepEqual(h.requests, []);
});

for (const scenario of ["manual rename", "shutdown", "different session ID", "timeout or cancellation"]) test(`drops an in-flight title after ${scenario}`, async t => {
  let complete;
  const operation = new Promise(resolve => { complete = resolve; });
  const h = harness(t, { generate: () => operation });
  const abort = new AbortController();
  h.ctx.signal = abort.signal;
  h.start("new");
  h.input(task); h.run(task);
  assert.equal(h.requests.length, 1);
  if (scenario === "manual rename") h.rename("My explicit name");
  if (scenario === "shutdown") { h.emit("session_shutdown", { reason: "resume" }); h.switchId(); h.start("resume"); }
  if (scenario === "different session ID") { h.switchId(); h.start("new"); }
  if (scenario === "timeout or cancellation") abort.abort();
  assert.equal(h.requests[0].options.signal.aborted, true);
  complete(finished("Fix broken reference links"));
  await h.flush();
  assert.deepEqual(h.written, []);
});

for (const [label, generate] of [
  ["a rejected call", () => Promise.reject(new Error("unavailable"))],
  ["truncated output", () => Promise.resolve(finished("Fix broken reference links", "length"))],
  ["multiline output", () => Promise.resolve(finished("Fix broken links\nSecond line"))],
  ["markup", () => Promise.resolve(finished("**Fix broken links**"))],
  ["control bytes", () => Promise.resolve(finished("Reference\u001b[2J links"))],
]) test(`does not write or retry after ${label}`, async t => {
  const h = harness(t, { generate });
  h.start();
  h.input(task); h.run(task);
  await h.flush();
  h.input("Check another reference list"); h.run("Check another reference list");
  assert.equal(h.requests.length, 1);
  assert.deepEqual(h.written, []);
});
