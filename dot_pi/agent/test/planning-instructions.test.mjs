import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
function readPlanner(agentRoot, role = 'planner') {
  const sourceMarker = new URL('../../.data/pi/agent/settings.json', agentRoot);
  const relativePath = `agents/${role}.md${existsSync(sourceMarker) ? '.tmpl' : ''}`;
  return readFileSync(new URL(relativePath, agentRoot), 'utf8');
}
const planner = readPlanner(root);
const routing = readFileSync(new URL('AGENTS.md', root), 'utf8');

test('planner resolution supports applied layout without masking missing source files', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'planning-layout-'));
  try {
    const agentPath = join(temporary, 'dot_pi', 'agent');
    mkdirSync(join(agentPath, 'agents'), { recursive: true });
    const agentRoot = pathToFileURL(`${agentPath}/`);
    writeFileSync(join(agentPath, 'agents', 'planner.md'), 'applied planner');
    assert.equal(readPlanner(agentRoot), 'applied planner');
    mkdirSync(join(temporary, '.data', 'pi', 'agent'), { recursive: true });
    writeFileSync(join(temporary, '.data', 'pi', 'agent', 'settings.json'), '{}');
    assert.throws(() => readPlanner(agentRoot), { code: 'ENOENT' });
    writeFileSync(join(agentPath, 'agents', 'planner.md.tmpl'), 'source planner');
    assert.equal(readPlanner(agentRoot), 'source planner');
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('planning delegates unclaimed tasks to the existing worker claim owner', () => {
  const worker = readPlanner(root, 'worker');
  const tracker = readFileSync(new URL('skills/todo-tracker.md', root), 'utf8');
  assert.match(worker, /todo\(action: "claim", id: "TODO-xxxx"\)/);
  assert.match(worker, /release the todo/);
  assert.match(tracker, /Do not work a claimed issue belonging to/);
  for (const source of [planner, routing]) {
    assert.match(source, /unclaimed and eligible/);
    assert.match(source, /without claiming on the worker's behalf/);
    assert.match(source, /implementation worker fetches and claims/i);
    assert.match(source, /authoritative task scope before writes/);
    assert.match(source, /mismatch.*pause before writes/is);
    assert.doesNotMatch(source, /orchestrator retains dependency checks and claims|claim eligible tasks, then delegate/);
  }
});
test('delegated planner writes drafts but the orchestrator collects build approval once', () => {
  assert.match(planner, /main author is the sole writer/);
  assert.match(planner, /planner is the sole writer of the assigned proposal\/draft tasks/);
  assert.match(planner, /main author\/orchestrator presents the reviewed proposal and collects/i);
  assert.match(planner, /delegated planner does not ask for permission to build or activate tasks/);
  assert.match(planner, /identical reviewed version need not be re-asked/);
  assert.match(planner, /summary, completion handshake, or approval of a direction alone is not proof/);
});

// Instruction consistency only: these checks do not establish model behavior.
test('planning investigates facts and offers a compact proposal without ceremonies', () => {
  assert.match(planner, /current conversation/);
  assert.match(planner, /250–400 words/);
  assert.match(planner, /source.*rather than asking the user/i);
  assert.match(planner, /unchanged/);
  assert.match(planner, /observable success/i);
  assert.match(planner, /potential harm/i);
  assert.match(planner, /recovery/);
  assert.doesNotMatch(planner, /## Phase \d|MUST follow all phases|one phase per message/);
});
test('draft review and execution consent remain distinct from post-code checks', () => {
  for (const phrase of [/fresh read-only reviewer/, /without.*conversation/, /one re-review/, /explicit execution approval/, /planning-only/, /material change/, /contract validation/]) {
    assert.match(planner, phrase);
  }
  assert.match(planner, /tools: "read"/);
  assert.match(planner, /inline acceptance criteria/i);
});
test('routing removes BBQ, keeps explicit grilling and lightweight iterate', () => {
  assert.equal(existsSync(new URL('prompts/bbq.md', root)), false);
  assert.doesNotMatch(routing, /\/bbq/);
  assert.match(routing, /grill-with-docs/);
  assert.match(routing, /interactive: true, fork: true/);
  assert.match(routing, /current conversation/);
});
