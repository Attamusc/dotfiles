#!/usr/bin/env python3
"""Exercise the launcher CLI without changing the user's Herdr session."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import tomllib
import unittest


REPO = Path(__file__).resolve().parents[2]
LAUNCHER = REPO / "dot_local/bin/executable_herdr-project"
STUB = '''#!/usr/bin/env python3
import json, os
from pathlib import Path
import sys
name = Path(sys.argv[0]).name
scenario = json.loads(Path(os.environ["SCENARIO"]).read_text())
assert os.environ["HERDR_SOCKET_PATH"] == scenario["socket_path"]
with open(os.environ["CALLS"], "a") as log:
    log.write(json.dumps([name, *sys.argv[1:]]) + "\\n")
if name == "ghq":
    print(scenario["projects"], end="")
    sys.exit(scenario.get("ghq_status", 0))
if name == "chezmoi":
    assert sys.argv[1:] == ["source-path"]
    print(scenario["dotfiles"])
    sys.exit(scenario.get("chezmoi_status", 0))
if name == "tv":
    assert sys.stdin.read() == scenario["picker_input"]
    print(scenario["selection"], end="")
    sys.exit(scenario.get("tv_status", 0))
if sys.argv[1:] == ["api", "snapshot"]:
    print(scenario.get("snapshot_text", json.dumps({"result": {"snapshot": {
        "panes": scenario.get("panes", [])
    }}})))
    sys.exit(scenario.get("snapshot_status", 0))
sys.exit(scenario.get("mutation_status", 0))
'''


class ProjectLauncherTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.bin = self.root / "bin"
        self.bin.mkdir()
        for command in ("ghq", "chezmoi", "tv", "herdr"):
            stub = self.bin / command
            stub.write_text(STUB)
            stub.chmod(0o755)
        self.project = self.root / "owner's projects" / "app"
        self.project.mkdir(parents=True)
        self.dotfiles = self.root / ".local" / "share" / "chezmoi"
        self.dotfiles.mkdir(parents=True)
        self.scenario = {
            "projects": str(self.project) + "\n",
            "dotfiles": str(self.dotfiles),
            "picker_input": f"{self.project}\n{self.dotfiles}\n",
            "selection": str(self.project) + "\n",
            "socket_path": str(self.root / "named-session.sock"),
        }
        self.env = dict(os.environ, HERDR_ENV="1",
                        HERDR_SOCKET_PATH=self.scenario["socket_path"],
                        PATH=f"{self.bin}:{os.environ['PATH']}",
                        SCENARIO=str(self.root / "scenario.json"),
                        CALLS=str(self.root / "calls.jsonl"))

    def launch(self, success=True):
        Path(self.env["SCENARIO"]).write_text(json.dumps(self.scenario))
        result = subprocess.run([sys.executable, str(LAUNCHER)], env=self.env,
                                text=True, capture_output=True)
        if success:
            self.assertEqual(result.returncode, 0, result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0)
        log = Path(self.env["CALLS"])
        self.calls = [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []
        return result

    def mutations(self):
        return [call for call in self.calls if call[:2] == ["herdr", "workspace"]]

    def init_git(self, directory):
        subprocess.run(["git", "init", "-q", str(directory)], check=True)

    def test_creates_workspace_at_selected_path(self):
        self.launch()
        self.assertEqual(self.calls[0], ["ghq", "list", "-p"])
        self.assertEqual(self.mutations(), [["herdr", "workspace", "create", "--cwd",
                                             str(self.project), "--label", "app", "--focus"]])
        self.assertIn("--no-remote", self.calls[2])

    def test_focuses_existing_workspace_without_creating(self):
        self.scenario["panes"] = [
            {"workspace_id": "wF", "cwd": str(self.project)},
            {"workspace_id": "wF", "cwd": str(self.project)},
        ]
        self.launch()
        self.assertEqual(self.mutations(), [["herdr", "workspace", "focus", "wF"]])

    def test_same_basename_elsewhere_is_not_a_match(self):
        other = self.root / "other-owner" / "app"
        other.mkdir(parents=True)
        self.scenario["panes"] = [{"workspace_id": "w1", "cwd": str(other)}]
        self.launch()
        self.assertEqual(self.mutations()[0][2], "create")

    def test_focuses_repository_when_pane_is_in_subdirectory(self):
        self.init_git(self.project)
        subdir = self.project / "src"
        subdir.mkdir()
        self.scenario["panes"] = [{"workspace_id": "w2", "cwd": str(subdir)}]
        self.launch()
        self.assertEqual(self.mutations(), [["herdr", "workspace", "focus", "w2"]])

    def test_failed_repository_lookup_does_not_create_duplicate(self):
        subdir = self.project / "src"
        subdir.mkdir()
        self.scenario["panes"] = [{"workspace_id": "w2", "cwd": str(subdir)}]
        self.launch(success=False)
        self.assertEqual(self.mutations(), [])

    def test_nested_repository_is_not_the_parent_project(self):
        self.init_git(self.project)
        nested = self.project / "nested"
        self.init_git(nested)
        self.scenario["panes"] = [{"workspace_id": "w2", "cwd": str(nested)}]
        self.launch()
        self.assertEqual(self.mutations()[0][2], "create")

    def test_nested_gitfile_checkout_is_not_the_parent_project(self):
        self.init_git(self.project)
        nested = self.project / "nested-worktree"
        subprocess.run(["git", "init", "-q", "--separate-git-dir",
                        str(self.root / "nested.git"), str(nested)], check=True)
        self.assertTrue((nested / ".git").is_file())
        self.scenario["panes"] = [{"workspace_id": "w2", "cwd": str(nested)}]
        self.launch()
        self.assertEqual(self.mutations()[0][2], "create")

    def test_symlinked_project_and_pane_paths_match(self):
        alias = self.root / "alias"
        alias.symlink_to(self.project, target_is_directory=True)
        self.scenario["selection"] = str(alias) + "\n"
        self.scenario["projects"] += str(alias) + "\n"
        self.scenario["picker_input"] = f"{self.project}\n{alias}\n{self.dotfiles}\n"
        self.scenario["panes"] = [{"workspace_id": "w9", "cwd": str(self.project)}]
        self.launch()
        self.assertEqual(self.mutations(), [["herdr", "workspace", "focus", "w9"]])

    def test_null_pane_cwd_is_ignored(self):
        self.scenario["panes"] = [{"workspace_id": "w3", "cwd": None}]
        self.launch()
        self.assertEqual(self.mutations()[0][2], "create")

    def test_escape_and_ctrl_c_cancel_without_herdr_calls(self):
        for status, selection in ((0, ""), (0, "\n"), (130, "")):
            with self.subTest(status=status, selection=selection):
                Path(self.env["CALLS"]).unlink(missing_ok=True)
                self.scenario.update(selection=selection, tv_status=status)
                self.launch()
                self.assertFalse(any(call[0] == "herdr" for call in self.calls))

    def test_picker_failure_does_not_create(self):
        self.scenario["tv_status"] = 1
        self.launch(success=False)
        self.assertEqual(self.mutations(), [])

    def test_discovery_failure_does_not_open_picker(self):
        self.scenario["ghq_status"] = 1
        self.launch(success=False)
        self.assertEqual(self.calls, [["ghq", "list", "-p"]])

    def test_dotfiles_are_available_without_ghq_projects(self):
        self.scenario.update(projects="", selection=f"{self.dotfiles}\n",
                             picker_input=f"{self.dotfiles}\n")
        self.launch()
        self.assertEqual(self.mutations(), [["herdr", "workspace", "create", "--cwd",
                                             str(self.dotfiles), "--label", "chezmoi", "--focus"]])

    def test_selects_dotfiles_outside_project_root(self):
        self.scenario["selection"] = f"{self.dotfiles}\n"
        self.launch()
        self.assertEqual(self.mutations(), [["herdr", "workspace", "create", "--cwd",
                                             str(self.dotfiles), "--label", "chezmoi", "--focus"]])

    def test_focuses_existing_dotfiles_workspace(self):
        self.scenario.update(selection=f"{self.dotfiles}\n",
                             panes=[{"workspace_id": "wD", "cwd": str(self.dotfiles)}])
        self.launch()
        self.assertEqual(self.mutations(), [["herdr", "workspace", "focus", "wD"]])

    def test_dotfiles_already_in_ghq_list_are_not_duplicated(self):
        self.scenario["projects"] += f"{self.dotfiles}\n"
        self.launch()
        self.assertEqual(self.mutations()[0][2], "create")

    def test_chezmoi_failure_does_not_open_picker(self):
        self.scenario["chezmoi_status"] = 1
        self.launch(success=False)
        self.assertEqual(self.calls, [["ghq", "list", "-p"], ["chezmoi", "source-path"]])

    def test_snapshot_failure_never_creates_duplicate(self):
        for change in ({"snapshot_status": 1}, {"snapshot_text": "not json"},
                       {"snapshot_text": '{"result": {}}'}):
            with self.subTest(change=change):
                Path(self.env["CALLS"]).unlink(missing_ok=True)
                self.scenario.update(change)
                self.launch(success=False)
                self.assertEqual(self.mutations(), [])
                self.scenario.pop("snapshot_status", None)
                self.scenario.pop("snapshot_text", None)

    def test_failed_focus_does_not_create_duplicate(self):
        self.scenario.update(panes=[{"workspace_id": "w2", "cwd": str(self.project)}],
                             mutation_status=1)
        self.launch(success=False)
        self.assertEqual(self.mutations(), [["herdr", "workspace", "focus", "w2"]])

    def test_failed_creation_is_reported_without_retry(self):
        self.scenario["mutation_status"] = 1
        self.launch(success=False)
        self.assertEqual(len(self.mutations()), 1)
        self.assertEqual(self.mutations()[0][2], "create")

    def test_multiple_selections_are_rejected(self):
        self.scenario["selection"] += str(self.project) + "\n"
        self.launch(success=False)
        self.assertEqual(self.mutations(), [])

    def test_outside_herdr_is_rejected(self):
        self.env.pop("HERDR_ENV")
        result = self.launch(success=False)
        self.assertIn("inside Herdr", result.stderr)
        self.assertEqual(self.calls, [])

    def test_popup_binding_uses_installed_script(self):
        config = tomllib.loads((REPO / "dot_config/herdr/config.toml").read_text())
        binding = next(item for item in config["keys"]["command"] if item["key"] == "prefix+f")
        self.assertEqual(binding, {"key": "prefix+f", "type": "popup",
                                   "command": 'mise exec -- \"$HOME/.local/bin/herdr-project\"',
                                   "width": "80%", "height": "70%"})


if __name__ == "__main__":
    unittest.main(verbosity=2)
