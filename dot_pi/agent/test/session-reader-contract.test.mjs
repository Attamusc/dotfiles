import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "fixtures/session-reader");
const reader = resolve(here, "../skills/session-reader/scripts/read_session.py");

function invoke(fixture, leaf, mode = "resolve", extra = []) {
  const result = spawnSync("python3", [reader, join(root, fixture), "--sessions-root", root, "--leaf", leaf, "--mode", mode, ...extra], { encoding: "utf8" });
  assert.ok(Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr) <= 16 * 1024);
  assert.equal(result.stderr, "");
  return { ...result, json: JSON.parse(result.stdout) };
}

function projection(entries, messages, sessionId) {
  const projectedEntries = entries.filter((entry) => ["message", "branch_summary", "compaction", "custom_message"].includes(entry.type));
  assert.equal(projectedEntries.length, messages.length);
  return messages.flatMap((message, index) => {
    const entry = projectedEntries[index];
    let text;
    let role = message.role;
    let source = entry.type === "custom_message" ? "custom-message (original)" : "message (original)";
    if (message.role === "bashExecution") text = `${message.command ?? ""}\n${message.output ?? ""}`.replace(/^\n|\n$/g, "");
    else if (message.role === "branchSummary") {
      text = message.summary;
      role = "branch_summary";
      source = "branch-summary (derived)";
    } else if (message.role === "compactionSummary") {
      text = message.summary;
      role = "compaction";
      source = "compaction-summary (derived)";
    } else if (typeof message.content === "string") text = message.content;
    else text = (message.content ?? []).filter((part) => part?.type === "text").map((part) => part.text ?? "").join("\n");
    return text ? [{ entryId: entry.id, provenance: `session:${sessionId}#entry:${entry.id}`, role, source, text }] : [];
  });
}

test("linear v3 reconstructs canonical bash and resolve omits cost", () => {
  const { status, json } = invoke("linear-v3.jsonl", "b1");
  assert.equal(status, 0);
  assert.deepEqual(json.activeEntryIds, ["u1", "a1", "t1", "m1", "th1", "b1"]);
  assert.equal("cost" in json, false);
  assert.deepEqual(json.items.at(-1), { entryId: "b1", provenance: "session:synthetic-session#entry:b1", role: "bashExecution", source: "message (original)", text: "printf ok\nok" });
});

test("installed buildSessionContext projection matches roles and content", async (t) => {
  const sdkRoot = process.env.PI_SDK_ROOT;
  if (!sdkRoot) return t.skip("PI_SDK_ROOT is required for the installed differential replay");
  assert.equal(JSON.parse(readFileSync(join(sdkRoot, "package.json"), "utf8")).version, "0.84.4");
  const { parseSessionEntries, buildContextEntries, buildSessionContext } = await import(pathToFileURL(join(sdkRoot, "dist/index.js")));
  for (const [fixture, leaf] of [["linear-v3.jsonl", "b1"], ["branches.jsonl", "leaf"], ["compaction.jsonl", "leaf"], ["missing-boundary.jsonl", "leaf"], ["entry-kinds.jsonl", "leaf"], ["null-unknown.jsonl", "leaf"], ["malformed-constants.jsonl", "leaf"], ["crlf-records.jsonl", "leaf"], ["lone-surrogate.jsonl", "leaf"]]) {
    const parsed = parseSessionEntries(readFileSync(join(root, fixture), "utf8"));
    const entries = buildContextEntries(parsed, leaf);
    const sessionId = parsed[0].id;
    const expected = projection(entries, buildSessionContext(parsed, leaf).messages, sessionId);
    const actualDocument = invoke(fixture, leaf).json;
    assert.deepEqual(actualDocument.contextEntryIds, entries.map(({ id }) => id), `${fixture} context IDs`);
    assert.deepEqual(actualDocument.items, expected, `${fixture} projection`);
  }
  for (const fixture of ["bare-cr-records.jsonl", "form-feed-records.jsonl"]) {
    const parsed = parseSessionEntries(readFileSync(join(root, fixture), "utf8"));
    assert.equal(parsed.length, 0, `${fixture} remains one malformed record`);
    assert.equal(invoke(fixture, "leaf").json.status, "invalid-session-header");
  }
});

