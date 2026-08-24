import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "context-efficiency-pilot.py"
FIXTURE = Path(__file__).parent / "fixtures" / "linear-v3.jsonl"
spec = importlib.util.spec_from_file_location("context_efficiency_pilot", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ParentSessionParserTests(unittest.TestCase):
    def test_exact_usage_peak_conditions_and_timing(self):
        result = module.parse_session_usage(FIXTURE)
        self.assertTrue(result["valid"])
        self.assertEqual(result["totals"], {"input": 30, "output": 5, "cacheRead": 35, "cacheWrite": 10, "totalTokens": 80})
        self.assertEqual([r["requestInputFootprint"] for r in result["responses"]], [44, 31])
        self.assertEqual(result["peakRequestInputFootprint"], 44)
        self.assertEqual(result["responses"][0]["outputTokens"], 2)
        self.assertEqual(result["elapsedMs"], 5000)
        self.assertEqual(result["identity"]["sessionId"], "session-safe-id")
        self.assertEqual(result["identity"]["parentSession"], "/safe/parent.jsonl")
        self.assertEqual(result["conditionChanges"], [
            {"type": "thinking", "timestamp": "2026-09-06T10:00:00.500Z", "thinking": "high"},
            {"type": "model", "timestamp": "2026-09-06T10:00:04.000Z", "provider": "anthropic", "model": "claude-b"},
        ])

    def test_missing_and_malformed_are_invalid(self):
        missing = module.parse_session_usage(Path("/definitely/missing.jsonl"))
        self.assertFalse(missing["valid"])
        self.assertEqual(missing["diagnostics"][0]["code"], "session_not_found")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bad.jsonl"
            path.write_text('{"type":"session"}\nnot-json\n')
            malformed = module.parse_session_usage(path)
        self.assertFalse(malformed["valid"])
        self.assertEqual(malformed["diagnostics"][0]["code"], "malformed_json")
        self.assertEqual(malformed["diagnostics"][0]["line"], 2)

    def test_aborted_and_ambiguous_tree_are_invalid(self):
        cases = [
            [
                {"type": "session", "version": 3, "id": "s", "timestamp": "2026-01-01T00:00:00Z"},
                {"type": "message", "id": "a", "parentId": None, "timestamp": "2026-01-01T00:00:01Z", "message": {"role": "assistant", "provider": "p", "model": "m", "stopReason": "aborted", "usage": {k: 1 for k in module.USAGE_FIELDS}}},
            ],
            [
                {"type": "session", "version": 3, "id": "s", "timestamp": "2026-01-01T00:00:00Z"},
                {"type": "message", "id": "a", "parentId": None, "timestamp": "2026-01-01T00:00:01Z", "message": {"role": "user"}},
                {"type": "message", "id": "b", "parentId": "a", "timestamp": "2026-01-01T00:00:02Z", "message": {"role": "user"}},
                {"type": "message", "id": "c", "parentId": "a", "timestamp": "2026-01-01T00:00:03Z", "message": {"role": "user"}},
            ],
        ]
        expected = ["aborted_session", "ambiguous_session_tree"]
        for entries, code in zip(cases, expected):
            with self.subTest(code=code), tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "case.jsonl"
                path.write_text("".join(json.dumps(e) + "\n" for e in entries))
                result = module.parse_session_usage(path)
                self.assertFalse(result["valid"])
                self.assertEqual(result["diagnostics"][0]["code"], code)

    def test_cli_emits_only_safe_json(self):
        completed = subprocess.run([sys.executable, str(SCRIPT), str(FIXTURE)], check=True, text=True, capture_output=True)
        result = json.loads(completed.stdout)
        self.assertEqual(completed.stderr, "")
        serialized = json.dumps(result)
        for secret in ("CANARY_PROMPT_SECRET", "CANARY_ASSISTANT_SECRET", "CANARY_TOOL_SECRET", "/secret/project"):
            self.assertNotIn(secret, serialized)


if __name__ == "__main__":
    unittest.main()
