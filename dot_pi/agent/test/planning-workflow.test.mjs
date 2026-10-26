import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scopedTodosDir } from '../extensions/todos/scope.ts';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const sourceLayout = existsSync(new URL('../../.data/pi/agent/settings.json', root));
const read = path => readFileSync(new URL(path, root), 'utf8');
const planner = read(`agents/planner.md${sourceLayout ? '.tmpl' : ''}`);

test('actual todo scope resolution distinguishes another checkout before any claim or write', () => {
  const dir = mkdtempSync(join(tmpdir(), 'planning-todo-scope-'));
  try {
    const authoritative = join(dir, 'authoritative');
    const other = join(dir, 'other');
    mkdirSync(join(authoritative, '.git'), { recursive: true });
    mkdirSync(join(authoritative, 'nested'));
    mkdirSync(join(other, '.git'), { recursive: true });
    const history = join(dir, 'history');
    const store = scopedTodosDir(authoritative, history);
    mkdirSync(store, { recursive: true });
    writeFileSync(join(store, 'aabbccdd.md'), 'runner-owned ticket');
    assert.equal(scopedTodosDir(join(authoritative, 'nested'), history), store);
    const differentStore = scopedTodosDir(other, history);
    assert.notEqual(differentStore, store);
    assert.equal(existsSync(join(differentStore, 'aabbccdd.md')), false);
    assert.equal(readFileSync(join(store, 'aabbccdd.md'), 'utf8'), 'runner-owned ticket');
    // No fake frontier/approval engine: safe pause is an instruction, not enforced here.
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Soft workflow contract checks only; these do not simulate or certify model decisions.
test('managed and native reviewer instructions support pre-code evidence-only plan checks', () => {
  for (const path of [`agents/reviewer.md${sourceLayout ? '.tmpl' : ''}`, 'agents/claude-reviewer.md']) {
    const role = read(path);
    for (const pattern of [/evidence-only plan check/i, /clarity, self-containment, consistency/, /source contracts.*readiness/, /without requiring implemented code, a diff, or passing test output/, /return findings inline/i, /do not run commands, fetch todos, or write files/i, /missing or truncated.*incomplete/i]) {
      assert.match(role, pattern, path);
    }
  }
  const reviewer = read(`agents/reviewer.md${sourceLayout ? '.tmpl' : ''}`);
  assert.match(reviewer, /steps below apply unless.*evidence-only review/i);
  assert.match(reviewer, /use the `write` tool to save the review/i);
  assert.match(reviewer, /tools: read, bash, write, todo/);
});
test('review instructions require effective fresh context, not a misleading fork:false override', () => {
  assert.match(planner, /task: "Evidence-only plan check:/);
  assert.match(planner, /effective session mode/i);
  assert.match(planner, /fork: false.*does not override/is);
  assert.match(planner, /pause before dispatch/i);
});
test('resolved worker brief carries authoritative-scope pause before writes', () => {
  assert.match(planner, /include.*scope-mismatch-before-writes/is);
  const routing = read('AGENTS.md');
  assert.match(routing, /Resolved task:.*scope-mismatch-before-writes/);
  assert.match(routing, /Proposal path:.*Draft task artifact paths:.*Stop after.*do not ask for build approval/);
});
test('review checks task-only commitments and incomplete/stale consent without replacing code review', () => {
  for (const pattern of [/resolved draft task bodies plus allowed source references/, /cannot hide commitments/, /Failed, missing, empty, or incomplete review is not approval/, /one re-review/, /Unresolved material blockers.*pause/, /planning-only request stops with drafts and no worker launch/, /Only the main author\/orchestrator may activate/, /material change.*invalidates/, /cosmetic edits do not require another ceremony/, /stale summary is not execution permission/, /independent post-code review/, /contract validation/]) {
    assert.match(planner, pattern);
  }
});