test("oversized selected-parent integers retain the chain and ignore non-finite cost", () => {
  const temp = mkdtempSync(join(tmpdir(), "session-reader-numbers-"));
  const path = join(temp, "oversized.jsonl");
  const huge = "9".repeat(5000);
  writeFileSync(path,
    '{"type":"session","version":3,"id":"s"}\n' +
    '{"type":"message","id":"a","parentId":null,"message":{"role":"assistant","content":"a","usage":{"cost":{"total":' + huge + '}}}}\n' +
    '{"type":"message","id":"leaf","parentId":"a","message":{"role":"assistant","content":"b","usage":{"cost":{"total":2}}}}\n');
  const resolved = spawnSync("python3", [reader, path, "--sessions-root", temp, "--leaf", "leaf", "--mode", "resolve"], { encoding: "utf8" });
  const costs = spawnSync("python3", [reader, path, "--sessions-root", temp, "--leaf", "leaf", "--mode", "costs"], { encoding: "utf8" });
  assert.equal(resolved.status, 0);
  assert.equal(costs.status, 0);
  assert.deepEqual(JSON.parse(resolved.stdout).activeEntryIds, ["a", "leaf"]);
  assert.equal(JSON.parse(costs.stdout).cost, 2);
  assert.equal(/Infinity|NaN/.test(resolved.stdout + costs.stdout), false);
});

test("decimal integer overflow boundary follows JavaScript Number", () => {
  const temp = mkdtempSync(join(tmpdir(), "session-reader-number-boundary-"));
  for (const [name, digits, expected] of [["finite", `1${"0".repeat(308)}`, 1e308], ["overflow", `1${"0".repeat(309)}`, 0]]) {
    const path = join(temp, `${name}.jsonl`);
    writeFileSync(path,
      '{"type":"session","version":3,"id":"s"}\n' +
      '{"type":"message","id":"leaf","parentId":null,"message":{"role":"assistant","content":"a","usage":{"cost":{"total":' + digits + '}}}}\n');
    const result = spawnSync("python3", [reader, path, "--sessions-root", temp, "--leaf", "leaf", "--mode", "costs"], { encoding: "utf8" });
    assert.equal(result.status, 0, name);
    assert.equal(JSON.parse(result.stdout).cost, expected, name);
    assert.equal(/Infinity|NaN/.test(result.stdout), false, name);
  }
});

test("installed parser agrees on oversized selected-parent context", async (t) => {
  const sdkRoot = process.env.PI_SDK_ROOT;
  if (!sdkRoot) return t.skip("PI_SDK_ROOT is required for the installed differential replay");
  const { parseSessionEntries, buildContextEntries } = await import(pathToFileURL(join(sdkRoot, "dist/index.js")));
  const huge = "9".repeat(5000);
  const content =
    '{"type":"session","version":3,"id":"s"}\n' +
    '{"type":"message","id":"a","parentId":null,"message":{"role":"assistant","content":"a","usage":{"cost":{"total":' + huge + '}}}}\n' +
    '{"type":"message","id":"leaf","parentId":"a","message":{"role":"assistant","content":"b","usage":{"cost":{"total":2}}}}\n';
  const installed = parseSessionEntries(content);
  assert.equal(installed[1].message.usage.cost.total, Infinity);

  const temp = mkdtempSync(join(tmpdir(), "session-reader-differential-"));
  const path = join(temp, "oversized.jsonl");
  writeFileSync(path, content);
  const localContext = JSON.parse(spawnSync("python3", [reader, path, "--sessions-root", temp, "--leaf", "leaf", "--mode", "resolve"], { encoding: "utf8" }).stdout);
  const localCosts = JSON.parse(spawnSync("python3", [reader, path, "--sessions-root", temp, "--leaf", "leaf", "--mode", "costs"], { encoding: "utf8" }).stdout);
  assert.deepEqual(localContext.contextEntryIds, buildContextEntries(installed, "leaf").map(({ id }) => id));
  assert.equal(localCosts.cost, 2);
});

test("siblings are isolated and selected costs count the complete active path once", () => {
  const resolved = invoke("cost-path.jsonl", "leaf");
  assert.equal(resolved.stdout.includes("sibling"), false);
  assert.equal("cost" in resolved.json, false);
  assert.equal(invoke("cost-path.jsonl", "leaf", "costs").json.cost, 10);
  assert.equal(invoke("cost-precompaction.jsonl", "leaf", "costs").json.cost, 11);
  const overflow = invoke("cost-overflow.jsonl", "leaf", "costs");
  assert.equal(overflow.status, 2);
  assert.equal(overflow.json.status, "cost-overflow");
  assert.equal(overflow.stdout.includes("Infinity"), false);
  const extreme = invoke("cost-extreme.jsonl", "leaf", "costs");
  assert.equal(extreme.status, 0);
  assert.equal(extreme.json.cost, 2);
  assert.equal(/Infinity|NaN/.test(extreme.stdout), false);
});

