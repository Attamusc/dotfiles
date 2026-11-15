import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { stripTypeScriptTypes, createRequire } from 'node:module';
import vm from 'node:vm';
const root = path.resolve(import.meta.dirname, '../../..');
const staged = '.chezmoitemplates/native-agent-definitions/';
const read = p => readFileSync(path.join(root, p), 'utf8');
const workflowRoot = process.env.PI_WORKFLOWS_GUARD_ROOT;
const executionSource = process.env.PI_EXECUTION_SOURCE;
const subagentRoot = process.env.PI_SUBAGENT_SOURCE;
const normalize = text => text.replace(/\r\n/g, '\n');
function packageEntry() {
  const dir = path.join(workflowRoot, 'node_modules/pi-agent-execution');
  const manifest = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
  return pathToFileURL(path.resolve(dir, manifest.exports['.'].import));
}
function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'native-runner-guidance-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const home = path.join(dir, 'home'); mkdirSync(home);
  const args = ['--source', root, '--destination', home, '--cache', path.join(dir, 'cache'), '--config', path.join(dir, 'chezmoi.toml'), '--no-tty', '--refresh-externals=never', '--override-data', JSON.stringify({ chezmoi: { os: 'linux', arch: 'amd64', username: 'fixture', hostname: 'fixture', homeDir: home, osRelease: { id: 'fedora', versionID: '44' } } })];
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(dir, 'config'), XDG_CACHE_HOME: path.join(dir, 'cache'), XDG_DATA_HOME: path.join(dir, 'data') };
  return { home, render: file => execFileSync('chezmoi', [...args, 'execute-template', '--init', '--file', path.join(root, file)], { env, encoding: 'utf8' }), managed: () => execFileSync('chezmoi', [...args, 'managed'], { env, encoding: 'utf8' }) };
}

test('Pi worker body matches its rendered partial and committed pre-extraction golden without VCS', t => {
  const goldenPath = 'dot_pi/agent/test/fixtures/worker-body-golden.json';
  assert.ok(existsSync(path.join(root, goldenPath)), 'committed worker-body golden must exist');
  const golden = JSON.parse(read(goldenPath));
  const f = fixture(t);
  const ordinary = normalize(f.render('dot_pi/agent/agents/worker.md.tmpl'));
  const partial = normalize(f.render('.chezmoitemplates/worker-body'));
  assert.equal(ordinary.slice(ordinary.indexOf('# Worker Agent')), partial);
  assert.equal(Buffer.byteLength(partial, 'utf8'), golden.bytes);
  assert.equal(createHash('sha256').update(partial, 'utf8').digest('hex'), golden.sha256);
  for (const line of ['tools: read, bash, write, edit, todo', 'deny-tools: claude', 'thinking: low', 'spawning: false', 'auto-exit: true', 'system-prompt: append']) assert.ok(ordinary.split('---')[1].includes(line));
  assert.doesNotMatch(ordinary.split('---')[1], /^runner:/m);
  assert.match(read(staged + 'worker-copilot.md.tmpl'), /includeTemplate "worker-body"/);
  assert.doesNotMatch(read(staged + 'worker-copilot-readonly.md.tmpl'), /includeTemplate "worker-body"/);
  const managed = f.managed().split(/\r?\n/);
  assert.equal(managed.some(file => /(?:^|\/)(?:worker-copilot(?:-readonly)?(?:\.md)?|native-agent-definitions|worker-body)(?:\/|$)/.test(file)), false);
});

test('coding profile declares commit skill while reader has no selected skill', () => {
  assert.match(read(staged + 'worker-copilot.md.tmpl').split('---')[1], /^skills: commit$/m);
  assert.doesNotMatch(read(staged + 'worker-copilot-readonly.md.tmpl').split('---')[1], /^skills?:/m);
});

test('staged native roles render with actual contract2 parser and explicit current-host MCP binding', async t => {
  if (!workflowRoot) { t.skip('set PI_WORKFLOWS_GUARD_ROOT to the accepted contract2 overlay'); return; }
  const { parseAgentDefinition, bindNativeMcp, contractVersion } = await import(packageEntry());
  assert.equal(contractVersion, 2);
  const f = fixture(t);
  for (const [name, actions] of [['worker-copilot', 'get,claim,update,append,release'], ['worker-copilot-readonly', 'get,list,list-all']]) {
    const text = f.render(staged + name + '.md.tmpl');
    const canonicalRoot = path.join(f.home, '.pi/agent/agents');
    const canonicalPath = path.join(canonicalRoot, name + '.md');
    const parsed = parseAgentDefinition({ path: canonicalPath, content: text, origin: { kind: 'global-user', canonicalPath, canonicalRoot } }, { requiredFields: ['name', 'description'] });
    assert.equal(parsed.ok, true, JSON.stringify(parsed.diagnostics));
    const d = parsed.definition;
    assert.equal(d.runner, 'copilot'); assert.equal(d.model, 'gpt-6.1-sol'); assert.equal(d.thinking, 'low');
    assert.deepEqual(d.skills, name === 'worker-copilot' ? ['commit'] : undefined);
    assert.equal(d.native.runnerVersion, '1.0.106-3'); assert.equal(d.native.workspaceTrust, 'session');
    assert.equal(d.metadata['auto-exit'], true); assert.equal(d.metadata.interactive, false);
    for (const key of ['tools', 'deny-tools', 'spawning', 'system-prompt']) assert.doesNotMatch(text.split('---')[1], new RegExp('^' + key + ':', 'm'));
    assert.deepEqual(d.native.allow, name === 'worker-copilot' ? ['write', 'shell', 'tasks(todo)'] : ['tasks(todo)']);
    assert.deepEqual(d.native.deny, name === 'worker-copilot' ? [] : ['write', 'shell']);
    for (const inheritedHome of [undefined, '/synthetic/contradictory-home']) {
      const old = process.env.HOME; if (inheritedHome === undefined) delete process.env.HOME; else process.env.HOME = inheritedHome;
      try {
        const binding = bindNativeMcp(d.native, { home: f.home, node: '/trusted/absolute/node', parentCwd: '/captured/parent', managedSessionId: 'managed-actor', todoPathLiteral: 'tasks with spaces' }).tasks;
        assert.equal(binding.command, '/trusted/absolute/node'); assert.deepEqual(binding.env, { HOME: f.home });
        assert.ok(binding.args.includes('--store-override=tasks with spaces')); assert.ok(binding.args.includes('/captured/parent'));
        assert.equal(binding.args.at(-1), actions); assert.equal(binding.args.includes('--allow-force'), false);
      } finally { if (old === undefined) delete process.env.HOME; else process.env.HOME = old; }
    }
    assert.match(text, /not[\s\S]{0,40}(?:OS|operating.system).*sandbox/i); assert.match(text, /global.*plugin/i);
  }
});

