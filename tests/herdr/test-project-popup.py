#!/usr/bin/env python3
"""Opt-in real popup test: --stale-herdr /path/to/an/older/herdr.

Uses real Herdr, Television, ghq, and mise. Creates and deletes only its own
named test session; the user's attached session is never changed.
"""
import argparse
import fcntl
import json
import os
from pathlib import Path
import pty
import re
import select
import shutil
import struct
import subprocess
import tempfile
import termios
import time
import tomllib


ANSI = re.compile(rb"\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)")
REPO = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stale-herdr", required=True, type=Path)
    args = parser.parse_args()
    herdr = shutil.which("herdr")
    if not herdr or not args.stale_herdr.is_file():
        parser.error("both the current and stale Herdr binaries must exist")
    name = f"project-popup-test-{os.getpid()}"
    with tempfile.TemporaryDirectory(prefix="popup-test-") as temp:
        root = Path(temp).resolve()
        project = root / "repos" / "selected-project"
        subprocess.run(["git", "init", "-q", str(project)], check=True)
        source = tomllib.loads((REPO / "dot_config/herdr/config.toml").read_text())
        binding = next(item for item in source["keys"]["command"] if item["key"] == "prefix+f")
        # Keep failure text visible; successful focus may dismiss the popup first.
        command = binding["command"] + '; printf "__LAUNCHER_EXIT=%s__" "$?"; read -r ignored'
        config = root / "config.toml"
        config.write_text('onboarding = false\n[[keys.command]]\nkey="prefix+f"\n'
                          'type="popup"\nwidth="80%"\nheight="70%"\ncommand=' +
                          json.dumps(command) + "\n")
        env = {key: value for key, value in os.environ.items() if not key.startswith("HERDR_")}
        env.update(HERDR_CONFIG_PATH=str(config), TERM="xterm-256color",
                   PATH=f"{args.stale_herdr.resolve().parent}:{env['PATH']}",
                   GHQ_ROOT=str(project.parent))
        assert shutil.which("herdr", path=env["PATH"]) == str(args.stale_herdr.resolve())
        discovered = subprocess.check_output(["ghq", "list", "-p"], env=env, text=True)
        assert discovered.splitlines() == [str(project)], discovered

        def cli(*argv, check=True):
            return subprocess.run([herdr, "--session", name, *argv], env=env,
                                  text=True, capture_output=True, check=check, timeout=10)

        pid, terminal = pty.fork()
        if pid == 0:
            os.chdir(root)
            os.execve(herdr, [herdr, "--session", name], env)
        fcntl.ioctl(terminal, termios.TIOCSWINSZ, struct.pack("HHHH", 35, 140, 0, 0))
        screen = bytearray()

        def read_frame():
            if select.select([terminal], [], [], 0.1)[0]:
                data = os.read(terminal, 65536)
                screen.extend(data)
                if b"\x1b[6n" in data:
                    os.write(terminal, b"\x1b[1;1R")

        def wait_for(text):
            deadline = time.monotonic() + 15
            while time.monotonic() < deadline:
                if text in ANSI.sub(b"", screen):
                    return
                read_frame()
            raise AssertionError(f"terminal did not show {text!r}")

        try:
            wait_for(b"popup-test-")
            os.write(terminal, b"\x02f")
            wait_for(b"selected-project")
            print("PASS: Ctrl+B F opened real Television with fixture project")
            os.write(terminal, b"\r")
            deadline = time.monotonic() + 10
            selected = None
            while time.monotonic() < deadline:
                read_frame()
                snapshot = json.loads(cli("api", "snapshot").stdout)["result"]["snapshot"]
                selected = next((w for w in snapshot["workspaces"]
                                 if w["label"] == project.name), None)
                if selected and snapshot["focused_workspace_id"] == selected["workspace_id"] and any(
                    p["workspace_id"] == selected["workspace_id"] and p["cwd"] == str(project)
                    for p in snapshot["panes"]
                ):
                    break
                if not selected and b"__LAUNCHER_EXIT=" in ANSI.sub(b"", screen):
                    break
            assert selected, ("Enter did not create selected workspace:\n" +
                              ANSI.sub(b"", screen).decode(errors="replace")[-1500:])
            assert snapshot["focused_workspace_id"] == selected["workspace_id"]
            assert any(p["workspace_id"] == selected["workspace_id"] and
                       p["cwd"] == str(project) for p in snapshot["panes"]), snapshot["panes"]
            print("PASS: Enter created and focused selected project with stale inherited PATH")
        finally:
            stopped = cli("session", "stop", name, "--json", check=False)
            deleted = cli("session", "delete", name, "--json", check=False)
            os.close(terminal)
            os.waitpid(pid, 0)
            assert stopped.returncode == 0, stopped.stderr
            assert deleted.returncode == 0, deleted.stderr
            print("PASS: isolated test session stopped and deleted")


if __name__ == "__main__":
    main()
