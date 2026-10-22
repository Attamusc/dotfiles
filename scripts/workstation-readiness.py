#!/usr/bin/env python3
"""Bounded filesystem observations; never execute discovered candidates."""
import json
import os
from pathlib import Path
import stat
import sys

REQUIRED = 'herdr nvim hx pi opencode copilot gh jj just tv mosh spin go cargo rustc node npm npx chezmoi mise'.split()
LSP = 'typescript-language-server tsc pi-lsp-rust-analyzer ruby ruby-lsp'.split()
MANUAL = 'compatibility pi-packages herdr lsp credentials editor'.split()


class Incomplete(Exception):
    pass


def bounded(path):
    if len(os.fsencode(path)) > 4096:
        raise Incomplete
    return path


def forbidden(path, roots):
    path = os.path.normpath(path)
    return any(path == root or path.startswith(root + '/') for root in roots)


def resolve(path, roots):
    """Walk exact ancestors, checking exclusions before every metadata access."""
    bounded(path)
    if forbidden(path, roots):
        raise Incomplete
    pending = path.split('/')
    current = '/'
    seen = set()
    hops = 0
    metadata = None
    while pending:
        part = pending.pop(0)
        if not part or part == '.':
            continue
        if part == '..':
            current = os.path.dirname(current)
            continue
        candidate = bounded(os.path.join(current, part))
        if forbidden(candidate, roots):
            raise Incomplete
        metadata = os.lstat(candidate)
        if stat.S_ISLNK(metadata.st_mode):
            hops += 1
            if hops > 16 or candidate in seen:
                raise Incomplete
            seen.add(candidate)
            target = os.readlink(candidate)
            target = bounded(target if os.path.isabs(target) else os.path.join(current, target))
            if forbidden(target, roots):
                raise Incomplete
            pending = target.split('/') + pending
            current = '/'
        else:
            if pending and not stat.S_ISDIR(metadata.st_mode):
                raise NotADirectoryError
            current = candidate
    if metadata is None:
        metadata = os.lstat('/')
    return current, metadata


def exclusions(home, repo):
    anchors = [(home, ['.pi', '.agents', '.copilot', '.config/opencode', '.gitconfig.local', '.localrc']),
               (repo, ['.data-private', '.local-skills'])]
    roots = [os.path.normpath(os.path.join(anchor, name)) for anchor, names in anchors for name in names]
    # .config is a public parent whose alias must protect its private child.
    anchors.append((os.path.join(home, '.config'), ['opencode']))
    for anchor, names in anchors:
        try:
            resolved, _ = resolve(anchor, roots)
        except FileNotFoundError:
            continue
        roots.extend(os.path.join(resolved, name) for name in names)
    return roots


def command_status(name, path, roots):
    unknown = False
    for directory in dict.fromkeys(path.split(':')):
        if not os.path.isabs(directory):
            continue
        try:
            candidate, metadata = resolve(os.path.join(directory, name), roots)
            if stat.S_ISREG(metadata.st_mode) and os.access(candidate, os.X_OK):
                # Recheck metadata to catch ordinary replacement races.
                again = os.lstat(candidate)
                if (metadata.st_dev, metadata.st_ino, metadata.st_mode) != (again.st_dev, again.st_ino, again.st_mode):
                    raise Incomplete
                return 'present'
        except (FileNotFoundError, NotADirectoryError):
            pass
        except (OSError, ValueError, Incomplete):
            unknown = True
    return 'unknown' if unknown else 'missing'