test('common guidance requires role/model defaults without per-call harness overrides', () => {
  const skill = read('dot_pi/agent/skills/atta-work/SKILL.md');
  const example = skill.split('```typescript')[1].split('```')[0];
  assert.doesNotMatch(example, /model:|tools:|thinking:/);
  assert.match(skill, /MUST declare/);
  for (const row of [
    '| caller, maker, evidence | `github-copilot/gpt-6.1-sol` | `gpt-6.1-sol` | high |',
    '| judge, prose-checker | `github-copilot/claude-opus-5.5` | `claude-opus-5.5` | high |',
    '| alternative facts | `github-copilot/gpt-6-luna` | `gpt-6-luna` | high |',
  ]) assert.ok(skill.includes(row), row);
  assert.match(skill, /definition defaults/i); assert.match(skill, /Pi-only/); assert.match(skill, /read-only Pi/);
});

// Optional source characterization: never execute extension module factories or launchers.
test('baseline consumers ignore runner fields and can select Pi: characterization, not fail-closed proof', async t => {
  if (!executionSource || !subagentRoot || !workflowRoot) { t.skip('set the three baseline source/overlay inputs for acceptance characterization'); return; }
  const show = (cwd, rev, file) => execFileSync('git', ['-C', cwd, 'show', `${rev}:${file}`], { encoding: 'utf8' });
  const require = createRequire(path.join(workflowRoot, 'node_modules/pi-agent-execution/package.json'));
  const yaml = await import(pathToFileURL(require.resolve('yaml')));
  const js = source => stripTypeScriptTypes(source, { mode: 'transform', sourceMap: false }).replace(/^import .*?;\n/gm, '').replace(/export /g, '');
  const internal = show(executionSource, '091fada20c05470af558a5a121932e43186b8144', 'src/internal.ts');
  const isThinkingLevel = vm.runInNewContext(js(internal) + '\nisThinkingLevel');
  const parserSource = show(executionSource, '091fada20c05470af558a5a121932e43186b8144', 'src/definitions.ts');
  const parseSharedAgentDefinition = vm.runInNewContext(js(parserSource) + '\nparseAgentDefinition', { ...yaml, isThinkingLevel });
  const text = read(staged + 'worker-copilot-readonly.md.tmpl');
  const oldParsed = parseSharedAgentDefinition({ path: '/synthetic/role.md', content: text }, { requiredFields: ['name', 'description'] });
  assert.equal(oldParsed.ok, true); assert.equal(oldParsed.definition.runner, undefined); assert.equal(oldParsed.definition.metadata.runner, 'copilot');
  const subagent = show(subagentRoot, '4e74606d8aac27aada5c868647e7eb3834181b6c', 'pi-extension/subagents/index.ts');
  const functions = subagent.slice(subagent.indexOf('function metadataString('), subagent.indexOf('function discoverAgentDefinitions('));
  const parseVisible = vm.runInNewContext(js(functions) + '\nparseVisibleAgentDefinition', { parseSharedAgentDefinition });
  const agentDefs = parseVisible('/synthetic/role.md', text);
  const harnessLine = subagent.match(/const harness = agentDefs\?\.cli === "claude" \? "Claude" : "Pi";/)[0];
  assert.equal(vm.runInNewContext(harnessLine + '\nharness', { agentDefs }), 'Pi');
  const agents = show(workflowRoot, '1614faf29c6ad1d0fcc9fe6db86a770f34e2b129', 'src/agents.ts');
  const projection = agents.slice(agents.indexOf('export function toWorkflowAgentDefinition('), agents.indexOf('export interface AgentDiscoveryResult'));
  const toWorkflow = vm.runInNewContext(js(projection) + '\ntoWorkflowAgentDefinition');
  assert.equal(Object.keys(toWorkflow({ name: 'native', description: 'Native', systemPrompt: '', definition: oldParsed.definition }).metadata).length, 0);
  const runner = show(workflowRoot, '1614faf29c6ad1d0fcc9fe6db86a770f34e2b129', 'src/runner.ts');
  assert.ok(runner.includes('const args = ["--mode", "json", "-p", "--no-session"]'));
});
