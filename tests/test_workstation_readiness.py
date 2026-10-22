import importlib.util
from pathlib import Path
import unittest
import contextlib
import io
import json
import os
import socket
import subprocess
import sys
import stat
import tempfile
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/workstation-readiness.py'


class ReadinessTests(unittest.TestCase):
    def setUp(self):
        if SCRIPT.exists():
            spec = importlib.util.spec_from_file_location('readiness', SCRIPT)
            self.module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(self.module)

    def test_report_contract(self):
        self.assertTrue(SCRIPT.is_file(), 'readiness implementation missing')
        spec = importlib.util.spec_from_file_location('readiness', SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        report = module.observe('/synthetic/home', '', 'Darwin', '/synthetic/repo')
        self.assertEqual(report['baseline'], 'blocked')
        self.assertEqual(report['checks'][0], dict(id='host.platform', **{'class': 'required'}, status='present', reason='supported-platform'))
        expected_ids = ['host.platform'] + ['command.' + name for name in 'herdr nvim hx pi opencode copilot gh jj just tv mosh spin go cargo rustc node npm npx chezmoi mise pup'.split()] + ['optional-lsp.' + name for name in 'typescript-language-server tsc pi-lsp-rust-analyzer ruby ruby-lsp'.split()] + ['manual.' + name for name in 'compatibility pi-packages herdr lsp credentials editor'.split()]
        self.assertEqual([check['id'] for check in report['checks']], expected_ids)
        self.assertEqual(set(report), {'schema_version', 'scope', 'baseline', 'runtime', 'checks'})
        self.assertTrue(all(set(check) == {'id', 'class', 'status', 'reason'} for check in report['checks']))
        self.assertEqual(module.exit_status(report), 1)

    def test_synthetic_boundaries_and_no_mutation(self):
        m = self.module
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            home, repo, binaries = [root / name for name in ('home', 'repo', 'bin')]
            for directory in (home, repo, binaries):
                directory.mkdir()
            for name in m.REQUIRED:
                candidate = binaries / name
                candidate.write_text('SECRET_CANARY never execute')
                candidate.chmod(0o700)
            private = home / '.pi'
            private.mkdir()
            (private / 'herdr').write_text('SECRET_CANARY')
            release = root / 'release'
            release.write_text('ID=fedora\nVERSION_ID="44"\n')

            def manifest():
                return sorted((str(p.relative_to(root)), p.lstat().st_mode,
                               os.readlink(p) if p.is_symlink() else p.read_bytes() if p.is_file() else None)
                              for p in root.rglob('*'))

            before = manifest()
            real_lstat = os.lstat
            def guarded(path, *args, **kwargs):
                if str(path) == str(private) or str(path).startswith(str(private) + '/'):
                    self.fail('private metadata visited')
                return real_lstat(path, *args, **kwargs)

            with patch.object(os, 'lstat', guarded), patch.object(subprocess, 'Popen', side_effect=AssertionError('spawn')), patch.object(socket, 'socket', side_effect=AssertionError('socket')):
                report = m.observe(str(home), str(private) + ':' + str(binaries), 'Linux', str(repo), str(release))
                self.assertEqual(report['baseline'], 'clear')
                self.assertEqual(m.exit_status(report), 0)
                self.assertEqual(report['checks'][21]['status'], 'not-applicable')
                text = m.render(report)
                self.assertTrue(text.startswith('Workstation readiness v1 (observational)\n'))
                self.assertTrue(text.endswith('baseline=clear runtime=unverified\n'))
                self.assertEqual(json.loads(m.render(report, True)), report)
                self.assertLess(len(m.render(report, True).encode()), 16385)
                self.assertNotIn('SECRET_CANARY', text)
                self.assertNotIn(temp, text)
                for home_input, path in [(None, str(binaries)), ('relative', str(binaries)), (str(home), None), (str(home), '/' + 'x' * 16384), (str(home), ':'.join(['/bin'] * 129))]:
                    unknown = m.observe(home_input, path, 'Darwin', str(repo))
                    self.assertEqual(unknown['baseline'], 'inconclusive')
                    self.assertEqual(m.exit_status(unknown), 2)
                self.assertEqual(m.command_status('herdr', str(private), [str(private)]), 'unknown')
            self.assertEqual(before, manifest())

    def test_candidates_and_links(self):
        m = self.module
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            binary = root / 'herdr'
            binary.write_text('canary')
            self.assertEqual(m.command_status('herdr', temp, []), 'missing')
            binary.chmod(0o700)
            self.assertEqual(m.command_status('herdr', temp, []), 'present')
            binary.unlink()
            binary.mkdir()
            self.assertEqual(m.command_status('herdr', temp, []), 'missing')
            binary.rmdir()
            os.mkfifo(binary)
            self.assertEqual(m.command_status('herdr', temp, []), 'missing')
            binary.unlink()
            binary.symlink_to('herdr')
            self.assertEqual(m.command_status('herdr', temp, []), 'unknown')
            binary.unlink()
            binary.symlink_to('absent')
            self.assertEqual(m.command_status('herdr', temp, []), 'missing')
            binary.unlink()
            binary.symlink_to('private/herdr')
            self.assertEqual(m.command_status('herdr', temp, [str(root / 'private')]), 'unknown')
            self.assertEqual(m.command_status('herdr', ':relative', []), 'missing')
            self.assertEqual(m.command_status('herdr', '/' + 'x' * 4096, []), 'unknown')
            binary.unlink()
            binary.symlink_to('link0')
            for index in range(17):
                (root / ('link' + str(index))).symlink_to('link' + str(index + 1))
            self.assertEqual(m.command_status('herdr', temp, []), 'unknown')
            binary.unlink()
            binary.write_text('canary')
            binary.chmod(0o700)
            with patch.object(os, 'access', side_effect=OSError):
                self.assertEqual(m.command_status('herdr', temp, []), 'unknown')
            with patch.object(os, 'lstat', side_effect=PermissionError):
                self.assertEqual(m.command_status('herdr', temp, []), 'unknown')

    def test_metadata_only_and_anchor_aliases(self):
        m = self.module
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            home = root / 'home'
            home.mkdir()
            alias = root / 'alias'
            alias.symlink_to(home, target_is_directory=True)
            repo = root / 'repo'
            repo.mkdir()
            roots = m.exclusions(str(alias), str(repo))
            self.assertIn(str(home / '.pi'), roots)
            with patch('builtins.open', side_effect=AssertionError('content read')), patch.object(os, 'open', side_effect=AssertionError('content read')), patch.object(os, 'system', side_effect=AssertionError('spawn')), patch.object(os, 'posix_spawn', side_effect=AssertionError('spawn')):
                report = m.observe(str(alias), str(home / '.pi'), 'Darwin', str(repo))
                self.assertEqual(report['baseline'], 'inconclusive')
            output, error = io.StringIO(), io.StringIO()
            with patch.object(m, 'observe', side_effect=RuntimeError('SECRET_CANARY')), contextlib.redirect_stdout(output), contextlib.redirect_stderr(error):
                self.assertEqual(m.main([]), 2)
            self.assertEqual(output.getvalue(), '')
            self.assertEqual(error.getvalue(), 'readiness: internal-error\n')

    def test_every_protected_root_and_alias_is_excluded_before_metadata(self):
        m = self.module
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            home, repo = root / 'home', root / 'repo'
            home.mkdir()
            repo.mkdir()
            home_alias, repo_alias = root / 'home-alias', root / 'repo-alias'
            home_alias.symlink_to(home, target_is_directory=True)
            repo_alias.symlink_to(repo, target_is_directory=True)
            protected = [home / name for name in ('.pi', '.agents', '.copilot', '.config/opencode', '.gitconfig.local', '.localrc')] + [repo / name for name in ('.data-private', '.local-skills')]
            roots = m.exclusions(str(home_alias), str(repo_alias))
            real_lstat = os.lstat
            def guarded(path, *args, **kwargs):
                if any(str(path) == str(p) or str(path).startswith(str(p) + '/') for p in protected):
                    raise AssertionError('protected metadata visited')
                return real_lstat(path, *args, **kwargs)
            with patch.object(os, 'lstat', guarded), patch('builtins.open', side_effect=AssertionError('content read')), patch.object(os, 'open', side_effect=AssertionError('content read')):
                for anchor in (home, home_alias):
                    for name in ('.pi', '.agents', '.copilot', '.config/opencode', '.gitconfig.local', '.localrc'):
                        self.assertEqual(m.command_status('herdr', str(anchor / name), roots), 'unknown')
                for anchor in (repo, repo_alias):
                    for name in ('.data-private', '.local-skills'):
                        self.assertEqual(m.command_status('herdr', str(anchor / name), roots), 'unknown')

    def test_process_network_and_content_tripwires_are_sensitive(self):
        m = self.module
        with tempfile.TemporaryDirectory() as temp, contextlib.ExitStack() as stack:
            root = Path(temp)
            binary = root / 'herdr'
            binary.write_text('SECRET_CANARY')
            binary.chmod(0o700)
            operations = [(subprocess, 'Popen'), (subprocess, 'run'), (socket, 'socket'), (socket, 'create_connection'), (os, 'system'), (os, 'open')]
            operations += [(os, name) for name in dir(os) if name.startswith(('spawn', 'exec', 'posix_spawn')) or name in ('fork', 'forkpty', 'popen')]
            tripwires = []
            for owner, name in operations:
                blocked = stack.enter_context(patch.object(owner, name, side_effect=AssertionError('tripwire')))
                with self.assertRaisesRegex(AssertionError, 'tripwire'):
                    blocked()
                blocked.reset_mock()
                tripwires.append(blocked)
            blocked_open = stack.enter_context(patch('builtins.open', side_effect=AssertionError('tripwire')))
            with self.assertRaisesRegex(AssertionError, 'tripwire'):
                blocked_open()
            blocked_open.reset_mock()
            self.assertEqual(m.command_status('herdr', temp, []), 'present')
            real_lstat = os.lstat
            def device_metadata(path):
                metadata = real_lstat(path)
                if str(path) == str(binary):
                    fields = list(metadata)
                    fields[0] = stat.S_IFCHR | 0o700
                    return os.stat_result(fields)
                return metadata
            with patch.object(os, 'lstat', side_effect=device_metadata):
                self.assertEqual(m.command_status('herdr', temp, []), 'missing')
            blocked_open.assert_not_called()
            for blocked in tripwires:
                blocked.assert_not_called()

    def test_replacement_race_and_exact_limits(self):
        m = self.module
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.assertEqual(m.bounded('/' + 'a' * 4095), '/' + 'a' * 4095)
            with self.assertRaises(m.Incomplete):
                m.bounded('/' + 'a' * 4096)
            binary = root / 'herdr'
            binary.write_text('one')
            binary.chmod(0o700)
            replacement = root / 'replacement'
            replacement.write_text('two')
            replacement.chmod(0o700)
            def replace(path, mode):
                replacement.replace(binary)
                return True
            with patch.object(os, 'access', side_effect=replace):
                self.assertEqual(m.command_status('herdr', temp, []), 'unknown')
            binary.unlink()
            for index in range(16):
                (root / ('link' + str(index))).symlink_to('link' + str(index + 1))
            (root / 'link16').write_text('end')
            (root / 'link16').chmod(0o700)
            self.assertEqual(m.command_status('link0', temp, []), 'present')
            binary.symlink_to('link0')
            self.assertEqual(m.command_status('herdr', temp, []), 'unknown')
            with patch.object(m, 'exclusions', return_value=[]), patch.object(m, 'command_status', return_value='present') as inspect:
                for path in ('/' + 'a' * 16383, ':'.join(['/x'] * 128)):
                    self.assertEqual(m.observe(temp, path, 'Darwin', temp)['baseline'], 'clear')
                inspect.reset_mock()
                for path in ('/' + 'a' * 16384, ':'.join(['/x'] * 129)):
                    self.assertEqual(m.observe(temp, path, 'Darwin', temp)['baseline'], 'inconclusive')
                inspect.assert_not_called()
            def optional_unknown(name, path, roots):
                return 'present' if name in m.REQUIRED else 'unknown'
            with patch.object(m, 'command_status', side_effect=optional_unknown):
                self.assertEqual(m.observe(temp, temp, 'Darwin', temp)['baseline'], 'clear')

    def test_output_failures_are_fixed_and_flushed(self):
        m = self.module
        report = m.observe('/synthetic/home', '', 'Darwin', '/synthetic/repo')
        for args in ([], ['--json'], ['--help']):
            for failure in ('write', 'flush'):
                class FailedWriter:
                    def write(self, text):
                        if failure == 'write':
                            raise OSError('SECRET_WRITE_ERROR')
                    def flush(self):
                        if failure == 'flush':
                            raise OSError('SECRET_FLUSH_ERROR')
                error = io.StringIO()
                with patch.object(m, 'observe', return_value=report), patch.object(sys, 'stdout', FailedWriter()), contextlib.redirect_stderr(error):
                    self.assertEqual(m.main(args), 2)
                self.assertEqual(error.getvalue(), 'readiness: internal-error\n')

    def test_release_is_the_only_allowlisted_content_read(self):
        m = self.module
        with tempfile.TemporaryDirectory() as temp:
            release = Path(temp) / 'release'
            release.write_text('ID=fedora\nVERSION_ID=44\n')
            original_open = os.open
            seen = []
            def allow_release(path, flags, *args, **kwargs):
                self.assertEqual(str(path), str(release))
                seen.append(str(path))
                return original_open(path, flags, *args, **kwargs)
            with patch.object(os, 'open', side_effect=allow_release), patch('builtins.open', side_effect=AssertionError('nonallowlisted read')):
                report = m.observe(temp, '', 'Linux', temp, str(release))
                self.assertEqual(report['checks'][0]['status'], 'present')
            self.assertEqual(seen, [str(release)])

    def test_config_parent_alias_protects_opencode_child(self):
        m = self.module
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            home, repo, config = [root / name for name in ('home', 'repo', 'config')]
            for directory in (home, repo, config):
                directory.mkdir()
            (home / '.config').symlink_to(config, target_is_directory=True)
            second = root / 'second-alias'
            second.symlink_to(config, target_is_directory=True)
            private = config / 'opencode'
            original = os.lstat
            def guarded(path, *args, **kwargs):
                if str(path) == str(private) or str(path).startswith(str(private) + '/'):
                    self.fail('opencode child metadata visited')
                return original(path, *args, **kwargs)
            with patch.object(os, 'lstat', side_effect=guarded):
                roots = m.exclusions(str(home), str(repo))
                for parent in (config, second):
                    self.assertEqual(m.command_status('herdr', str(parent / 'opencode/bin'), roots), 'unknown')

    def test_release_link_allowlist_and_boundary(self):
        m = self.module
        with tempfile.TemporaryDirectory() as temp:
            release = Path(temp) / 'owned-release'
            prefix = b'ID=fedora\nVERSION_ID=44\n#'
            release.write_bytes(prefix + b'x' * (4096 - len(prefix)))
            self.assertEqual(m.platform_status('Linux', str(release)), 'present')
            release.write_bytes(release.read_bytes() + b'x')
            self.assertEqual(m.platform_status('Linux', str(release)), 'unknown')
            release.write_bytes(b'ID=fedora\nVERSION_ID=44\n')
            regular = release.lstat()
            fields = list(regular)
            fields[0] = stat.S_IFLNK | 0o777
            link = os.stat_result(fields)
            original_open = os.open
            def mapped_open(path, flags):
                self.assertEqual(path, '/usr/lib/os-release')
                self.assertEqual(flags, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW)
                return original_open(release, flags)
            for target, target_metadata, expected in [('../usr/lib/os-release', regular, 'present'), ('/private/release', regular, 'unknown'), ('/usr/lib/os-release', link, 'unknown')]:
                def metadata(path):
                    self.assertIn(path, ('/etc/os-release', '/usr/lib/os-release'))
                    return link if path == '/etc/os-release' else target_metadata
                with patch.object(os, 'lstat', side_effect=metadata), patch.object(os, 'readlink', return_value=target), patch.object(os, 'open', side_effect=mapped_open) as opened:
                    self.assertEqual(m.platform_status('Linux'), expected)
                    self.assertEqual(opened.call_count, int(expected == 'present'))

    def test_exact_human_snapshot_and_help(self):
        m = self.module
        report = m.observe('/synthetic/home', '', 'Darwin', '/synthetic/repo')
        expected = '''Workstation readiness v1 (observational)
host.platform required present supported-platform
command.herdr required missing no-executable-candidate
command.nvim required missing no-executable-candidate
command.hx required missing no-executable-candidate
command.pi required missing no-executable-candidate
command.opencode required missing no-executable-candidate
command.copilot required missing no-executable-candidate
command.gh required missing no-executable-candidate
command.jj required missing no-executable-candidate
command.just required missing no-executable-candidate
command.tv required missing no-executable-candidate
command.mosh required missing no-executable-candidate
command.spin required missing no-executable-candidate
command.go required missing no-executable-candidate
command.cargo required missing no-executable-candidate
command.rustc required missing no-executable-candidate
command.node required missing no-executable-candidate
command.npm required missing no-executable-candidate
command.npx required missing no-executable-candidate
command.chezmoi required missing no-executable-candidate
command.mise required missing no-executable-candidate
command.pup optional missing no-executable-candidate
optional-lsp.typescript-language-server optional missing no-executable-candidate
optional-lsp.tsc optional missing no-executable-candidate
optional-lsp.pi-lsp-rust-analyzer optional missing no-executable-candidate
optional-lsp.ruby optional missing no-executable-candidate
optional-lsp.ruby-lsp optional missing no-executable-candidate
manual.compatibility manual manual manual-verification
manual.pi-packages manual manual manual-verification
manual.herdr manual manual manual-verification
manual.lsp manual manual manual-verification
manual.credentials manual manual manual-verification
manual.editor manual manual manual-verification
baseline=blocked runtime=unverified
'''
        self.assertEqual(m.render(report), expected)
        parsed = json.loads(m.render(report, True))
        self.assertEqual({key: value for key, value in parsed.items() if key != 'checks'}, {'schema_version': 1, 'scope': 'filesystem-only', 'baseline': 'blocked', 'runtime': 'unverified'})
        for flag in ('--help', '-h'):
            output, error = io.StringIO(), io.StringIO()
            with patch.object(m, 'observe', side_effect=AssertionError('observation forbidden')), contextlib.redirect_stdout(output), contextlib.redirect_stderr(error):
                self.assertEqual(m.main([flag]), 0)
            self.assertEqual(output.getvalue(), 'Usage: python3 -I -S -B scripts/workstation-readiness.py [--json]\n')
            self.assertEqual(error.getvalue(), '')

    def test_full_report_sensitive_boundaries_and_environment(self):
        m = self.module
        class AllowedEnvironment:
            def __init__(self, home, path):
                self.values = {'HOME': home, 'PATH': path}
                self.reads = []
            def get(self, key, default=None):
                if key not in ('HOME', 'PATH'):
                    raise AssertionError('environment read forbidden')
                self.reads.append(key)
                return self.values.get(key, default)
            def __iter__(self):
                raise AssertionError('environment iteration forbidden')
            def __getitem__(self, key):
                raise AssertionError('environment indexing forbidden')
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            home, repo, binaries = [root / name for name in ('DIRECTORY_SECRET_CANARY', 'repo', 'bin')]
            for directory in (home, repo, binaries):
                directory.mkdir()
            release = root / 'FILENAME_SECRET_CANARY'
            release.write_text('ID=fedora\nVERSION_ID=44\n# CONTENT_SECRET_CANARY')
            (home / '.pi').mkdir()
            (home / '.pi/settings.json').write_text('CONTENT_SECRET_CANARY')
            (home / '.gitconfig.local').write_text('CONTENT_SECRET_CANARY')
            os.mkfifo(home / '.localrc')
            for name in m.REQUIRED:
                (binaries / name).write_text('CONTENT_SECRET_CANARY')
                (binaries / name).chmod(0o700)
            def manifest():
                return sorted((str(p.relative_to(root)), p.lstat().st_mode,
                               os.readlink(p) if p.is_symlink() else p.read_bytes() if p.is_file() else None)
                              for p in root.rglob('*'))
            before = manifest()
            env = AllowedEnvironment(str(home), str(binaries))
            original_open, original_lstat = os.open, os.lstat
            protected = [str(home / name) for name in ('.pi', '.agents', '.copilot', '.config/opencode', '.gitconfig.local', '.localrc')] + [str(repo / name) for name in ('.data-private', '.local-skills')]
            def metadata(path, *args, **kwargs):
                self.assertFalse(any(str(path) == p or str(path).startswith(p + '/') for p in protected))
                return original_lstat(path, *args, **kwargs)
            def content_open(path, flags, *args, **kwargs):
                self.assertEqual(str(path), str(release))
                return original_open(path, flags, *args, **kwargs)
            # Positive controls prove metadata/content/environment guards reject
            # forbidden operations before exercising the complete report path.
            with self.assertRaises(AssertionError):
                metadata(home / '.pi')
            with self.assertRaises(AssertionError):
                content_open(home / '.pi/settings.json', os.O_RDONLY)
            with self.assertRaises(AssertionError):
                env.get('SECRET_VARIABLE')
            with self.assertRaises(AssertionError):
                iter(env)
            operations = [(subprocess, 'Popen'), (subprocess, 'run'), (socket, 'socket'), (socket, 'create_connection'), (os, 'system')]
            operations += [(os, name) for name in dir(os) if name.startswith(('spawn', 'exec', 'posix_spawn')) or name in ('fork', 'forkpty', 'popen')]
            with contextlib.ExitStack() as stack:
                blocked = []
                for owner, name in operations:
                    guard = stack.enter_context(patch.object(owner, name, side_effect=AssertionError('tripwire')))
                    with self.assertRaisesRegex(AssertionError, 'tripwire'):
                        guard()
                    guard.reset_mock()
                    blocked.append(guard)
                opener = stack.enter_context(patch('builtins.open', side_effect=AssertionError('tripwire')))
                with self.assertRaisesRegex(AssertionError, 'tripwire'):
                    opener()
                opener.reset_mock()
                stack.enter_context(patch.object(os, 'lstat', side_effect=metadata))
                stack.enter_context(patch.object(os, 'open', side_effect=content_open))
                stack.enter_context(patch.object(os, 'environ', env))
                report = m.observe(str(home), str(binaries), 'Linux', str(repo), str(release))
                self.assertEqual(report['baseline'], 'clear')
                original_observe = m.observe
                def synthetic_observe(home_input, path, system, ignored_repo):
                    return original_observe(home_input, path, 'Linux', str(repo), str(release))
                output, error = io.StringIO(), io.StringIO()
                with patch.object(m, 'observe', side_effect=synthetic_observe), patch.object(os, 'uname', return_value=type('Synthetic', (), {'sysname': 'Linux'})()), contextlib.redirect_stdout(output), contextlib.redirect_stderr(error):
                    self.assertEqual(m.main(['--json']), 0)
                self.assertEqual(env.reads, ['HOME', 'PATH'])
                self.assertEqual(error.getvalue(), '')
                for canary in ('DIRECTORY_SECRET_CANARY', 'FILENAME_SECRET_CANARY', 'CONTENT_SECRET_CANARY'):
                    self.assertNotIn(canary, output.getvalue() + error.getvalue())
                opener.assert_not_called()
                for guard in blocked:
                    guard.assert_not_called()
            self.assertEqual(before, manifest())

    def test_release_policy(self):
        m = self.module
        with tempfile.TemporaryDirectory() as temp:
            release = Path(temp) / 'release'
            for content, expected in [('ID=fedora\nVERSION_ID=44\n', 'present'), ("ID='fedora'\nVERSION_ID='44'\n", 'present'), ('ID=ubuntu\nVERSION_ID=44\n', 'unsupported'), ('ID=fedora\nID=fedora\nVERSION_ID=44', 'unknown'), ('ID=fedora\nVERSION_ID="44', 'unknown'), ('ID=fedora\n', 'unknown'), ('x' * 4097, 'unknown')]:
                release.write_text(content)
                self.assertEqual(m.platform_status('Linux', str(release)), expected)
            release.unlink()
            os.mkfifo(release)
            self.assertEqual(m.platform_status('Linux', str(release)), 'unknown')
            self.assertEqual(m.platform_status('Darwin', str(release)), 'present')
            self.assertEqual(m.platform_status('Other', str(release)), 'unsupported')

    def test_cli_isolation_and_errors(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            marker = root / 'STARTUP_CANARY'
            (root / 'sitecustomize.py').write_text('open(' + repr(str(marker)) + ', "w").write("bad")')
            env = {'HOME': temp, 'PATH': '', 'PYTHONPATH': temp}
            # Execute the entry point in an isolated child with a synthetic OS.
            source = root / 'source' / 'scripts' / SCRIPT.name
            source.parent.mkdir(parents=True)
            source.write_bytes(SCRIPT.read_bytes())
            launcher = ('import os,runpy,sys,types; '
                        'os.uname=lambda:types.SimpleNamespace(sysname="Darwin"); '
                        'sys.argv=[sys.argv[1]]+sys.argv[2:]; '
                        'runpy.run_path(sys.argv[0],run_name="__main__")')
            argv = [sys.executable, '-I', '-S', '-B', '-c', launcher, str(source)]
            def manifest():
                return sorted((str(p.relative_to(root)), p.lstat().st_mode,
                               os.readlink(p) if p.is_symlink() else p.read_bytes() if p.is_file() else None)
                              for p in root.rglob('*'))
            before = manifest()
            result = subprocess.run(argv + ['--json'], env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            self.assertEqual(result.stderr, '')
            self.assertEqual(json.loads(result.stdout)['baseline'], 'blocked')
            invalid = subprocess.run(argv + ['SECRET_CANARY'], env=env, capture_output=True, text=True)
            self.assertEqual((invalid.returncode, invalid.stdout, invalid.stderr), (2, '', 'readiness: usage-error\n'))
            if Path('/dev/full').exists():
                for arguments in (['--json'], ['--help']):
                    with open('/dev/full', 'wb') as full:
                        failed = subprocess.run(argv + arguments, env=env, stdout=full, stderr=subprocess.PIPE, text=True)
                    self.assertEqual((failed.returncode, failed.stderr), (2, 'readiness: internal-error\n'))
            self.assertFalse(marker.exists())
            self.assertEqual(sorted(p.name for p in root.iterdir()), ['sitecustomize.py', 'source'])
            self.assertFalse(list(root.rglob('__pycache__')))
            self.assertEqual(before, manifest())


if __name__ == '__main__':
    unittest.main()
