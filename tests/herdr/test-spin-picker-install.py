import hashlib
import json
import os
import runpy
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
INSTALLER = ROOT / 'dot_local/bin/executable_install-herdr-spin-picker'


class SpinPickerInstallTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='spin-picker-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.home = self.root / 'home'
        self.config = self.home / '.config/herdr-app'
        self.config.mkdir(parents=True)
        self.target = self.config / 'mods/spin-picker'
        self.pin = self.config / 'spin-picker-source.json'
        self.keys = self.config / 'keys.json'
        self.keys.write_text(json.dumps({'global': {'ctrl-x': 'other'}, 'terminal': {'escape': 'cancel'}, 'extra': [1]}))
        self.payload = self.root / 'payload'
        self.payload.mkdir()
        bin_dir = self.root / 'bin'
        bin_dir.mkdir()
        gh = bin_dir / 'gh'
        gh.write_text("#!/usr/bin/env python3\nimport os,sys,json\nfrom pathlib import Path\na=sys.argv[1:]\nwith open(os.environ['CALLS'],'a') as f: f.write(json.dumps(a)+'\\n')\nif a[:2]==['repo','view']: print(os.environ.get('PRIVATE','true'))\nelif a[0]=='api':\n assert a[2:]==['--header','Accept: application/vnd.github.raw+json']\n assert a[1].startswith('repos/Attamusc/herdr-spin-picker/contents/mods/spin-picker/')\n assert a[1].endswith('?ref='+os.environ['REVISION'])\n sys.stdout.buffer.write((Path(os.environ['PAYLOAD'])/a[1].split('/')[-1].split('?')[0]).read_bytes())\nelse: sys.exit(2)\n")
        gh.chmod(0o755)
        self.env = {**os.environ, 'HOME': str(self.home), 'PATH': str(bin_dir) + os.pathsep + os.environ['PATH'], 'PAYLOAD': str(self.payload), 'CALLS': str(self.root / 'calls'), 'REVISION': 'a' * 40}
        self.package()

    def package(self, main=b'export default class Picker {}', mod=b'{"place":"none"}', revision='a' * 40):
        files = {'main.js': main, 'mod.json': mod}
        for name, data in files.items():
            (self.payload / name).write_bytes(data)
        self.pin.write_text(json.dumps({'repository': 'Attamusc/herdr-spin-picker', 'revision': revision, 'files': {n: hashlib.sha256(d).hexdigest() for n, d in files.items()}}))
        self.env['REVISION'] = revision
        return files

    def run_install(self, ok=True):
        result = subprocess.run(['python3', str(INSTALLER)], env=self.env, capture_output=True, text=True, timeout=15)
        self.assertEqual(result.returncode, 0 if ok else 1, result.stdout + result.stderr)
        return result

    def snapshot(self):
        return {str(p.relative_to(self.config)): ('link', os.readlink(p)) if p.is_symlink() else ('file', p.read_bytes()) if p.is_file() else ('dir', None) for p in self.config.rglob('*')}

    def refuse_unchanged(self):
        before = self.snapshot()
        result = self.run_install(False)
        self.assertNotIn('Traceback', result.stderr)
        self.assertEqual(self.snapshot(), before)

    def test_install_idempotence_and_shortcut_preservation(self):
        original = json.loads(self.keys.read_text())
        self.run_install()
        original['global']['ctrl-p'] = 'mod.open:spin-picker'
        self.assertEqual(json.loads(self.keys.read_text()), original)
        self.assertEqual(json.loads((self.target / '.installed-source.json').read_text()), json.loads(self.pin.read_text()))
        before = self.snapshot()
        times = {p: p.stat().st_mtime_ns for p in self.target.iterdir()}
        keys_time = self.keys.stat().st_mtime_ns
        calls = (self.root / 'calls').read_bytes()
        self.run_install()
        self.assertEqual((self.root / 'calls').read_bytes(), calls)
        self.assertEqual(self.snapshot(), before)
        self.assertEqual({p: p.stat().st_mtime_ns for p in self.target.iterdir()}, times)
        self.assertEqual(self.keys.stat().st_mtime_ns, keys_time)

    def test_structured_shortcut_arguments_are_preserved(self):
        keys = {'global': {'ctrl-x': {'command': 'layout.resize', 'args': {'id': 'sidebar', 'px': 240}}}}
        self.keys.write_text(json.dumps(keys))
        self.run_install()
        keys['global']['ctrl-p'] = 'mod.open:spin-picker'
        self.assertEqual(json.loads(self.keys.read_text()), keys)

    def test_concurrent_runtime_edit_is_not_overwritten(self):
        self.run_install()
        old_marker = (self.target / '.installed-source.json').read_bytes()
        self.package(main=b'new', revision='b' * 40)
        installer = runpy.run_path(str(INSTALLER))
        run = subprocess.run

        def edit_during_download(args, *positional, **kwargs):
            result = run(args, *positional, **kwargs)
            if args[1:3] == ['repo', 'view']:
                (self.target / 'main.js').write_bytes(b'user edit during download')
            return result

        with patch.dict(os.environ, self.env), patch.object(subprocess, 'run', edit_during_download):
            with self.assertRaisesRegex(ValueError, 'changed during installation'):
                installer['install']()
        self.assertEqual((self.target / 'main.js').read_bytes(), b'user edit during download')
        self.assertEqual((self.target / '.installed-source.json').read_bytes(), old_marker)

    def test_concurrent_shortcut_edit_is_not_overwritten(self):
        installer = runpy.run_path(str(INSTALLER))
        run = subprocess.run
        changed = {'global': {'ctrl-x': 'updated by user'}}

        def edit_during_download(args, *positional, **kwargs):
            result = run(args, *positional, **kwargs)
            if args[1:3] == ['repo', 'view']:
                self.keys.write_text(json.dumps(changed))
            return result

        with patch.dict(os.environ, self.env), patch.object(subprocess, 'run', edit_during_download):
            with self.assertRaisesRegex(ValueError, 'changed during installation'):
                installer['install']()
        self.assertEqual(json.loads(self.keys.read_text()), changed)
        self.assertFalse(self.target.exists())

    def test_adoption_and_generated_files_survive_upgrade(self):
        self.target.mkdir(parents=True)
        for p in self.payload.iterdir(): (self.target / p.name).write_bytes(p.read_bytes())
        for n in ['gpui-kit.d.ts', 'jsconfig.json']: (self.target / n).write_text('generated')
        self.run_install()
        self.package(main=b'new', revision='b' * 40)
        self.run_install()
        self.assertEqual((self.target / 'main.js').read_bytes(), b'new')
        for n in ['gpui-kit.d.ts', 'jsconfig.json']: self.assertEqual((self.target / n).read_text(), 'generated')

    def test_partial_upgrade_resumes(self):
        self.run_install()
        self.package(main=b'new', mod=b'{"place":"none","name":"new"}', revision='b' * 40)
        (self.target / 'mod.json').write_bytes((self.payload / 'mod.json').read_bytes())
        self.run_install()
        self.assertEqual((self.target / 'main.js').read_bytes(), b'new')

    def test_interrupted_atomic_publish_cleans_temps_and_resumes(self):
        self.run_install()
        old_marker = (self.target / '.installed-source.json').read_bytes()
        self.package(main=b'new', mod=b'{"place":"none","name":"new"}', revision='b' * 40)
        installer = runpy.run_path(str(INSTALLER))
        replace = os.replace

        def fail_entry(source, target):
            if Path(target).name == 'main.js':
                raise OSError('fixture interruption')
            return replace(source, target)

        with patch.dict(os.environ, self.env), patch.object(os, 'replace', fail_entry):
            with self.assertRaisesRegex(OSError, 'fixture interruption'):
                installer['install']()
        self.assertEqual((self.target / '.installed-source.json').read_bytes(), old_marker)
        self.assertFalse(list(self.target.glob('.spin-install-*')))
        self.run_install()
        self.assertEqual((self.target / 'main.js').read_bytes(), b'new')

    def test_edits_unknown_files_removed_files_and_directories_refused(self):
        self.run_install()
        for name in ['main.js', 'unknown', 'nested']:
            with self.subTest(name=name):
                p = self.target / name
                old = p.read_bytes() if p.exists() else None
                if name == 'nested': p.mkdir()
                else: p.write_text('local edit')
                self.refuse_unchanged()
                if p.is_dir(): p.rmdir()
                elif old is None: p.unlink()
                else: p.write_bytes(old)
        (self.target / 'main.js').unlink()
        self.refuse_unchanged()

    def test_bad_payloads_and_privacy_refused(self):
        for mode in ['hash', 'public', 'place', 'large-main', 'large-mod']:
            with self.subTest(mode=mode):
                self.package()
                self.env['PRIVATE'] = 'false' if mode == 'public' else 'true'
                if mode == 'hash': (self.payload / 'main.js').write_bytes(b'tamper')
                if mode == 'place': self.package(mod=b'{"place":"sidebar"}')
                if mode == 'large-main': self.package(main=b'x' * (512 * 1024 + 1))
                if mode == 'large-mod': self.package(mod=b' ' * (16 * 1024 + 1))
                self.refuse_unchanged()

    def test_invalid_pin_and_manifest_refused(self):
        valid = json.loads(self.pin.read_text())
        variants = [[], {**valid, 'repository': 'other/repo'}, {**valid, 'revision': 'main'}, {**valid, 'files': {'../escape': 'a' * 64}}, {**valid, 'files': {**valid['files'], 'main.js': 'bad'}}]
        for pin in variants:
            self.pin.write_text(json.dumps(pin)); self.refuse_unchanged()
        self.pin.write_text(json.dumps(valid)); self.run_install()
        marker = self.target / '.installed-source.json'
        for manifest in variants:
            marker.write_text(json.dumps(manifest)); self.refuse_unchanged()
        marker.write_text('{'); self.refuse_unchanged()

    def test_symlinks_refused_including_generated_and_parent(self):
        outside = self.root / 'outside'; outside.mkdir()
        self.target.parent.mkdir(parents=True)
        self.target.symlink_to(outside, target_is_directory=True)
        self.refuse_unchanged(); self.target.unlink()
        self.target.mkdir()
        for name in ['main.js', 'mod.json', '.installed-source.json', 'gpui-kit.d.ts', 'jsconfig.json']:
            p = self.target / name; p.symlink_to(outside / 'missing')
            self.refuse_unchanged(); p.unlink()
        self.keys.unlink(); self.keys.symlink_to(outside / 'missing')
        self.refuse_unchanged()

    def test_shortcut_conflicts_and_malformed_keys_refused(self):
        for keys in [{'global': {'ctrl-p': 'other'}}, {'global': {}, 'terminal': {'ctrl-p': 'mod.open:spin-picker'}}, {'global': []}, {'global': {'x': 3}}, []]:
            self.keys.write_text(json.dumps(keys)); self.refuse_unchanged()
        self.keys.write_text('{'); self.refuse_unchanged()

    def test_absent_keys_installs_without_creating_defaults(self):
        self.keys.unlink()
        result = self.run_install()
        self.assertFalse(self.keys.exists())
        self.assertIn('start Herdr once', result.stdout)
        self.assertTrue((self.target / 'main.js').exists())
        self.keys.write_text('{"global":{"ctrl-x":"other"}}')
        self.run_install()
        self.assertEqual(json.loads(self.keys.read_text())['global'], {'ctrl-x': 'other', 'ctrl-p': 'mod.open:spin-picker'})


if __name__ == '__main__':
    unittest.main()
