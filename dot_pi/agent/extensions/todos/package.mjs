import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const taskPackagePin = Object.freeze(JSON.parse(readFileSync(new URL('./package-pin.json', import.meta.url), 'utf8')));

// Deliberately home-relative, not XDG/environment-selected: both consumers use one pin.
export function taskPackagePrefix(home = homedir()) {
  return path.join(home, '.local/share/pi-agent-tasks', taskPackagePin.sha256);
}

export async function loadTaskPackage(entry, home = homedir()) {
  if (!['core', 'mcp'].includes(entry)) throw new Error('Unknown task package entry');
  const prefix = taskPackagePrefix(home);
  try {
    const receipt = JSON.parse(readFileSync(path.join(prefix, '.installed-release.json'), 'utf8'));
    if (receipt.sha256 !== taskPackagePin.sha256 || receipt.version !== taskPackagePin.version) throw new Error('Pin mismatch');
    const manifest = JSON.parse(readFileSync(path.join(prefix, 'node_modules/@attamusc/agent-tasks/package.json'), 'utf8'));
    if (manifest.name !== '@attamusc/agent-tasks' || manifest.version !== taskPackagePin.version || manifest.private !== true) throw new Error('Package mismatch');
    return await import(pathToFileURL(path.join(prefix, `${entry}.mjs`)).href);
  } catch (cause) {
    throw Object.assign(new Error('Task capability unavailable: install the pinned private agent-tasks package before loading todos (no legacy fallback).', { cause }), { code: 'capability-unavailable' });
  }
}
