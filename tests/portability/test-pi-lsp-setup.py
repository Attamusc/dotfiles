#!/usr/bin/env python3
import gzip
import hashlib
import io
import json
import os
import sys
import time
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest import mock

SOURCE = Path(__file__).parents[2] / "dot_local/bin/executable_pi-lsp-setup"
NS = {"__name__": "pi_lsp_setup"}
exec(compile(SOURCE.read_text(), str(SOURCE), "exec"), NS)
SetupError = NS["SetupError"]


def manifest():
    return {
        "schema_version": 1,
        "rust": {"toolchain": "1.2.3", "analyzer": {"release": "2026-01-01", "version": "ra 1", "assets": {
            "darwin-arm64": {"url": "https://example.test/ra.gz", "sha256": "a" * 64}}},
            "source": {"url": "https://example.test/src.tgz", "sha256": "b" * 64,
                       "library_prefix": "x/library"}},
        "ruby": {"version": "4.0.1", "lsp_version": "1.2.3", "gems": [
            {"name": n, "version": "1.0", "url": "https://example.test/" + n + ".gem", "sha256": c * 64}
            for n, c in zip(("language_server-protocol", "logger", "rbs", "ruby-lsp"), "cdef")]}}


class ManifestTests(unittest.TestCase):
    def test_valid_manifest_and_platforms(self):
        m = manifest()
        self.assertIs(NS["validate_manifest"](m), m)
        self.assertEqual(NS["platform_key"]("Darwin", "arm64"), "darwin-arm64")
        self.assertEqual(NS["platform_key"]("Linux", "x86_64", "ID=fedora\nVERSION_ID=44\n"), "linux-amd64")
        with self.assertRaisesRegex(SetupError, "Fedora 44"):
            NS["platform_key"]("Linux", "x86_64", "ID=ubuntu\nVERSION_ID=24.04\n")

    def test_rejects_traversal_http_and_bad_sha(self):
        for mutate in (
            lambda m: m["rust"]["source"].update(library_prefix="../bad"),
            lambda m: m["ruby"]["gems"][0].update(url="http://example.test/a"),
            lambda m: m["rust"]["source"].update(sha256="no"),
            lambda m: m["ruby"]["gems"][0].update(name="../../gem"),
        ):
            m = manifest(); mutate(m)
            with self.assertRaises(SetupError): NS["validate_manifest"](m)

    def test_unsupported_platform(self):
        with self.assertRaisesRegex(SetupError, "unsupported platform"):
            NS["platform_key"]("Windows", "AMD64")


class ArchiveTests(unittest.TestCase):
    def make_outer(self, members):
        archive = self.tmp / "rust-src.tar.gz"
        with tarfile.open(archive, "w:gz") as tf:
            for name, kind in members:
                info = tarfile.TarInfo(name)
                if kind == "file":
                    body = b"source"; info.size = len(body); tf.addfile(info, io.BytesIO(body))
                elif kind == "symlink":
                    info.type = tarfile.SYMTYPE; info.linkname = "/etc/passwd"; tf.addfile(info)
        return archive

    def setUp(self):
        self.ctx = tempfile.TemporaryDirectory(); self.tmp = Path(self.ctx.name)
    def tearDown(self): self.ctx.cleanup()

    def test_extracts_only_selected_prefix(self):
        outer = self.make_outer([("prefix/library/core/lib.rs", "file"), ("other/ignored", "file")])
        dest = self.tmp / "out"
        NS["extract_rust_source"](outer, dest, "prefix/library")
        self.assertEqual((dest / "core/lib.rs").read_bytes(), b"source")
        self.assertFalse((dest / "ignored").exists())

    def test_rejects_links_and_traversal(self):
        for name, kind in (("prefix/library/link", "symlink"), ("prefix/library/../escape", "file")):
            outer = self.make_outer([(name, kind)])
            with self.assertRaises(SetupError):
                NS["extract_rust_source"](outer, self.tmp/"out", "prefix/library")


