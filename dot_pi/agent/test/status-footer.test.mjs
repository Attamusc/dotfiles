import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import {
  composeFooterRuntime,
  findJjWorkspace,
  JJ_TEMPLATE,
  formatCost,
  formatMcpSummary,
  formatTokenCount,
  parseGitState,
  parseJjState,
  sanitizeLabel,
  sanitizeStatusLine,
} from "../extensions/status-footer/state.ts";

test("jj state reports the working change, nearest bookmark, distance, and diff", () => {
  const state = parseJjState([
    "current\tkoslkvwu\t[]\t0\t11\t11",
    'base\ttmxlqqun\t["main"]',
  ].join("\n"));

  assert.deepEqual(state, {
    kind: "jj",
    changeId: "koslkvwu",
    currentBookmarks: [],
    nearestBookmark: "main",
    ahead: 1,
    conflicts: 0,
    additions: 11,
    deletions: 11,
  });
});

test("jj state prefers current bookmarks and counts conflicted files", () => {
  const state = parseJjState('current\tqpvuntsm\t["footer-design"]\t2\t128\t47\n');

  assert.deepEqual(state, {
    kind: "jj",
    changeId: "qpvuntsm",
    currentBookmarks: ["footer-design"],
    nearestBookmark: null,
    ahead: null,
    conflicts: 2,
    additions: 128,
    deletions: 47,
  });
});

test("jj bookmark fields preserve names containing commas", () => {
  assert.equal([...JJ_TEMPLATE.matchAll(/json\(local_bookmarks\.map/g)].length, 2);
  const state = parseJjState([
    'current\tabcdefgh\t["alpha,beta","feature"]\t0\t0\t0',
    'base\tijklmnop\t["main,release"]',
  ].join("\n"));
  assert.deepEqual(state?.currentBookmarks, ["alpha,beta", "feature"]);
  assert.equal(state?.nearestBookmark, "main,release");
  assert.equal(state?.ahead, 1);
});

test("jj distance counts revisions above the nearest bookmark", () => {
  const state = parseJjState([
    "current\tabcdefgh\t[]\t0\t0\t0",
    "step",
    "step",
    'base\tijklmnop\t["main"]',
  ].join("\n"));

  assert.equal(state?.nearestBookmark, "main");
  assert.equal(state?.ahead, 3);
});

test("git state distinguishes branches, detached heads, and dirtiness", () => {
  assert.deepEqual(
    parseGitState("# branch.oid 0123456789abcdef\n# branch.head main\n1 .M N... 100644 100644 100644 abc def file\n"),
    { kind: "git", branch: "main", dirty: true },
  );
  assert.deepEqual(
    parseGitState("# branch.oid 0123456789abcdef\n# branch.head (detached)\n"),
    { kind: "git", branch: "detached@01234567", dirty: false },
  );
});

test("jj workspace discovery walks up from nested directories", () => {
  const root = mkdtempSync(join(tmpdir(), "status-footer-jj-"));
  try {
    const nested = join(root, "one", "two");
    mkdirSync(join(root, ".jj"));
    mkdirSync(nested, { recursive: true });
    assert.equal(findJjWorkspace(nested), root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("footer values use compact formatting and preserve styled extension statuses", () => {
  assert.equal(formatTokenCount(999), "999");
  assert.equal(formatTokenCount(12_400), "12k");
  assert.equal(formatTokenCount(1_100_000), "1.1M");
  assert.equal(formatCost(0, true), "$0 (sub)");
  assert.equal(formatCost(0.1234, false), "$0.123");
  assert.equal(sanitizeLabel("hello\nworld\x1b[31m"), "hello world");
  assert.equal(sanitizeStatusLine("\x1b[31mMCP\x1b[0m\nready"), "\x1b[31mMCP\x1b[0m ready");
});

test("MCP summary counts namespaces and non-hidden tools across exposures", () => {
  const tools = [
    { exposure: "direct", namespace: { name: "mcp__docs" } },
    { exposure: "codemode", namespace: { name: "mcp__docs" } },
    { exposure: "deferred", namespace: { name: "mcp__code" } },
    { exposure: "hidden", namespace: { name: "mcp__code" } },
    { exposure: "hidden", namespace: { name: "mcp__disabled" } },
    { exposure: "direct", namespace: { name: "local" } },
    { exposure: "direct" },
  ];

  assert.equal(formatMcpSummary(tools), "MCP 2 srv / 3 tools");
});

test("MCP summary shows zero when no non-hidden MCP tools are registered", () => {
  assert.equal(formatMcpSummary([]), "MCP 0 tools");
  assert.equal(formatMcpSummary([
    { exposure: "direct" },
    { exposure: "hidden", namespace: { name: "mcp__disabled" } },
  ]), "MCP 0 tools");
});

test("MCP summary follows speed inline without adding an overflow line", () => {
  const mcp = "\x1b[90mMCP 2 srv / 3 tools\x1b[0m";
  const result = composeFooterRuntime({
    context: "ctx 42.0%/200k",
    cost: "$0 (sub)",
    speed: "63 tok/s",
    mcp,
    subscription: true,
    statuses: new Map([["subscription-usage", "7d 8%"]]),
  });

  assert.deepEqual(result, {
    items: ["ctx 42.0%/200k", "7d 8%", "63 tok/s", mcp],
    overflowStatuses: [],
  });
});

test("subscription without a quota status keeps its cost display", () => {
  const result = composeFooterRuntime({
    context: "ctx 42.0%/200k",
    cost: "$0 (sub)",
    speed: "63 tok/s",
    subscription: true,
    statuses: new Map(),
  });

  assert.deepEqual(result, {
    items: ["ctx 42.0%/200k", "$0 (sub)", "63 tok/s"],
    overflowStatuses: [],
  });
});

test("non-subscription cost keeps independent extension statuses", () => {
  const result = composeFooterRuntime({
    context: "ctx 42.0%/200k",
    cost: "$0.123",
    subscription: false,
    statuses: new Map([["subscription-usage", "usage unavailable"]]),
  });

  assert.deepEqual(result, {
    items: ["ctx 42.0%/200k", "$0.123"],
    overflowStatuses: ["usage unavailable"],
  });
});

test("subscription quota replaces synthetic cost without adding a footer line", () => {
  const result = composeFooterRuntime({
    context: "ctx 42.0%/200k",
    cost: "$0 (sub)",
    speed: "63 tok/s",
    subscription: true,
    statuses: new Map([["subscription-usage", "7d 8%"]]),
  });

  assert.deepEqual(result, {
    items: ["ctx 42.0%/200k", "7d 8%", "63 tok/s"],
    overflowStatuses: [],
  });
});
