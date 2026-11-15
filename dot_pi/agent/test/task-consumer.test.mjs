import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, utimesSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const adapterUrl = new URL('../extensions/todos/client.mjs', import.meta.url);
const staged = new URL('../../../.artifacts/task-consumer/staging/node_modules/@attamusc/agent-tasks/dist/core/index.js', import.meta.url);

test('Pi adapter preserves action results, omitted/empty fields, closed lists and actor ownership', async () => {
  assert.ok(existsSync(adapterUrl), 'Pi consumer adapter must exist');
  const { runPiTask } = await import(adapterUrl);
  const core = await import(staged);
  const root = mkdtempSync(join(tmpdir(), 'task-consumer-'));
  const ctx = { hasUI: false, sessionManager: { getSessionId: () => 'pi-one' } };
  const run = input => runPiTask(core, input, root, ctx);
  try {
    const created = await run({ action: 'create', title: 'Synthetic', body: 'keep', tags: ['test'] });
    const id = created.todo.id;
    await run({ action: 'claim', id });
    assert.equal((await run({ action: 'get', id })).todo.assigned_to_session, 'pi-one');
    await run({ action: 'update', id, title: '' });
    assert.equal((await run({ action: 'get', id })).todo.body, 'keep\n');
    await run({ action: 'update', id, body: '', tags: [] });
    assert.equal((await run({ action: 'get', id })).todo.body, '');
    await run({ action: 'append', id, body: ' added ' });
    assert.equal((await run({ action: 'get', id })).todo.body.trim(), 'added');
    const other = { ...ctx, sessionManager: { getSessionId: () => 'mcp-two' } };
    assert.match((await runPiTask(core, { action: 'release', id }, root, other)).error, /assigned/);
    await run({ action: 'update', id, status: 'done' });
    assert.equal((await run({ action: 'list' })).todos.length, 0);
    assert.equal((await run({ action: 'list-all' })).todos.length, 1);
    assert.equal((await run({ action: 'get', id })).todo.assigned_to_session, undefined);
    assert.equal((await run({ action: 'delete', id })).todo.id, id);
    assert.match((await run({ action: 'get', id })).error, /not found/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

for (const choice of ['accept', 'decline', 'no-ui', 'changed']) {
  test(`stale lock ${choice}: assignment force never bypasses explicit confirmation`, async () => {
    const { runPiTask } = await import(adapterUrl);
    const core = await import(staged);
    const root = mkdtempSync(join(tmpdir(), 'task-lock-'));
    try {
      const created = await core.executeTask({ action: 'create', title: 'Locked' }, { storeRoot: root, actorId: 'owner', allowForce: false, allowedActions: core.taskActions });
      const id = created.todo.id;
      const lock = join(root, `${id}.lock`);
      const old = JSON.stringify({ id, pid: 123, session: 'legacy-holder', created_at: '2000-01-01T00:00:00Z' });
      writeFileSync(lock, old);
      utimesSync(lock, new Date(0), new Date(0));
      let prompts = 0;
      const ctx = { hasUI: choice !== 'no-ui', sessionManager: { getSessionId: () => 'pi-one' }, ui: { confirm: async (title, text) => {
        prompts++;
        assert.equal(title, 'Todo locked');
        assert.equal(text, `Todo TODO-${id} appears locked. Steal the lock?`);
        if (choice === 'changed') writeFileSync(lock, 'fresh lock');
        return choice !== 'decline';
      } } };
      const result = await runPiTask(core, { action: 'claim', id, force: true }, root, ctx);
      assert.equal(prompts, choice === 'no-ui' ? 0 : 1);
      if (choice === 'accept') {
        assert.equal(result.todo.assigned_to_session, 'pi-one');
        assert.equal(existsSync(lock), false);
      } else {
        assert.equal(typeof result.error, 'string');
        assert.equal(result.code, choice === 'changed' ? 'lock-changed' : 'stale');
        assert.equal(readFileSync(lock, 'utf8'), choice === 'changed' ? 'fresh lock' : old);
        assert.equal((await core.executeTask({ action: 'get', id }, { storeRoot: root, actorId: 'reader', allowForce: false, allowedActions: ['get'] })).todo.assigned_to_session, undefined);
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

for (const action of ['claim', 'release', 'update']) {
  test(`stale ${action} retry keeps the ordinary domain code and Pi error mapping`, async () => {
    const { runPiTask } = await import(adapterUrl);
    const core = await import(staged);
    const root = mkdtempSync(join(tmpdir(), 'task-retry-'));
    try {
      const created = await core.executeTask({ action: 'create', title: 'Retry' }, { storeRoot: root, actorId: 'owner', allowForce: false, allowedActions: core.taskActions });
      const id = created.todo.id;
      const lock = join(root, `${id}.lock`);
      writeFileSync(lock, '{}'); utimesSync(lock, new Date(0), new Date(0));
      const ctx = { hasUI: true, sessionManager: { getSessionId: () => 'pi-one' }, ui: { confirm: async () => {
        if (action === 'update') unlinkSync(join(root, `${id}.md`));
        else writeFileSync(join(root, `${id}.md`), JSON.stringify({ ...created.todo, assigned_to_session: 'other' }) + '\n');
        return true;
      } } };
      const result = await runPiTask(core, { action, id }, root, ctx);
      assert.equal(result.code, action === 'update' ? 'missing' : 'assigned');
      if (action === 'claim') assert.equal(result.error, `Todo TODO-${id} is already assigned to session other. Use force to override.`);
      if (action === 'release') assert.equal(result.error, `Todo TODO-${id} is assigned to session other. Use force to release.`);
      if (action === 'update') assert.equal(result.error, `Todo TODO-${id} not found`);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}