def platform_status(system, release_file='/etc/os-release'):
    if system == 'Darwin':
        return 'present'
    if system != 'Linux':
        return 'unsupported'
    try:
        metadata = os.lstat(release_file)
        if stat.S_ISLNK(metadata.st_mode):
            target = os.path.normpath(os.path.join(os.path.dirname(release_file), os.readlink(release_file)))
            if target != '/usr/lib/os-release':
                return 'unknown'
            release_file = target
            metadata = os.lstat(release_file)
        if not stat.S_ISREG(metadata.st_mode):
            return 'unknown'
        # O_NONBLOCK prevents a replacement FIFO from hanging; fstat rejects it.
        fd = os.open(release_file, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW)
        with os.fdopen(fd, 'rb') as stream:
            opened = os.fstat(stream.fileno())
            if not stat.S_ISREG(opened.st_mode) or (opened.st_dev, opened.st_ino) != (metadata.st_dev, metadata.st_ino):
                return 'unknown'
            raw = stream.read(4097)
        if len(raw) > 4096:
            return 'unknown'
        selected = {}
        for line in raw.decode('utf-8').splitlines():
            key, sep, value = line.partition('=')
            if key.strip() not in ('ID', 'VERSION_ID'):
                continue
            if key != key.strip() or not sep or key in selected:
                return 'unknown'
            if value[:1] in ('"', "'"):
                if len(value) < 2 or value[-1] != value[0]:
                    return 'unknown'
                value = value[1:-1]
            if not value or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-' for c in value):
                return 'unknown'
            selected[key] = value
        if set(selected) != {'ID', 'VERSION_ID'}:
            return 'unknown'
        return 'present' if selected == {'ID': 'fedora', 'VERSION_ID': '44'} else 'unsupported'
    except (OSError, ValueError, UnicodeError):
        return 'unknown'


def observe(home, path, system, repo, release_file='/etc/os-release'):
    checks = []

    def add(identifier, classification, status):
        reason = {'present': 'executable-candidate', 'missing': 'no-executable-candidate',
                  'unknown': 'inspection-incomplete', 'manual': 'manual-verification',
                  'not-applicable': 'platform-excluded', 'unsupported': 'unsupported-platform'}[status]
        if identifier == 'host.platform' and status == 'present':
            reason = 'supported-platform'
        checks.append({'id': identifier, 'class': classification, 'status': status, 'reason': reason})

    add('host.platform', 'required', platform_status(system, release_file))
    roots = None
    if home and os.path.isabs(home) and path is not None:
        try:
            if len(os.fsencode(path)) <= 16384 and len(path.split(':')) <= 128:
                roots = exclusions(home, repo)
        except (OSError, ValueError, Incomplete):
            pass
    for name in REQUIRED + ['pup'] + LSP:
        classification = 'required' if name in REQUIRED else 'optional'
        status = 'not-applicable' if name == 'pup' and system != 'Darwin' else (
            command_status(name, path, roots) if roots is not None else 'unknown')
        add(('optional-lsp.' if name in LSP else 'command.') + name, classification, status)
    for name in MANUAL:
        add('manual.' + name, 'manual', 'manual')
    required = {check['status'] for check in checks if check['class'] == 'required'}
    baseline = 'blocked' if required & {'missing', 'unsupported'} else 'inconclusive' if 'unknown' in required else 'clear'
    return {'schema_version': 1, 'scope': 'filesystem-only', 'baseline': baseline, 'runtime': 'unverified', 'checks': checks}


def exit_status(report):
    return {'clear': 0, 'blocked': 1, 'inconclusive': 2}[report['baseline']]


def render(report, as_json=False):
    if as_json:
        return json.dumps(report, ensure_ascii=True) + '\n'
    return '\n'.join(['Workstation readiness v1 (observational)'] + [
        ' '.join(check[key] for key in ('id', 'class', 'status', 'reason')) for check in report['checks']
    ] + ['baseline=' + report['baseline'] + ' runtime=unverified']) + '\n'


def diagnostic(message):
    try:
        sys.stderr.write(message + '\n')
        sys.stderr.flush()
    except Exception:
        # A failed diagnostic stream cannot carry a guaranteed diagnostic.
        sys.stderr = None


def main(args):
    if args not in ([], ['--json'], ['--help'], ['-h']):
        diagnostic('readiness: usage-error')
        return 2
    try:
        if args in (['--help'], ['-h']):
            output = 'Usage: python3 -I -S -B scripts/workstation-readiness.py [--json]\n'
            status = 0
        else:
            report = observe(os.environ.get('HOME'), os.environ.get('PATH'), os.uname().sysname,
                             str(Path(__file__).absolute().parent.parent))
            output = render(report, args == ['--json'])
            status = exit_status(report)
        if len(output.encode('utf-8')) > 16384:
            raise Incomplete
        try:
            sys.stdout.write(output)
            sys.stdout.flush()
        except Exception:
            # Do not retry a failed buffered stream during interpreter shutdown.
            sys.stdout = None
            raise
    except Exception:
        diagnostic('readiness: internal-error')
        return 2
    return status


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
