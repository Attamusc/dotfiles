import os
from pathlib import Path
import shutil
import stat
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/preview-dotfiles.sh'


class PreviewDotfilesTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix='preview-dotfiles-')
        self.addCleanup(temporary.cleanup)
        self.work = Path(temporary.name).resolve()
        self.repo = self.work / 'dotfiles repo with spaces'
        self.script = self.repo / 'scripts/preview-dotfiles.sh'
        self.script.parent.mkdir(parents=True)
        shutil.copy2(SCRIPT, self.script)
        self.cwd = self.work / 'unrelated working directory'
        self.cwd.mkdir()
        self.home = self.work / 'home'
        self.home.mkdir()
        (self.home / 'sentinel').write_bytes(b'leave home alone\n')
        self.bin = self.work / 'bin'
        self.bin.mkdir()
        # An allow-listed PATH cannot fall through to a real chezmoi.
        (self.bin / 'bash').symlink_to('/bin/bash')
        (self.bin / 'dirname').symlink_to(shutil.which('dirname'))
        self.log = self.work / 'calls.log'
        self.chezmoi = self.bin / 'chezmoi'
        self.chezmoi.write_text('''#!/bin/sh
printf '%s\n' "$PWD" "$HOME" "$@" >> "$PREVIEW_TEST_LOG"
case "${3:-}" in
  status)
    printf '%s' "$PREVIEW_STATUS_STDOUT"
    printf '%s' "$PREVIEW_STATUS_STDERR" >&2
    exit "$PREVIEW_STATUS_CODE"
    ;;
  diff)
    printf '%s' "$PREVIEW_DIFF_STDOUT"
    printf '%s' "$PREVIEW_DIFF_STDERR" >&2
    exit "$PREVIEW_DIFF_CODE"
    ;;
  *) exit 99 ;;
esac
''')
        self.chezmoi.chmod(0o755)
        self.env = {
            'PATH': str(self.bin),
            'HOME': str(self.home),
            'PREVIEW_TEST_LOG': str(self.log),
            'PREVIEW_STATUS_STDOUT': 'status output\n\n',
            'PREVIEW_STATUS_STDERR': 'status warning\n\n',
            'PREVIEW_STATUS_CODE': '0',
            'PREVIEW_DIFF_STDOUT': 'diff output without trailing newline',
            'PREVIEW_DIFF_STDERR': 'diff warning without trailing newline',
            'PREVIEW_DIFF_CODE': '0',
        }

    def run_preview(self, *args, relative=False):
        if self.log.exists():
            self.log.unlink()
        script = os.path.relpath(self.script, self.cwd) if relative else str(self.script)
        result = subprocess.run(
            [script, *args], cwd=self.cwd, env=self.env,
            capture_output=True, timeout=10,
        )
        self.assertEqual(list(self.home.iterdir()), [self.home / 'sentinel'])
        self.assertEqual((self.home / 'sentinel').read_bytes(), b'leave home alone\n')
        return result

    def assert_calls(self, *commands):
        expected = []
        for command in commands:
            expected.extend([
                str(self.cwd), str(self.home), '--source', str(self.repo), command,
            ])
        actual = self.log.read_text().splitlines() if self.log.exists() else []
        self.assertEqual(actual, expected)

    def assert_output(self, result, include_diff=True):
        stdout = self.env['PREVIEW_STATUS_STDOUT']
        stderr = self.env['PREVIEW_STATUS_STDERR']
        if include_diff:
            stdout += self.env['PREVIEW_DIFF_STDOUT']
            stderr += self.env['PREVIEW_DIFF_STDERR']
        self.assertEqual(result.stdout, stdout.encode())
        self.assertEqual(result.stderr, stderr.encode())

    def test_script_is_executable(self):
        self.assertTrue(SCRIPT.stat().st_mode & stat.S_IXUSR)
        self.assertTrue(os.access(SCRIPT, os.X_OK))

    def test_bash_syntax(self):
        result = subprocess.run(
            ['/bin/bash', '-n', str(SCRIPT)], capture_output=True, timeout=10,
        )
        self.assertEqual(result.returncode, 0, result.stderr.decode())

    def test_status_then_diff_from_unrelated_directory_and_spaced_source(self):
        result = self.run_preview()
        self.assertEqual(result.returncode, 0)
        self.assert_calls('status', 'diff')
        self.assert_output(result)

    def test_relative_script_path(self):
        result = self.run_preview(relative=True)
        self.assertEqual(result.returncode, 0)
        self.assert_calls('status', 'diff')
        self.assert_output(result)

    def test_cdpath_cannot_redirect_relative_source_resolution(self):
        other = self.work / 'cdpath target'
        (other / 'scripts').mkdir(parents=True)
        self.env['CDPATH'] = str(other)
        self.cwd = self.repo
        result = self.run_preview(relative=True)
        self.assertEqual(result.returncode, 0)
        self.assert_calls('status', 'diff')
        self.assert_output(result)

    def test_status_failure_stops_before_diff_and_preserves_exit_code(self):
        for code in (1, 7, 42, 127):
            with self.subTest(code=code):
                self.env['PREVIEW_STATUS_CODE'] = str(code)
                result = self.run_preview()
                self.assertEqual(result.returncode, code)
                self.assert_calls('status')
                self.assert_output(result, include_diff=False)

    def test_diff_failure_preserves_exit_code_and_both_commands_output(self):
        for code in (1, 7, 42, 127):
            with self.subTest(code=code):
                self.env['PREVIEW_DIFF_CODE'] = str(code)
                result = self.run_preview()
                self.assertEqual(result.returncode, code)
                self.assert_calls('status', 'diff')
                self.assert_output(result)

    def test_missing_chezmoi(self):
        self.chezmoi.unlink()
        result = self.run_preview()
        self.assertEqual(result.returncode, 127)
        self.assertEqual(result.stdout, b'')
        self.assertIn(b'chezmoi', result.stderr)
        self.assertIn(b'PATH', result.stderr)
        self.assertIn(b'not found', result.stderr)
        self.assert_calls()

    def test_help_does_not_invoke_chezmoi(self):
        for flag in ('-h', '--help'):
            with self.subTest(flag=flag):
                result = self.run_preview(flag)
                self.assertEqual(result.returncode, 0)
                self.assertIn(b'Usage:', result.stdout)
                self.assertEqual(result.stderr, b'')
                self.assert_calls()

    def test_help_does_not_require_chezmoi(self):
        self.chezmoi.unlink()
        self.test_help_does_not_invoke_chezmoi()

    def test_unsupported_arguments_do_not_invoke_chezmoi(self):
        for args in (
            ('--apply',), ('status',), ('--source', '/elsewhere'), ('--',),
            ('',), ('--help', '--apply'), ('--apply', '--help'), ('-h', 'extra'),
        ):
            with self.subTest(args=args):
                result = self.run_preview(*args)
                self.assertEqual(result.returncode, 2)
                self.assertEqual(result.stdout, b'')
                self.assertIn(b'unsupported', result.stderr)
                self.assertIn(b'Usage:', result.stderr)
                self.assert_calls()

    def test_unsupported_arguments_do_not_require_chezmoi(self):
        self.chezmoi.unlink()
        self.test_unsupported_arguments_do_not_invoke_chezmoi()


if __name__ == '__main__':
    unittest.main()
