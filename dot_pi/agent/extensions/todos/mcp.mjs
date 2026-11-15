import path from 'node:path';
import { homedir } from 'node:os';
import { resolveTaskStore } from './scope.ts';
import { loadTaskPackage } from './package.mjs';

function invalidStartup(message) {
  return Object.assign(new Error(message), { code: 'invalid-startup' });
}

export async function launchTaskMcp(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--store-override=')) {
      if ('override' in values) throw invalidStartup('Duplicate store override');
      values.override = arg.slice('--store-override='.length);
    } else if (['--scope-cwd', '--actor', '--actions'].includes(arg)) {
      if (arg in values || i + 1 >= argv.length) throw invalidStartup('Invalid startup arguments');
      values[arg] = argv[++i];
    } else {
      throw invalidStartup('Unknown startup argument; store override must use --store-override=<value>');
    }
  }
  if (!values['--scope-cwd'] || !path.isAbsolute(values['--scope-cwd']) || !values['--actor']?.trim() || !values['--actions'] || !('override' in values)) {
    throw invalidStartup('Required: --scope-cwd, --store-override=<value>, --actor and --actions');
  }
  const storeRoot = resolveTaskStore(values['--scope-cwd'], values.override, path.join(homedir(), '.pi/history'));
  const { startTaskMcpServer } = await loadTaskPackage('mcp');
  return startTaskMcpServer({ storeRoot, actorId: values['--actor'], allowedActions: values['--actions'].split(','), allowForce: false });
}
