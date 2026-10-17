import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const reader = resolve(dirname(fileURLToPath(import.meta.url)), "../skills/session-reader/scripts/read_session.py");
const temp = mkdtempSync(join(tmpdir(), "session-analysis-"));
test.after(() => rmSync(temp, { recursive: true, force: true }));
const largeResult = "RESULT_BODY_" + "x".repeat(17000) + "_RESULT_END";
const records = [
  { type: "session", version: 3, id: "synthetic", cwd: "/synthetic", timestamp: "2026-01-01T00:00:00Z" },
  { type: "model_change", provider: "test-provider", modelId: "test-model" },
  { type: "thinking_level_change", thinkingLevel: "high" },
  { type: "message", message: { role: "user", content: "FIRST_USER" } },
  { type: "message", message: { role: "assistant", model: "test-model", usage: { input: 10, output: 5, cost: { total: 0.25 } }, content: [
    { type: "thinking", thinking: "THOUGHT" }, { type: "text", text: "ASSISTANT_TEXT" },
    { type: "toolCall", id: "call1", name: "bash", arguments: { command: "echo hi" } },
  ] } },
  { type: "message", message: { role: "toolResult", toolCallId: "call1", toolName: "bash", content: [{ type: "text", text: "BASH_RESULT" }] } },
  { type: "message", message: { role: "user", content: "SECOND_USER" } },
  { type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "call2", name: "subagent", arguments: { tasks: [{ agent: "scout", task: "inspect synthetic" }] } }] } },
  { type: "message", message: { role: "toolResult", toolCallId: "call2", toolName: "subagent", content: [{ type: "text", text: largeResult }], details: {
    mode: "parallel", results: [{ agent: "scout", task: "inspect synthetic", model: "test-model", exitCode: 0,
      usage: { input: 2, output: 3, cost: 0.5 }, progressSummary: { durationMs: 2000, toolCount: 1 },
      sessionFile: "/synthetic/child.jsonl", artifactPaths: { jsonlPath: "/synthetic/artifact.jsonl", outputPath: "/synthetic/output.txt" } }],
  } } },
];
const path = join(temp, "synthetic.jsonl");
writeFileSync(path, records.map(JSON.stringify).join("\n") + "\n");
function run(mode, ...args) {
  return spawnSync("python3", ["-B", reader, path, "--mode", mode, ...args], { encoding: "utf8", maxBuffer: 1024 * 1024 });
}

test("overview shows metadata, configuration changes, costs and turns without root or leaf", () => {
  const { status, stdout, stderr } = run("overview");
  assert.equal(status, 0, stderr);
  for (const token of ["synthetic", "test-provider/test-model", "Thinking:  high", "FIRST_USER", "SECOND_USER", "SUBAGENT", "$0.2500", "$0.5000"]) assert.ok(stdout.includes(token), token);
});
test("conversation shows human and assistant text, excluding ordinary tool output", () => {
  const { status, stdout, stderr } = run("conversation");
  assert.equal(status, 0, stderr);
  assert.match(stdout, /FIRST_USER.*ASSISTANT_TEXT.*SECOND_USER/s);
  assert.doesNotMatch(stdout, /BASH_RESULT|RESULT_BODY_/);
});
test("full displays thinking, tool calls, tool results and actual subagent text beyond 16KiB when unlimited", () => {
  const { status, stdout, stderr } = run("full", "--max-content", "0");
  assert.equal(status, 0, stderr);
  for (const token of ["THOUGHT", "echo hi", "BASH_RESULT", "subagent", "/synthetic/child.jsonl", largeResult]) assert.ok(stdout.includes(token), token.slice(0, 60));
  assert.ok(Buffer.byteLength(stdout) > 16 * 1024);
});
test("tools displays calls, arguments and results", () => {
  const { status, stdout, stderr } = run("tools");
  assert.equal(status, 0, stderr);
  assert.match(stdout, /bash.*echo hi.*BASH_RESULT.*subagent/s);
});
test("costs displays main and child costs", () => {
  const { status, stdout, stderr } = run("costs");
  assert.equal(status, 0, stderr);
  assert.match(stdout, /test-model.*\$\s*0\.2500/s);
  assert.match(stdout, /scout\/test-model.*\$\s*0\.5000/s);
  assert.match(stdout, /TOTAL.*\$\s*0\.7500/s);
});
test("subagents shows task, status, model, cost and artifact paths", () => {
  const { status, stdout, stderr } = run("subagents");
  assert.equal(status, 0, stderr);
  for (const token of ["parallel", "inspect synthetic", "completed", "test-model", "$0.5000", "/synthetic/child.jsonl", "/synthetic/artifact.jsonl", "/synthetic/output.txt"]) assert.ok(stdout.includes(token), token);
});
test("offset/limit select only the requested user turn in full output", () => {
  const { status, stdout, stderr } = run("full", "--offset", "1", "--limit", "1");
  assert.equal(status, 0, stderr);
  assert.match(stdout, /SECOND_USER/);
  assert.doesNotMatch(stdout, /FIRST_USER|ASSISTANT_TEXT|BASH_RESULT/);
});
test("history analysis includes both branches without automatic redaction", () => {
  const branched = join(temp, "branched.jsonl");
  writeFileSync(branched, [
    { type: "session", version: 3, id: "branched" },
    { type: "message", id: "root", parentId: null, message: { role: "user", content: "PASSWORD=synthetic-value\nLANG=C\nPWD=/synthetic" } },
    { type: "message", id: "left", parentId: "root", message: { role: "assistant", content: "LEFT_BRANCH" } },
    { type: "message", id: "right", parentId: "root", message: { role: "assistant", content: "RIGHT_BRANCH" } },
  ].map(JSON.stringify).join("\n") + "\n");
  const result = spawnSync("python3", ["-B", reader, branched, "--mode", "full"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASSWORD=synthetic-value.*LANG=C.*PWD=\/synthetic.*LEFT_BRANCH.*RIGHT_BRANCH/s);
  assert.doesNotMatch(result.stdout, /REDACTED|environment dump omitted/);
});
test("missing file returns nonzero with diagnostic", () => {
  const result = spawnSync("python3", ["-B", reader, join(temp, "absent.jsonl")], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not found/i);
});
