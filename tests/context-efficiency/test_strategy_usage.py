import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "context-efficiency-pilot.py"
FIXTURES = Path(__file__).parent / "fixtures"
spec = importlib.util.spec_from_file_location("context_efficiency_strategy", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class StrategyUsageTests(unittest.TestCase):
    def _sessions(self, completion_overrides=None, include_completion=True):
        temporary = tempfile.TemporaryDirectory()
        directory = Path(temporary.name)
        child = directory / "child.jsonl"
        child.write_text((FIXTURES / "scout-v3.jsonl").read_text())
        parent_text = (FIXTURES / "parent-subagent-v3.jsonl").read_text().replace("__CHILD_SESSION__", str(child))
        entries = [json.loads(line) for line in parent_text.splitlines()]
        if not include_completion:
            entries = [entry for entry in entries if entry.get("customType") != "subagent_result"]
        elif completion_overrides:
            next(entry for entry in entries if entry.get("customType") == "subagent_result")["details"].update(completion_overrides)
        parent = directory / "parent.jsonl"
        parent.write_text("".join(json.dumps(entry) + "\n" for entry in entries))
        self.addCleanup(temporary.cleanup)
        return parent, child

    def test_reports_parent_scout_and_combined_usage_without_double_counting(self):
        parent, child = self._sessions()
        result = module.parse_strategy_usage(parent)
        self.assertTrue(result["valid"])
        self.assertEqual(result["parent"]["totals"], {"input": 10, "output": 2, "cacheRead": 3, "cacheWrite": 1, "totalTokens": 16})
        self.assertEqual(result["scouts"][0]["totals"], {"input": 20, "output": 4, "cacheRead": 5, "cacheWrite": 2, "totalTokens": 31})
        self.assertEqual(result["combined"], {"input": 30, "output": 6, "cacheRead": 8, "cacheWrite": 3, "totalTokens": 47})
        self.assertEqual(len(result["scouts"]), 1)  # start and completion reference one child
        self.assertEqual(result["scouts"][0]["identity"]["sourcePath"], str(child.resolve()))
        self.assertEqual(result["links"][0]["start"]["sequence"], 2)
        self.assertEqual(result["links"][0]["completion"]["sequence"], 3)
        self.assertEqual(result["links"][0]["invocation"], {"id": "child-run-id", "name": "Inventory scout", "agent": "scout", "model": "gpt-5.6-luna", "tools": "read,bash"})
        serialized = json.dumps(result)
        self.assertNotIn("CANARY_SCOUT_TASK", serialized)
        self.assertNotIn("CANARY_RESULT_CONTENT", serialized)

    def test_child_own_usage_includes_startup_prompt_overhead_only_once(self):
        parent, _ = self._sessions()
        result = module.parse_strategy_usage(parent)
        # Child assistant usage is complete session telemetry, including its startup prompt.
        # Parent tool-result nested usage is never added; only independently parsed sessions are.
        self.assertEqual(result["combined"]["input"], 10 + 20)

    def test_missing_child_makes_combined_unavailable(self):
        parent, child = self._sessions()
        child.unlink()
        result = module.parse_strategy_usage(parent)
        self.assertFalse(result["valid"])
        self.assertIsNone(result["combined"])
        self.assertEqual(result["diagnostics"][0]["code"], "child_session_not_found")

    def test_rejects_incomplete_failed_and_mismatched_linkage(self):
        cases = [
            ({}, False, "incomplete_subagent"),
            ({"exitCode": 1}, True, "failed_subagent"),
            ({"agent": "worker"}, True, "mismatched_subagent_linkage"),
            ({"sessionFile": "/different/child.jsonl"}, True, "mismatched_subagent_linkage"),
        ]
        for overrides, include_completion, expected in cases:
            with self.subTest(expected=expected):
                parent, _ = self._sessions(overrides, include_completion)
                result = module.parse_strategy_usage(parent)
                self.assertFalse(result["valid"])
                self.assertIsNone(result["combined"])
                self.assertEqual(result["diagnostics"][0]["code"], expected)


if __name__ == "__main__":
    unittest.main()