test("privacy pipeline covers every display source and shell credential form", () => {
  const { stdout, json } = invoke("privacy-matrix.jsonl", "leaf");
  for (const secret of ["message-secret", "bash-secret", "tool-secret", "custom-secret", "branchsummarysecret", "compact-secret", "/synthetic/private"]) assert.equal(stdout.includes(secret), false);
  assert.ok(json.redactions["environment-secret"] >= 5);
  assert.equal(stdout.includes("[raw environment dump omitted]"), true);

  const shell = invoke("privacy-shell.jsonl", "leaf");
  for (const secret of ["plain-secret", "escaped", "word secret", "standalone-password", "command-password", "summary-password"]) assert.equal(shell.stdout.includes(secret), false);
  assert.ok(shell.json.redactions["environment-secret"] >= 5);
  assert.ok(shell.json.redactions["url-credential"] >= 2);

  const boundaries = invoke("privacy-boundaries.jsonl", "leaf");
  for (const secret of ["user-password", "tool-password", "bash-password", "custom-password", "branch-password", "compact-password", "/synthetic/lower", "/synthetic/mixed"]) assert.equal(boundaries.stdout.includes(secret), false);
  assert.ok(boundaries.json.redactions["url-credential"] >= 6);
  assert.equal(boundaries.stdout.includes("[raw environment dump omitted]"), true);
});

test("newline, NUL, and mixed raw environment dumps are suppressed", () => {
  const temp = mkdtempSync(join(tmpdir(), "session-reader-env-"));
  for (const [name, content] of [["nul", "LANG=C\0PWD=/synthetic/nul\0USER=alice"], ["mixed", "LANG=C\nPWD=/synthetic/mixed\0USER=alice"]]) {
    const path = join(temp, `${name}.jsonl`);
    writeFileSync(path, `${JSON.stringify({ type: "session", version: 3, id: name })}\n${JSON.stringify({ type: "message", id: "leaf", parentId: null, message: { role: "user", content } })}\n`);
    const result = spawnSync("python3", [reader, path, "--sessions-root", temp, "--leaf", "leaf", "--mode", "resolve"], { encoding: "utf8" });
    assert.equal(result.status, 0);
    assert.equal(result.stdout.includes("/synthetic/"), false);
    assert.equal(result.stdout.includes("[raw environment dump omitted]"), true);
  }
});

test("LF-only record parsing preserves CRLF and rejects bare CR and form feed like installed Pi", () => {
  assert.equal(invoke("crlf-records.jsonl", "leaf").json.status, "complete");
  for (const fixture of ["bare-cr-records.jsonl", "form-feed-records.jsonl"]) {
    const result = invoke(fixture, "leaf");
    assert.equal(result.status, 2);
    assert.equal(result.json.status, "invalid-session-header");
  }
});

test("escaped lone surrogates remain strict, bounded JSON", () => {
  const result = invoke("lone-surrogate.jsonl", "leaf");
  assert.equal(result.status, 0);
  assert.ok(Buffer.byteLength(result.stdout) <= 16 * 1024);
  assert.equal(result.json.items[0].text, "before\ud800after");
  assert.equal(result.stdout.includes("\\ud800"), true);
});

test("any selected retainedTail fails before excerpts", () => {
  for (const fixture of ["retained-tail.jsonl", "retained-earlier.jsonl"]) {
    const { status, stdout, json } = invoke(fixture, "leaf");
    assert.equal(status, 2);
    assert.equal(json.status, "unsupported-session-contract");
    assert.equal(stdout.includes("MUST NOT RENDER"), false);
  }
});

for (const fixture of ["invalid-header.jsonl", "absent-header.jsonl", "misordered-header.jsonl"]) {
  test(`${fixture} rejects the header`, () => assert.equal(invoke(fixture, "leaf").json.status, "invalid-session-header"));
}
test("selected records require an explicit parentId", () => assert.equal(invoke("missing-parent.jsonl", "leaf").json.status, "missing-parent-id"));

test("null content and harmless unknown records preserve selection", () => {
  const { json } = invoke("null-unknown.jsonl", "leaf");
  assert.deepEqual(json.activeEntryIds, ["root", "leaf"]);
  assert.deepEqual(json.items, []);
});

