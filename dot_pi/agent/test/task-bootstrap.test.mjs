import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, cpSync, chmodSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const hookName = 'run_onchange_after_17-install-pi-agent-tasks.sh.tmpl';
const python = execFileSync('/usr/bin/which', ['python3'], { encoding: 'utf8' }).trim();
const npm = join(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js');

test('rendered task hook uses managed mise from HOME with no initial node/npm, and unpublished stops before gh', () => {
  const work = mkdtempSync(join(root, '.artifacts/task-consumer/bootstrap-'));
  try {
    const home = join(work, 'home'); mkdirSync(join(home, '.local/bin'), { recursive: true });
    mkdirSync(join(home, '.config/mise'), { recursive: true }); writeFileSync(join(home, '.config/mise/config.toml'), '[tools]\nnode="25.8.1"\n');
    const clean = join(work, 'clean-bin'); const managed = join(work, 'managed-bin'); mkdirSync(clean); mkdirSync(managed);
    symlinkSync(python, join(clean, 'python3')); symlinkSync(process.execPath, join(managed, 'node')); symlinkSync(npm, join(managed, 'npm'));
    writeFileSync(join(clean, 'gh'), '#!/bin/bash\nprintf called > "$HOME/gh-called"\nexit 99\n'); chmodSync(join(clean, 'gh'), 0o755);
    const mise = join(home, '.local/bin/mise');
    writeFileSync(mise, `#!/bin/bash
set -eu
[[ "$PWD" == "$HOME" && "$MISE_CONFIG_DIR" == "$HOME/.config/mise" && -z "\${MISE_GLOBAL_CONFIG_FILE+x}" ]]
! command -v node >/dev/null
! command -v npm >/dev/null
[[ "$1" == exec && "$2" == -- && "$3" == python3 ]]
printf managed > "$HOME/mise-called"
shift 2
export PATH="$MANAGED_BIN:$PATH"
exec "$@"
`); chmodSync(mise, 0o755);
    const env = { HOME: home, PATH: clean, MANAGED_BIN: managed, MISE_GLOBAL_CONFIG_FILE: '/contradictory/project-config', MISE_CONFIG_DIR: '/contradictory/config' };
    assert.equal(spawnSync('/bin/bash', ['-c', 'command -v node || command -v npm'], { env }).status, 1);
    mkdirSync(join(home, '.pi/agent/extensions/todos'), { recursive: true });
    const installer = join(home, '.local/bin/install-pi-agent-tasks');
    writeFileSync(installer, 'import subprocess\nsubprocess.run(["node", "--version"],check=True)\nsubprocess.run(["npm", "--version"],check=True)\nprint("managed installer reached")\n');
    for (const os of ['linux', 'darwin']) {
      const output = execFileSync('chezmoi', ['--source', root, '--destination', home, '--cache', join(work, 'cache'), '--config', join(work, 'chezmoi.toml'), '--no-tty', '--refresh-externals=never', '--override-data', JSON.stringify({ chezmoi: { os, arch: os === 'linux' ? 'amd64' : 'arm64', username: 'fixture', hostname: 'fixture', homeDir: home, osRelease: { id: 'fedora', versionID: '44' } } }), 'execute-template', '--init', '--file', join(root, '.chezmoiscripts', hookName)], { encoding: 'utf8', env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, '.config'), XDG_CACHE_HOME: join(work, 'cache'), XDG_DATA_HOME: join(work, 'data') } });
      assert.match(output, /"\$mise_bin" exec -- python3/);
      assert.match(output, /unset MISE_GLOBAL_CONFIG_FILE/);
      assert.match(output, /export MISE_CONFIG_DIR="\$HOME\/\.config\/mise"/);
      assert.equal(spawnSync('/bin/bash', ['-n'], { input: output }).status, 0);
      if (os !== 'linux') { assert.match(output, /--prefix mise/); continue; }
      const hook = join(work, 'rendered-hook.sh'); writeFileSync(hook, output);
      const success = spawnSync('/bin/bash', [hook], { cwd: work, env, encoding: 'utf8' });
      assert.equal(success.status, 0, success.stdout + success.stderr);
      assert.match(success.stdout, /managed installer reached/);
      assert.equal(readFileSync(join(home, 'mise-called'), 'utf8'), 'managed');
      cpSync(join(root, 'dot_local/bin/executable_install-pi-agent-tasks'), installer);
      const pin = JSON.parse(readFileSync(join(root, 'dot_pi/agent/extensions/todos/package-pin.json'), 'utf8'));
      writeFileSync(join(home, '.pi/agent/extensions/todos/package-pin.json'), JSON.stringify({ ...pin, published: false }));
      const unpublished = spawnSync('/bin/bash', [hook], { cwd: work, env, encoding: 'utf8' });
      assert.equal(unpublished.status, 1);
      assert.match(unpublished.stderr, /unpublished/);
      assert.equal(existsSync(join(home, 'gh-called')), false);
    }
    assert.ok('10-install-mise-tools' < '17-install-pi-agent-tasks' && '17-install-pi-agent-tasks' < '30-setup-pi');
  } finally { rmSync(work, { recursive: true, force: true }); }
});