class IntegrityTests(unittest.TestCase):
    def setUp(self):
        self.ctx = tempfile.TemporaryDirectory(); self.root = Path(self.ctx.name)/"target"; self.root.mkdir()
    def tearDown(self): self.ctx.cleanup()

    def test_receipt_detects_change_missing_extra_and_mode(self):
        f = self.root/"tool"; f.write_text("ok"); f.chmod(0o755)
        NS["write_receipt"](self.root, "recipe")
        self.assertTrue(NS["verify_target"](self.root, "recipe"))
        f.chmod(0o644); self.assertFalse(NS["verify_target"](self.root, "recipe"))
        f.chmod(0o755); (self.root/"extra").write_text("x")
        self.assertFalse(NS["verify_target"](self.root, "recipe"))

    def test_symlink_is_never_inventory_content(self):
        (self.root/"outside").write_text("x")
        os.symlink(self.root/"outside", self.root/"link")
        with self.assertRaises(SetupError): NS["inventory"](self.root)

    def test_cached_checksum_checked_before_use(self):
        cache = self.root/"cache"; cache.mkdir()
        asset = {"url": "https://example.test/x", "sha256": hashlib.sha256(b"right").hexdigest()}
        (cache/asset["sha256"]).write_bytes(b"wrong")
        with self.assertRaisesRegex(SetupError, "checksum mismatch"):
            NS["download"](asset, cache)

    def test_environment_is_allowlisted(self):
        old = os.environ.get("BUNDLE_TOKEN"); os.environ["BUNDLE_TOKEN"] = "secret"
        try:
            env = NS["isolated_env"](Path("/private/home"), Path("/private/gems"))
            self.assertNotIn("BUNDLE_TOKEN", env); self.assertEqual(env["GEM_HOME"], "/private/gems")
            self.assertEqual(env["GEM_PATH"], "/private/gems")
        finally:
            if old is None: os.environ.pop("BUNDLE_TOKEN", None)
            else: os.environ["BUNDLE_TOKEN"] = old