test("malformed diagnostics include total, bounded lines, omitted count, and strict constants", () => {
  const { stdout, json } = invoke("many-malformed.jsonl", "leaf");
  assert.match(json.diagnostics[0], /^malformed-records:25;lines:(?:\d+,){19}\d+;omitted:5$/);
  assert.equal(stdout.includes("bad-"), false);
  const constants = invoke("malformed-constants.jsonl", "leaf");
  assert.deepEqual(constants.json.activeEntryIds, ["root", "leaf"]);
  assert.match(constants.json.diagnostics[0], /^malformed-records:3;/);
  assert.equal(constants.stdout.includes("MUST NOT RENDER"), false);
});

test("invalid UTF-8, argparse, and I/O errors are bounded structured output", () => {
  const temp = mkdtempSync(join(tmpdir(), "session-reader-errors-"));
  const bad = join(temp, "bad.jsonl");
  writeFileSync(bad, Buffer.from('{"type":"session","version":3,"id":"x"}\n\xff\n{"type":"message","id":"leaf","parentId":null,"message":{"role":"user","content":"ok"}}\n', "binary"));
  assert.equal(JSON.parse(spawnSync("python3", [reader, bad, "--sessions-root", temp, "--leaf", "leaf"], { encoding: "utf8" }).stdout).diagnostics[0].startsWith("malformed-records:1"), true);
  for (const args of [["x", "--sessions-root", "x", "--leaf", "x", "--mode", "z".repeat(20000)], ["/private/missing.jsonl", "--sessions-root", "/private/missing", "--leaf", "x"]]) {
    const result = spawnSync("python3", [reader, ...args], { encoding: "utf8" });
    assert.ok(Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr) <= 16 * 1024);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout.includes("/private/"), false);
  }
});

test("image/base64 is omitted and large matrix stays bounded", () => {
  const { stdout, json } = invoke("large-image.jsonl", "leaf");
  assert.equal(stdout.includes("c3ludGhldGljLWltYWdl"), false);
  assert.ok(json.omittedItems > 0);
});

for (const [fixture, leaf, expected] of [["duplicate.jsonl", "x", "duplicate-entry-id"], ["orphan.jsonl", "leaf", "orphan-parent"], ["self.jsonl", "leaf", "self-parent"], ["cycle.jsonl", "a", "cyclic-parent-chain"]]) {
  test(`${fixture} fails closed`, () => assert.equal(invoke(fixture, leaf).json.status, expected));
}

test("path containment requires a canonical directory root and rejects escapes", () => {
  const temp = mkdtempSync(join(tmpdir(), "session-reader-"));
  const outside = join(temp, "outside.jsonl");
  writeFileSync(outside, "{}\n");
  for (const path of [outside, "../outside.jsonl", root, join(root, "not-jsonl.txt"), join(root, "missing.jsonl")]) {
    const result = spawnSync("python3", [reader, path, "--sessions-root", root, "--leaf", "x"], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
  }
  const rootFile = join(root, "linear-v3.jsonl");
  assert.equal(JSON.parse(spawnSync("python3", [reader, rootFile, "--sessions-root", rootFile, "--leaf", "b1"], { encoding: "utf8" }).stdout).status, "sessions-root-not-directory");
  const rootLink = join(temp, "root-link");
  symlinkSync(root, rootLink);
  assert.equal(JSON.parse(spawnSync("python3", [reader, "linear-v3.jsonl", "--sessions-root", rootLink, "--leaf", "b1"], { encoding: "utf8" }).stdout).status, "complete");
  const link = join(root, "escape.jsonl");
  try {
    symlinkSync(outside, link);
    assert.equal(JSON.parse(spawnSync("python3", [reader, link, "--sessions-root", root, "--leaf", "x"], { encoding: "utf8" }).stdout).status, "session-path-outside-root");
  } finally { try { execFileSync("rm", [link]); } catch {} }
});

test("legacy redaction and output fixture remains private and bounded", () => {
  const { stdout, json } = invoke("secrets-output.jsonl", "leaf");
  for (const secret of ["abcdefghijklmnop", "ghp_abcdefghijk", "password", "verysecretvalue", "NESTED SECRET", "private body"]) assert.equal(stdout.includes(secret), false);
  assert.ok(json.omittedItems > 0);
});

test("tests and reader never contain a live session root", () => {
  const liveRoot = ["~", ".pi", "agent", "sessions"].join("/");
  for (const path of [reader, fileURLToPath(import.meta.url)]) assert.equal(readFileSync(path, "utf8").includes(liveRoot), false);
});
