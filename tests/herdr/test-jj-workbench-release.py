import hashlib
import importlib.machinery
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
INSTALLER = ROOT / "dot_local/bin/executable_install-herdr-jj-workbench"


class PrivateReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="herdr-release-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.home = self.root / "home"
        self.target = self.home / ".config/herdr-app/mods/jj-workbench"
        self.pin = self.home / ".config/herdr-app/jj-workbench-release.json"
        self.pin.parent.mkdir(parents=True)
        self.bin = self.root / "bin"
        self.bin.mkdir()
        gh = self.bin / "gh"
        gh.write_text("#!/usr/bin/env python3\nimport os,sys,shutil\nfrom pathlib import Path\nif sys.argv[1:3]==['repo','view']: print(os.environ.get('FIXTURE_PRIVATE','true'))\nelif sys.argv[1:3]==['release','download']:\n args=sys.argv; shutil.copyfile(os.environ['FIXTURE_ARCHIVE'],Path(args[args.index('--dir')+1])/args[args.index('--pattern')+1])\nelse: raise SystemExit(2)\n")
        gh.chmod(0o755)
        self.archive = self.root / "release.tar.gz"
        self.env = {**os.environ, "HOME": str(self.home), "PATH": str(self.bin) + os.pathsep + os.environ["PATH"], "FIXTURE_ARCHIVE": str(self.archive)}

    def package(self, extra=None, version="v0.1.0"):
        payload = {"main.js": b"export default class Main {}\n", "jj.js": b"export const version = 1;\n", "mod.json": b'{"place":"none"}\n'}
        payload.update(extra or {})
        with tarfile.open(self.archive, "w:gz") as tar:
            for name, data in payload.items():
                entry = tarfile.TarInfo("jj-workbench/" + name)
                entry.size = len(data)
                tar.addfile(entry, io.BytesIO(data))
        self.pin.write_text(json.dumps({"repository": "Attamusc/herdr-jj-workbench", "version": version, "sha256": hashlib.sha256(self.archive.read_bytes()).hexdigest()}))
        return payload

    def install(self):
        return subprocess.run(["python3", str(INSTALLER)], env=self.env, capture_output=True, text=True, timeout=15)

    def test_private_verified_install_is_idempotent_and_preserves_personal_layout(self):
        payload = self.package()
        layout = self.pin.parent / "layouts/hyrule-twilight.json"
        layout.parent.mkdir(); layout.write_text("personal")
        first = self.install()
        self.assertEqual(first.returncode, 0, first.stderr)
        for name, content in payload.items(): self.assertEqual((self.target / name).read_bytes(), content)
        self.assertEqual(layout.read_text(), "personal")
        self.env["PATH"] = os.environ["PATH"]
        second = self.install()
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertIn("already installed and verified", second.stdout)

    def test_public_repo_is_refused_before_install(self):
        self.package(); self.env["FIXTURE_PRIVATE"] = "false"
        result = self.install()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.target.exists())

    def test_wrong_hash_and_archive_traversal_are_refused(self):
        self.package(); self.archive.write_bytes(self.archive.read_bytes() + b"tampered")
        self.assertNotEqual(self.install().returncode, 0)
        self.assertFalse(self.target.exists())
        self.package({"../../escape": b"never"})
        self.assertNotEqual(self.install().returncode, 0)
        self.assertFalse(self.target.exists())
        self.assertFalse((self.root / "escape").exists())

    def test_modified_runtime_is_not_overwritten(self):
        self.package(); self.assertEqual(self.install().returncode, 0)
        (self.target / "main.js").write_text("local edit")
        result = self.install()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.target / "main.js").read_text(), "local edit")

    def test_existing_identical_package_can_be_adopted_but_unknown_files_cannot(self):
        payload = self.package(); self.target.mkdir(parents=True)
        for name, content in payload.items(): (self.target / name).write_bytes(content)
        (self.target / "gpui-kit.d.ts").write_text("generated")
        (self.target / "unknown.js").write_text("local")
        self.assertNotEqual(self.install().returncode, 0)
        (self.target / "unknown.js").unlink()
        result = self.install()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.target / "gpui-kit.d.ts").read_text(), "generated")

    def test_version_update_adds_removes_and_changes_owned_files(self):
        self.package({"obsolete.js": b"old"}); self.assertEqual(self.install().returncode, 0)
        (self.target / "jsconfig.json").write_text("generated")
        payload = self.package({"main.js": b"new entry", "added.js": b"new dependency"}, version="v0.1.1")
        result = self.install()
        self.assertEqual(result.returncode, 0, result.stderr)
        manifest = json.loads((self.target / ".installed-release.json").read_text())
        self.assertEqual(manifest["version"], "v0.1.1")
        self.assertEqual(set(manifest["files"]), set(payload))
        self.assertFalse((self.target / "obsolete.js").exists())
        self.assertEqual((self.target / "added.js").read_bytes(), b"new dependency")
        self.assertEqual((self.target / "main.js").read_bytes(), b"new entry")
        self.assertEqual((self.target / "jsconfig.json").read_text(), "generated")

    def test_interrupted_upgrade_can_resume_without_blessing_other_local_edits(self):
        self.package({"obsolete.js": b"old"}); self.assertEqual(self.install().returncode, 0)
        self.package({"main.js": b"new entry", "added.js": b"new dependency"}, version="v0.1.1")
        loader = importlib.machinery.SourceFileLoader("release_installer", str(INSTALLER))
        module = importlib.util.module_from_spec(importlib.util.spec_from_loader(loader.name, loader))
        bytecode = sys.dont_write_bytecode
        try:
            sys.dont_write_bytecode = True
            loader.exec_module(module)
        finally:
            sys.dont_write_bytecode = bytecode
        replace = os.replace
        def fail_entry(source, target):
            if Path(target).name == "main.js": raise OSError("fixture: interrupted publish")
            return replace(source, target)
        with patch.dict(os.environ, self.env), patch.object(module.os, "replace", fail_entry):
            with self.assertRaises(OSError): module.install()
        self.assertEqual((self.target / "added.js").read_bytes(), b"new dependency")
        self.assertEqual(json.loads((self.target / ".installed-release.json").read_text())["version"], "v0.1.0")
        self.assertFalse(list(self.target.rglob(".jj-install-*")))
        result = self.install()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.target / "main.js").read_bytes(), b"new entry")
        self.assertFalse((self.target / "obsolete.js").exists())


if __name__ == "__main__":
    unittest.main()
