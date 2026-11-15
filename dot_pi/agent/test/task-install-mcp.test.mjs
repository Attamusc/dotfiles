import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, chmodSync, existsSync, rmSync, openSync, closeSync, unlinkSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolveTaskStore } from '../extensions/todos/scope.ts';
import { runPiTask } from '../extensions/todos/client.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const staging = join(root, '.artifacts/task-consumer/staging');
const requirePackage = createRequire(join(staging, 'node_modules/@attamusc/agent-tasks/package.json'));
const { Client } = await import(requirePackage.resolve('@modelcontextprotocol/sdk/client/index.js'));
const { StdioClientTransport } = await import(requirePackage.resolve('@modelcontextprotocol/sdk/client/stdio.js'));
const pin = JSON.parse(readFileSync(join(root, 'dot_pi/agent/extensions/todos/package-pin.json')));
const artifact = process.env.TASK_TEST_ARTIFACT;

function fixture() {
  const home = mkdtempSync(join(root, '.artifacts/task-consumer/home-'));
  cpSync(join(root, 'dot_pi/agent/extensions/todos'), join(home, '.pi/agent/extensions/todos'), { recursive: true });
  mkdirSync(join(home, '.local/bin'), { recursive: true });
  for (const name of ['install-pi-agent-tasks', 'pi-agent-tasks-mcp']) cpSync(join(root, `dot_local/bin/executable_${name}`), join(home, '.local/bin', name));
  const shim = join(home, 'mock-bin'); mkdirSync(shim);
  writeFileSync(join(shim, 'gh'), `#!/usr/bin/env python3
import os,sys,shutil
args=sys.argv[1:]
mode=os.environ.get('MOCK_GH','private')
if args[:2]==['auth','status']: sys.exit(1 if mode=='no-auth' else 0)
if args[:2]==['repo','view']: print('false' if mode=='public' else 'true'); sys.exit(0)
if args[:2]==['release','download']:
 dest=os.path.join(args[args.index('--dir')+1],args[args.index('--pattern')+1])
 if mode=='bad-sha': open(dest,'w').write('not the approved bytes')
 else: shutil.copyfile(os.environ['TASK_TEST_ARTIFACT'],dest)
 sys.exit(0)
sys.exit(1)
`); chmodSync(join(shim, 'gh'), 0o755);
  const releasePin = join(home, '.pi/agent/extensions/todos/package-pin.json');
  writeFileSync(releasePin, JSON.stringify({ ...pin, published: true }));
  const env = { ...process.env, HOME: home, XDG_DATA_HOME: join(home, 'ignored-xdg'), PATH: `${shim}:${process.env.PATH}`, TASK_TEST_ARTIFACT: artifact };
  const install = mode => spawnSync('python3', [join(home, '.local/bin/install-pi-agent-tasks')], { env: { ...env, MOCK_GH: mode }, encoding: 'utf8' });
  return { home, env, install, target: join(home, '.local/share/pi-agent-tasks', pin.sha256) };
}

test('private installer is exact/idempotent; auth, visibility, SHA and owned-state collisions fail closed', async () => {
  assert.ok(artifact && existsSync(artifact), 'TASK_TEST_ARTIFACT must name the approved local tarball');
  for (const mode of ['no-auth', 'public', 'bad-sha']) {
    const f = fixture();
    try { const result = f.install(mode); assert.equal(result.status, 1, result.stdout + result.stderr); assert.equal(existsSync(f.target), false); }
    finally { rmSync(f.home, { recursive: true, force: true }); }
  }
  const f = fixture();
  try {
    const pinFile = join(f.home, '.pi/agent/extensions/todos/package-pin.json');
    writeFileSync(pinFile, JSON.stringify({ ...pin, published: false }));
    const unpublished = f.install('private');
    assert.equal(unpublished.status, 1);
    assert.match(unpublished.stderr, /unpublished/);
    writeFileSync(pinFile, JSON.stringify({ ...pin, published: true }));
    const { loadTaskPackage } = await import('../extensions/todos/package.mjs');
    await assert.rejects(loadTaskPackage('core', f.home), /no legacy fallback/);
    const foreign = join(f.home, 'foreign-prefix'); mkdirSync(foreign); writeFileSync(join(foreign, 'sentinel'), 'keep');
    mkdirSync(join(f.target, '..'), { recursive: true }); symlinkSync(foreign, f.target, 'dir');
    const linked = f.install('private'); assert.equal(linked.status, 1); assert.match(linked.stderr, /symlink/);
    assert.equal(readFileSync(join(foreign, 'sentinel'), 'utf8'), 'keep'); unlinkSync(f.target);
    mkdirSync(f.target, { recursive: true }); writeFileSync(join(f.target, 'user-state'), 'keep');
    assert.equal(f.install('private').status, 1);
    assert.equal(readFileSync(join(f.target, 'user-state'), 'utf8'), 'keep');
    rmSync(f.target, { recursive: true });
    const first = f.install('private'); assert.equal(first.status, 0, first.stdout + first.stderr);
    const second = f.install('no-auth'); assert.equal(second.status, 0, second.stdout + second.stderr);
    assert.match(second.stdout, /already installed and verified/);
    writeFileSync(join(f.target, 'unknown'), 'keep');
    assert.equal(f.install('private').status, 1);
    assert.equal(readFileSync(join(f.target, 'unknown'), 'utf8'), 'keep');
  } finally { rmSync(f.home, { recursive: true, force: true }); }
});

