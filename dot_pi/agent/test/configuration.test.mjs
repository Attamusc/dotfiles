import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { inspectDiscoveryCommand } from "../extensions/command-safety/policy.mjs";
import { migrateLegacyTodos, projectScopeSlug } from "../extensions/todos/scope.mjs";

const agentDir = join(dirname(fileURLToPath(import.meta.url)), "..", "agents");

function parseAgent(file) {
  const source = readFileSync(join(agentDir, file), "utf8");
  const frontmatterEnd = source.indexOf("---", 3);
  const frontmatter = source.slice(3, frontmatterEnd);
  const body = source.slice(frontmatterEnd + 3);
  const tools = frontmatter.match(/^tools:\s*(.+)$/m)?.[1]
    .split(",")
    .map((tool) => tool.trim());
  return { file, body, tools };
}

test("restricted agents receive every tool required by their instructions", () => {
  const failures = [];

  for (const file of readdirSync(agentDir).filter((name) => name.endsWith(".md"))) {
    const agent = parseAgent(file);
    if (!agent.tools) continue;

    if (/\btodo(?:\(|'s|\s+acceptance criteria)/i.test(agent.body) && !agent.tools.includes("todo")) {
      failures.push(`${file} references todos but omits the todo tool`);
    }
    if (/(?:`write` tool|write tool|write your report)/i.test(agent.body) && !agent.tools.includes("write")) {
      failures.push(`${file} requires writing a report but omits the write tool`);
    }
  }

  assert.deepEqual(failures, []);
});

test("subagent discovery policy blocks unbounded roots and bounds scoped searches", () => {
  for (const command of [
    'find / -name "TODO-deadbeef"',
    'find ~ -type d -name todos',
    'find "$HOME" -type d -name todos',
    "find '/' -name '*.md'",
    'grep -rl "TODO-deadbeef" ~',
    'rg "TODO-deadbeef" $HOME',
  ]) {
    assert.equal(inspectDiscoveryCommand(command)?.block, true, command);
  }

  assert.deepEqual(inspectDiscoveryCommand('find . -name "*.ts"'), { timeout: 30 });
  assert.deepEqual(inspectDiscoveryCommand('rg "TODO-deadbeef" ~/.pi/history/my-repo/todos'), { timeout: 30 });
  assert.equal(inspectDiscoveryCommand("cargo test --workspace"), undefined);
});

test("todo scope follows the canonical repository root without basename collisions", () => {
  const temp = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "todo-scope-"));
  try {
    const first = join(temp, "one", "repo");
    const second = join(temp, "two", "repo");
    mkdirSync(join(first, ".git"), { recursive: true });
    mkdirSync(join(first, "nested"));
    mkdirSync(join(second, ".git"), { recursive: true });

    assert.equal(projectScopeSlug(first), projectScopeSlug(join(first, "nested")));
    assert.notEqual(projectScopeSlug(first), projectScopeSlug(second));
    assert.match(projectScopeSlug(first), /^repo-[a-f0-9]{8}$/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("todo scope migrates the legacy basename directory once", async () => {
  const temp = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "todo-migrate-"));
  try {
    const repo = join(temp, "repo");
    const history = join(temp, "history");
    const legacyTodos = join(history, "repo", "todos");
    mkdirSync(join(repo, ".git"), { recursive: true });
    mkdirSync(legacyTodos, { recursive: true });
    writeFileSync(join(legacyTodos, "deadbeef.md"), "task");

    await migrateLegacyTodos(repo, history);
    await migrateLegacyTodos(repo, history);

    const scopedTodos = join(history, projectScopeSlug(repo), "todos");
    assert.equal(readFileSync(join(scopedTodos, "deadbeef.md"), "utf8"), "task");
    assert.equal(lstatSync(legacyTodos).isSymbolicLink(), true);
    assert.equal(realpathSync(legacyTodos), realpathSync(scopedTodos));

    const sameNamedRepo = join(temp, "other", "repo");
    mkdirSync(join(sameNamedRepo, ".git"), { recursive: true });
    await migrateLegacyTodos(sameNamedRepo, history);
    assert.equal(existsSync(join(history, projectScopeSlug(sameNamedRepo), "todos")), false);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