class ProcessTests(unittest.TestCase):
    def test_command_timeout_is_bounded(self):
        started = time.monotonic()
        with self.assertRaisesRegex(SetupError, "timed out"):
            NS["run"]([sys.executable, "-c", "import time; time.sleep(30)"], timeout=0.1)
        self.assertLess(time.monotonic() - started, 3)

    def test_relative_path_entries_cannot_shadow_commands(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            relative_bin = root / "local-bin"
            real_bin = root / "machine-bin"
            relative_bin.mkdir(); real_bin.mkdir()
            for path, value in [(relative_bin / "probe", "wrong"), (real_bin / "probe", "right")]:
                path.write_text(f"#!/bin/sh\nprintf '{value}\\n'\n"); path.chmod(0o755)
            with mock.patch.dict(os.environ, {"PATH": f"local-bin:{real_bin}"}):
                result = NS["run"](["probe"], cwd=root)
            self.assertEqual(result.stdout, "right\n")


class MainFlowTests(unittest.TestCase):
    def setUp(self):
        self.ctx = tempfile.TemporaryDirectory(); self.home = Path(self.ctx.name)
        self.manifest = self.home/"manifest.json"; self.manifest.write_text(json.dumps(manifest()))
        rubybin = self.home/"ruby-bin"; rubybin.mkdir(); self.ruby = rubybin/"ruby"; self.ruby.write_text("ruby")
        (rubybin/"gem").write_text("gem")
        self.downloads = 0; self.commands = []

    def tearDown(self): self.ctx.cleanup()

    def fake_download(self, asset, cache):
        self.downloads += 1; cache.mkdir(exist_ok=True)
        p = cache/(asset["sha256"] + (".gem" if asset["url"].endswith(".gem") else ""))
        if "ra.gz" in asset["url"]:
            with gzip.open(p, "wb") as f: f.write(b"analyzer")
        else: p.write_bytes(b"asset")
        return p

    def fake_extract(self, outer, dest, prefix):
        for rel in ("Cargo.toml", "core/src/lib.rs", "std/src/lib.rs"):
            p = dest/rel; p.parent.mkdir(parents=True, exist_ok=True); p.write_text(rel)

    def fake_run(self, argv, **kw):
        self.commands.append((list(map(str, argv)), kw))
        class R: stdout = ""
        if str(argv[-1]) == "--version":
            R.stdout = "ra 1\n" if Path(argv[0]).name == "rust-analyzer" else "1.2.3\n"
        elif "install" in argv:
            home = Path(kw["env"]["GEM_HOME"])
            for gem in manifest()["ruby"]["gems"]:
                spec = home/"specifications"/(gem["name"]+"-"+gem["version"]+".gemspec")
                spec.parent.mkdir(parents=True, exist_ok=True); spec.write_text(gem["name"])
            raw = home/"gems/ruby-lsp-1.2.3/exe/ruby-lsp"; raw.parent.mkdir(parents=True); raw.write_text("raw")
        elif "-e" in argv:
            R.stdout = "\n".join(sorted(g["name"]+"="+g["version"] for g in manifest()["ruby"]["gems"])) + "\n"
        return R()

    def invoke(self):
        patches = {"platform_key": lambda: "darwin-arm64", "prerequisites": lambda m, h: self.ruby,
                   "download": self.fake_download, "extract_rust_source": self.fake_extract, "run": self.fake_run}
        with mock.patch.dict(os.environ, {"HOME": str(self.home)}), mock.patch.dict(NS, patches):
            return NS["main"](["--manifest", str(self.manifest)])

    def test_install_idempotence_component_recipes_and_corruption(self):
        self.assertEqual(self.invoke(), 0); first = self.downloads
        self.assertGreater(first, 0)
        self.assertEqual(self.invoke(), 0); self.assertEqual(self.downloads, first)
        m = json.loads(self.manifest.read_text())
        m["rust"]["analyzer"]["assets"]["darwin-amd64"] = {"url": "https://example.test/other", "sha256": "9"*64}
        self.manifest.write_text(json.dumps(m))
        self.assertEqual(self.invoke(), 0); self.assertEqual(self.downloads, first)
        target = self.home/".local/share/pi-lsp/rust-analyzer-2026-01-01/rust-analyzer"
        target.write_text("corrupt")
        with self.assertRaisesRegex(SetupError, "corrupt or unowned"): self.invoke()

    def test_preflight_uses_scratch_and_clean_environment(self):
        ruby = self.home/".local/share/mise/installs/ruby/4.0.1/bin/ruby"
        ruby.parent.mkdir(parents=True); ruby.write_text("ruby")
        calls = []
        def fake_run(argv, **kw):
            calls.append((argv, kw))
            class R: stdout = "rustc 1.2.3\n" if "rustup" in str(argv[0]) else "4.0.1"
            return R()
        def which(command, path=None): return "/usr/bin/" + command
        poison = {"RUBYOPT": "-r./poison", "BUNDLE_TOKEN": "secret", "PATH": ".:/usr/bin"}
        with mock.patch.dict(os.environ, poison), mock.patch.object(NS["shutil"], "which", which), mock.patch.dict(NS, {"run": fake_run}):
            self.assertEqual(NS["prerequisites"](manifest(), self.home), ruby)
        rust, ruby_call = calls
        self.assertEqual(rust[1]["env"]["RUSTUP_AUTO_INSTALL"], "0")
        self.assertNotIn("RUBYOPT", ruby_call[1]["env"]); self.assertNotIn("BUNDLE_TOKEN", ruby_call[1]["env"])
        self.assertNotEqual(Path(ruby_call[1]["cwd"]), Path.cwd())
        self.assertEqual(ruby_call[1]["env"]["PATH"], "/usr/bin")

    def test_failed_gem_install_publishes_nothing(self):
        def failing_run(argv, **kw):
            if "install" in argv: raise __import__("subprocess").CalledProcessError(1, argv)
            return self.fake_run(argv, **kw)
        patches = {"platform_key": lambda: "darwin-arm64", "prerequisites": lambda m, h: self.ruby,
                   "download": self.fake_download, "extract_rust_source": self.fake_extract, "run": failing_run}
        with mock.patch.dict(os.environ, {"HOME": str(self.home)}), mock.patch.dict(NS, patches):
            with self.assertRaises(__import__("subprocess").CalledProcessError):
                NS["main"](["--manifest", str(self.manifest)])
        root = self.home/".local/share/pi-lsp"
        self.assertFalse((root/"rust-analyzer-2026-01-01").exists())
        self.assertFalse((root/"rust-src-1.2.3").exists())


if __name__ == "__main__": unittest.main()