test('hand-written MCP config binds captured scope under stripped/contradictory environment and shares Pi locks/actors', async () => {
  const f = fixture();
  try {
    const installed = f.install('private'); assert.equal(installed.status, 0, installed.stdout + installed.stderr);
    assert.ok(process.env.PI_TEST_SDK, 'PI_TEST_SDK must name the installed Pi SDK root');
    const parent = join(f.home, 'project'); mkdirSync(join(parent, '.git'), { recursive: true }); mkdirSync(join(parent, 'nested'));
    for (const override of [undefined, '../sdk-relative-store', join(f.home, 'sdk-absolute-store')]) {
      const env = { ...process.env, HOME: f.home }; delete env.PI_TODO_PATH;
      if (override !== undefined) env.PI_TODO_PATH = override;
      const probe = spawnSync(process.execPath, [fileURLToPath(new URL('./fixtures/task-pi-probe.mjs', import.meta.url)), join(root, 'dot_pi/agent/extensions/todos/index.ts')], {
        cwd: join(parent, 'nested'), env, encoding: 'utf8', timeout: 30000,
      });
      assert.equal(probe.status, 0, probe.stdout + probe.stderr);
      assert.match(probe.stdout, /PASS: SDK-loaded/);
    }
    const { loadTaskPackage } = await import('../extensions/todos/package.mjs');
    const installedCore = await loadTaskPackage('core', f.home);
    assert.equal(typeof (await loadTaskPackage('mcp', f.home)).startTaskMcpServer, 'function');
    const elsewhere = join(f.home, 'other'); mkdirSync(join(elsewhere, '.git'), { recursive: true });
    const ctx = { hasUI: false, sessionManager: { getSessionId: () => 'pi-actor' } };
    const configs = JSON.parse(readFileSync(new URL('./fixtures/task-mcp-config.json', import.meta.url), 'utf8'));
    const bindings = [
      ['empty', configs.mcpServers.empty, ''],
      ['spaces', configs.mcpServers.spaces, 'tasks with spaces'],
      ['absolute', { ...configs.mcpServers.empty, args: configs.mcpServers.empty.args.map(arg => arg === '--store-override=' ? `--store-override=${join(f.home, 'absolute store')}` : arg) }, join(f.home, 'absolute store')],
    ];
    for (const [name, config, override, contradictory] of bindings.flatMap(binding => [ [...binding, false], [...binding, true] ])) {
      const store = resolveTaskStore(parent, override, join(f.home, '.pi/history'));
      assert.equal(resolveTaskStore(join(parent, 'nested'), name === 'spaces' ? '../tasks with spaces' : override, join(f.home, '.pi/history')), store);
      await installedCore.initializeStore(store);
      const created = await runPiTask(installedCore, { action: 'create', title: name }, store, ctx);
      const id = created.todo.id;
      const args = config.args.map(value => value === '__LAUNCHER__' ? join(f.home, '.local/bin/pi-agent-tasks-mcp') : value === '__PARENT__' ? parent : value);
      const transport = new StdioClientTransport({ command: process.execPath, args, cwd: elsewhere, env: { HOME: f.home, PATH: process.env.PATH, ...(contradictory ? { PI_TODO_PATH: join(f.home, 'wrong-store'), XDG_DATA_HOME: join(f.home, 'wrong-xdg') } : {}) }, stderr: 'pipe' });
      const client = new Client({ name: 'consumer-test', version: '1' });
      await client.connect(transport);
      try {
        assert.equal((await client.listTools()).tools[0].name, 'todo');
        const call = async input => (await client.callTool({ name: 'todo', arguments: input }));
        const got = await call({ action: 'get', id }); assert.equal(got.structuredContent.todo.id, id);
        const claimed = await call({ action: 'claim', id }); assert.equal(claimed.structuredContent.todo.assigned_to_session, 'native-stable-actor');
        assert.match((await runPiTask(installedCore, { action: 'release', id }, store, ctx)).error, /assigned/);
        await call({ action: 'release', id });
        const contenders = await Promise.all([runPiTask(installedCore, { action: 'claim', id }, store, ctx), call({ action: 'claim', id })]);
        assert.equal(Number('todo' in contenders[0]) + Number(contenders[1].isError === false), 1);
        await runPiTask(installedCore, { action: 'release', id, force: true }, store, ctx);
        // A legacy wx holder blocks both adapters, and each adapter frees the same namespace.
        const lock = join(store, `${id}.lock`); const fd = openSync(lock, 'wx');
        try {
          assert.match((await runPiTask(installedCore, { action: 'claim', id }, store, ctx)).error, /locked/);
          assert.equal((await call({ action: 'claim', id })).isError, true);
        } finally { closeSync(fd); unlinkSync(lock); }
        await call({ action: 'claim', id }); await call({ action: 'release', id });
        const legacy = openSync(lock, 'wx'); closeSync(legacy); unlinkSync(lock);
        assert.equal(existsSync(join(f.home, 'wrong-store')), false);
      } finally { await client.close(); }
    }
    const store = resolveTaskStore(parent, '', join(f.home, '.pi/history'));
    assert.notEqual(resolveTaskStore(elsewhere, '', join(f.home, '.pi/history')), store);
    const launcher = join(f.home, '.local/bin/pi-agent-tasks-mcp');
    for (const args of [ ['--scope-cwd', elsewhere, '--store-override=', '--actor', 'native', '--actions', 'get'], ['--scope-cwd', parent, '--actor', 'native', '--actions', 'get'], ['--scope-cwd', parent, '--store-override', '', '--actor', 'native', '--actions', 'get'], ['--synthetic-secret=' + 'x'.repeat(2048)] ]) {
      const result = spawnSync(process.execPath, [launcher, ...args], { cwd: elsewhere, env: { HOME: f.home, PATH: process.env.PATH }, encoding: 'utf8', timeout: 5000 });
      assert.equal(result.status, 1, result.stderr);
      assert.equal(result.stdout, '');
      const diagnostic = JSON.parse(result.stderr.trim()).error;
      assert.ok(['invalid-startup', 'missing-store'].includes(diagnostic.code));
      assert.ok(Buffer.byteLength(result.stderr) < 512);
      assert.doesNotMatch(result.stderr, /synthetic-secret|at file:/);
    }
    assert.equal(existsSync(resolveTaskStore(elsewhere, '', join(f.home, '.pi/history'))), false);
    const missingStore = join(f.home, 'stale-nonexistent-override');
    const args = ['--scope-cwd', parent, `--store-override=${missingStore}`, '--actor', 'native', '--actions', 'get,claim'];
    const stale = spawnSync(process.execPath, [launcher, ...args], { cwd: elsewhere, env: { HOME: f.home, PATH: process.env.PATH }, encoding: 'utf8', timeout: 5000 });
    assert.equal(stale.status, 1); assert.equal(stale.stdout, '');
    assert.equal(JSON.parse(stale.stderr.trim()).error.code, 'missing-store');
    assert.equal(existsSync(missingStore), false);
    const foreignHome = join(f.home, 'foreign-home'); mkdirSync(foreignHome);
    for (const value of [undefined, foreignHome]) {
      const env = { PATH: process.env.PATH }; if (value !== undefined) env.HOME = value;
      const result = spawnSync(process.execPath, [launcher, ...args], { cwd: elsewhere, env, encoding: 'utf8', timeout: 5000 });
      assert.equal(result.status, 1); assert.equal(result.stdout, '');
      assert.equal(JSON.parse(result.stderr.trim()).error.code, value === undefined ? 'invalid-home' : 'home-mismatch');
      assert.ok(Buffer.byteLength(result.stderr) < 512);
      assert.doesNotMatch(result.stderr, /stack|at file:|stale-nonexistent|foreign-home/);
      assert.equal(existsSync(missingStore), false);
      assert.equal(existsSync(join(foreignHome, '.pi')), false);
    }
  } finally { rmSync(f.home, { recursive: true, force: true }); }
});
