import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/context-efficiency-pilot.py"
spec = importlib.util.spec_from_file_location("pilot_validation", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def entry(kind, id_, parent, timestamp, **extra):
    return {"type": kind, "id": id_, "parentId": parent, "timestamp": timestamp, **extra}


class ValidationReportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        corpus = self.root / "corpus" / "x.txt"
        corpus.parent.mkdir()
        corpus.write_text("one\ntwo\nthree\nfour\n")
        task = self.root / "task.md"
        task.write_text("# T\n\n## Model prompt (use verbatim)\nPROMPT")
        self.suffixes = {"direct": "DIRECT", "scout-first": "SCOUT"}
        self.manifest = {
            "schemaVersion": 1,
            "conditions": {
                "parentProvider": "p", "parentModel": "m", "parentThinking": "high",
                "freshSession": True, "persistSession": True,
                "strategies": {
                    "direct": {"parentTools": ["read", "bash"], "children": {"required": 0, "maximum": 0}},
                    "scout-first": {"parentTools": ["read", "bash", "subagent"], "children": {
                        "required": 1, "maximum": 1, "agent": "scout", "provider": "p",
                        "model": "sm", "thinking": "low", "tools": ["read", "bash"]}},
                },
            },
            "routingInstructions": self.suffixes,
            "tasks": [{
                "id": "t", "definition": "task.md", "definitionSha256": hashlib.sha256(task.read_bytes()).hexdigest(),
                "strategies": ["direct", "scout-first"], "pairOrder": ["direct", "scout-first"],
                "corpus": [{"path": "corpus/x.txt", "sha256": hashlib.sha256(corpus.read_bytes()).hexdigest()}],
                "rubric": {"requiredFacts": [{"id": "F1", "reviewerAnchors": [
                    {"path": "corpus/x.txt", "startLine": 1, "endLine": 2}
                ]}]},
            }],
        }

    def _session(self, strategy, child=False, forged_read=False, raw="SECRET ANSWER KEY"):
        prompt = "PROMPT\n\n" + self.suffixes[strategy]
        rows = [{"type": "session", "version": 3, "id": strategy, "timestamp": "2026-01-01T00:00:00Z", "cwd": str(self.root)},
            entry("model_change", "mc", None, "2026-01-01T00:00:01Z", provider="p", modelId="m"),
            entry("thinking_level_change", "tc", "mc", "2026-01-01T00:00:02Z", thinkingLevel="high"),
            entry("message", "u", "tc", "2026-01-01T00:00:03Z", message={"role": "user", "content": [{"type":"text","text":prompt}]})]
        parent = "u"
        child_path = None
        if child:
            child_path = self.root / "child.jsonl"
            child_rows = [{"type": "session", "version": 3, "id": "child", "timestamp": "2026-01-01T00:00:00Z", "cwd": str(self.root)},
                entry("model_change", "cm", None, "2026-01-01T00:00:01Z", provider="p", modelId="sm"), entry("thinking_level_change", "ct", "cm", "2026-01-01T00:00:02Z", thinkingLevel="low"),
                entry("message", "cu", "ct", "2026-01-01T00:00:02.500Z", message={"role":"user","content":[{"type":"text","text":"Harness task: " + raw}]}),
                entry("message", "ca", "cu", "2026-01-01T00:00:03Z", message={"role":"assistant","content":[],"provider":"p","model":"sm","usage":{"input":2,"output":1,"cacheRead":0,"cacheWrite":0,"totalTokens":3},"stopReason":"stop"})]
            child_path.write_text("".join(json.dumps(x)+"\n" for x in child_rows))
            rows += [entry("message", "call", parent, "2026-01-01T00:00:04Z", message={"role":"assistant","content":[{"type":"toolCall","id":"sub1","name":"subagent","arguments":{"name":"s","task":raw,"agent":"scout","model":"p/sm","tools":"read,bash"}}],"provider":"p","model":"m","usage":{"input":4,"output":1,"cacheRead":1,"cacheWrite":0,"totalTokens":6},"stopReason":"toolUse"}),
                entry("message", "start", "call", "2026-01-01T00:00:05Z", message={"role":"toolResult","toolCallId":"sub1","toolName":"subagent","content":[{"type":"text","text":raw}],"details":{"id":"x","name":"s","task":raw,"agent":"scout","sessionFile":str(child_path),"status":"started"},"isError":False}),
                entry("custom_message", "done", "start", "2026-01-01T00:00:06Z", customType="subagent_result", content=raw, details={"name":"s","task":raw,"agent":"scout","sessionFile":str(child_path),"sessionFileExists":True,"exitCode":0})]
            parent = "done"
        rows += [entry("message", "readcall", parent, "2026-01-01T00:00:07Z", message={"role":"assistant","content":[{"type":"toolCall","id":"r1","name":"read","arguments":{"path":"corpus/x.txt","offset":1,"limit":3}}],"provider":"p","model":"m","usage":{"input":3,"output":1,"cacheRead":0,"cacheWrite":0,"totalTokens":4},"stopReason":"toolUse"}),
            entry("message", "readresult", "readcall", "2026-01-01T00:00:08Z", message={"role":"toolResult","toolCallId":"r1","toolName":"read","content":[{"type":"text","text":"one\ntwo\nthree\n\n[2 more lines in file. Use offset=4 to continue.]" if not forged_read else "one"}],"details":None,"isError":False}),
            entry("message", "final", "readresult", "2026-01-01T00:00:09Z", message={"role":"assistant","content":[{"type":"text","text":raw + " corpus/x.txt:1-2"}],"provider":"p","model":"m","usage":{"input":5,"output":2,"cacheRead":1,"cacheWrite":0,"totalTokens":8},"stopReason":"stop"})]
        path = self.root / f"{strategy}.jsonl"
        path.write_text("".join(json.dumps(x)+"\n" for x in rows))
        return path, child_path, prompt

    def _record(self, strategy="direct", exact=False, forged=False):
        parent, child, prompt = self._session(strategy, strategy == "scout-first", forged)
        citation = {"path":"corpus/x.txt","startLine":1,"endLine":2}
        return {"schemaVersion":1,"taskId":"t","strategy":strategy,"pairPosition":1 if strategy=="direct" else 2,"status":"complete","parentSession":str(parent),"scoutSessions":[] if child is None else [str(child)],"startedAt":"2026-01-01T00:00:00Z","endedAt":"2026-01-01T00:00:09Z","latencyMs":9000,
            "observedConditions":{"parentProvider":"p","parentModel":"m","parentThinking":"high","parentTools":["read","bash"] if strategy=="direct" else ["read","bash","subagent"],"child":{"agent":None if child is None else "scout","provider":None if child is None else "p","model":None if child is None else "sm","thinking":None if child is None else "low","tools":[] if child is None else ["read","bash"]},"promptSha256":hashlib.sha256(prompt.encode()).hexdigest(),"corpus":self.manifest["tasks"][0]["corpus"]},
            "correctness":{"facts":[{"factId":"F1","factScore":1,"citationScore":1,"acceptedCitations":[citation],"reviewerNote":"manual"}],"contradictions":[],"correct":True,"scoredBy":"operator","scoredAt":"2026-01-01T01:00:00Z"},"followUp":{"parentReadCallsAfterScout":1 if child else 0,"parentBashCallsAfterScout":0},
            "parentVerification":{"childCompletedSequence":6 if child else None,"finalAnswerSequence":9 if child else 6,"parentReads":[{"toolCallId":"r1","path":"corpus/x.txt","startLine":1,"endLine":1 if forged else 3,"completedSequence":8 if child else 5}],"factRangeMappings":[{"factId":"F1","citation":citation,"parentReadToolCallIds":["r1"]}] if exact else []},
            "concurrency":{"status":"none-observed","details":""},"quotaReferences":{"beforeObservation":None,"afterObservation":None,"attribution":"unavailable"}}

    def test_invalid_drift_missing_and_duplicate_child(self):
        record = self._record(); record["observedConditions"]["parentModel"] = "drift"
        self.assertFalse(module.validate_run_record(self.manifest, record, self.root)["valid"])
        scout = self._record("scout-first"); scout["scoutSessions"] = []
        self.assertFalse(module.validate_run_record(self.manifest, scout, self.root)["valid"])
        scout = self._record("scout-first"); scout["scoutSessions"].append(scout["scoutSessions"][0])
        self.assertFalse(module.validate_run_record(self.manifest, scout, self.root)["valid"])

    def test_qualified_child_model_matches_provider_and_model(self):
        record = self._record("scout-first")
        result = module.validate_run_record(self.manifest, record, self.root)
        self.assertTrue(result["valid"], result["invalidReasons"])
        path = Path(record["parentSession"])
        rows = [json.loads(line) for line in path.read_text().splitlines()]
        call = next(row for row in rows if row.get("id") == "call")
        call["message"]["content"][0]["arguments"]["model"] = "wrong-provider/sm"
        path.write_text("".join(json.dumps(row) + "\n" for row in rows))
        result = module.validate_run_record(self.manifest, record, self.root)
        self.assertIn("actual child invocation condition mismatch", result["invalidReasons"])

    def test_raw_model_text_is_excluded(self):
        result = module.validate_run_record(self.manifest, self._record(), self.root)
        self.assertNotIn("SECRET ANSWER KEY", json.dumps(result))

    def test_failed_rubric_cannot_win(self):
        direct, scout = self._record(), self._record("scout-first")
        scout["correctness"]["facts"][0]["factScore"] = 0; scout["correctness"]["correct"] = False
        summary = module.summarize_records(self.manifest, [direct, scout], self.root)
        self.assertFalse(summary["pairs"][0]["runs"][1]["efficiencyWin"])

    def test_exact_contract_rejects_forged_or_truncated_coverage_and_accepts_good(self):
        self.manifest["tasks"][0]["id"] = "exact-integration-contract"
        for forged in (True, False):
            record = self._record("scout-first", exact=True, forged=forged); record["taskId"] = "exact-integration-contract"
            result = module.validate_run_record(self.manifest, record, self.root)
            self.assertEqual(result["valid"], not forged)

    def test_exact_citation_coverage_ignores_prose_order_and_repetition(self):
        self.manifest["tasks"][0]["id"] = "exact-integration-contract"
        record = self._record("scout-first", exact=True)
        record["taskId"] = "exact-integration-contract"
        second = {"path": "corpus/x.txt", "startLine": 2, "endLine": 3}
        self.manifest["tasks"][0]["rubric"]["requiredFacts"].append({"id": "F2"})
        record["correctness"]["facts"].append({"factId": "F2", "factScore": 1, "citationScore": 1,
            "acceptedCitations": [second], "reviewerNote": "Second supported fact"})
        record["parentVerification"]["factRangeMappings"].append({"factId": "F2", "citation": second,
            "parentReadToolCallIds": ["r1"]})
        path = Path(record["parentSession"])
        rows = [json.loads(line) for line in path.read_text().splitlines()]
        rows[-1]["message"]["content"][0]["text"] = "corpus/x.txt:2-3 corpus/x.txt:1-2 corpus/x.txt:2-3"
        path.write_text("".join(json.dumps(row) + "\n" for row in rows))
        result = module.validate_run_record(self.manifest, record, self.root)
        self.assertTrue(result["valid"], result["invalidReasons"])
        rows[-1]["message"]["content"][0]["text"] += " corpus/x.txt:3-4"
        path.write_text("".join(json.dumps(row) + "\n" for row in rows))
        result = module.validate_run_record(self.manifest, record, self.root)
        self.assertIn("final answer citations differ from scored citations", result["invalidReasons"])

    def test_live_shape_normalizes_repo_relative_paths_and_rejects_images(self):
        base = self.root / "research/context-efficiency"
        (base / "corpus").mkdir(parents=True)
        (base / "task.md").write_bytes((self.root / "task.md").read_bytes())
        (base / "corpus/x.txt").write_bytes((self.root / "corpus/x.txt").read_bytes())
        record = self._record()
        path = Path(record["parentSession"])
        rows = [json.loads(line) for line in path.read_text().splitlines()]
        rows[0]["cwd"] = str(self.root)
        next(row for row in rows if row.get("id") == "readcall")["message"]["content"][0]["arguments"]["path"] = "research/context-efficiency/corpus/x.txt"
        final = next(row for row in rows if row.get("id") == "final")["message"]["content"][0]
        final["text"] = final["text"].replace("corpus/x.txt:1-2", "research/context-efficiency/corpus/x.txt:1-2")
        path.write_text("".join(json.dumps(row)+"\n" for row in rows))
        self.assertTrue(module.validate_run_record(self.manifest, record, base)["valid"])

        rows = [json.loads(line) for line in path.read_text().splitlines()]
        user = next(row for row in rows if row.get("id") == "u")["message"]
        user["content"].append({"type":"image","data":"AA==","mimeType":"image/png"})
        path.write_text("".join(json.dumps(row)+"\n" for row in rows))
        self.assertFalse(module.validate_run_record(self.manifest, record, base)["valid"])

    def test_rejects_fabricated_boundaries_latency_and_followup(self):
        for mutation in ("child", "final", "latency", "followup"):
            record = self._record("scout-first")
            if mutation == "child": record["parentVerification"]["childCompletedSequence"] = 5
            if mutation == "final": record["parentVerification"]["finalAnswerSequence"] = 99
            if mutation == "latency": record["latencyMs"] = 0
            if mutation == "followup": record["followUp"]["parentReadCallsAfterScout"] = 0
            with self.subTest(mutation=mutation):
                self.assertFalse(module.validate_run_record(self.manifest, record, self.root)["valid"])

    def test_rejects_outside_parent_read_and_altered_child_task(self):
        record = self._record("scout-first")
        rows = [json.loads(line) for line in Path(record["parentSession"]).read_text().splitlines()]
        rows[7]["message"]["content"][0]["arguments"]["path"] = "/etc/passwd"
        Path(record["parentSession"]).write_text("".join(json.dumps(row)+"\n" for row in rows))
        self.assertFalse(module.validate_run_record(self.manifest, record, self.root)["valid"])

        record = self._record("scout-first")
        child = Path(record["scoutSessions"][0])
        rows = [json.loads(line) for line in child.read_text().splitlines()]
        next(row for row in rows if row.get("type") == "message" and row["message"].get("role") == "user")["message"]["content"] = "different task"
        child.write_text("".join(json.dumps(row)+"\n" for row in rows))
        self.assertFalse(module.validate_run_record(self.manifest, record, self.root)["valid"])

        record = self._record("scout-first")
        child = Path(record["scoutSessions"][0])
        rows = [json.loads(line) for line in child.read_text().splitlines()]
        assistant = next(row for row in rows if row.get("id") == "ca")
        assistant["message"]["content"] = [{"type":"toolCall","id":"cr","name":"read","arguments":{"path":"/etc/passwd","offset":1,"limit":1}}]
        assistant["message"]["stopReason"] = "toolUse"
        rows.append(entry("message", "crr", "ca", "2026-01-01T00:00:04Z", message={"role":"toolResult","toolCallId":"cr","toolName":"read","content":[{"type":"text","text":"root"}],"isError":False}))
        child.write_text("".join(json.dumps(row)+"\n" for row in rows))
        self.assertFalse(module.validate_run_record(self.manifest, record, self.root)["valid"])

    def test_rejects_tool_call_after_final_answer(self):
        record = self._record("scout-first")
        path = Path(record["parentSession"])
        rows = [json.loads(line) for line in path.read_text().splitlines()]
        rows += [entry("message", "latecall", "final", "2026-01-01T00:00:10Z", message={"role":"assistant","content":[{"type":"toolCall","id":"late","name":"read","arguments":{"path":"corpus/x.txt","offset":1,"limit":1}}],"provider":"p","model":"m","usage":{"input":1,"output":1,"cacheRead":0,"cacheWrite":0,"totalTokens":2},"stopReason":"toolUse"}),
            entry("message", "lateresult", "latecall", "2026-01-01T00:00:11Z", message={"role":"toolResult","toolCallId":"late","toolName":"read","content":[{"type":"text","text":"one\n\n[4 more lines in file. Use offset=2 to continue.]"}],"isError":False})]
        path.write_text("".join(json.dumps(row)+"\n" for row in rows))
        self.assertFalse(module.validate_run_record(self.manifest, record, self.root)["valid"])

    def test_accepts_genuine_line_truncation(self):
        corpus = self.root / "corpus/x.txt"
        corpus.write_text("\n".join(f"line {index}" for index in range(2002)))
        digest = hashlib.sha256(corpus.read_bytes()).hexdigest()
        self.manifest["tasks"][0]["corpus"][0]["sha256"] = digest
        record = self._record()
        record["observedConditions"]["corpus"][0]["sha256"] = digest
        path = Path(record["parentSession"])
        rows = [json.loads(line) for line in path.read_text().splitlines()]
        call = next(row for row in rows if row.get("id") == "readcall")["message"]["content"][0]
        call["arguments"] = {"path":"corpus/x.txt"}
        result = next(row for row in rows if row.get("id") == "readresult")["message"]
        shown = "\n".join(f"line {index}" for index in range(2000))
        result["content"][0]["text"] = shown + "\n\n[Showing lines 1-2000 of 2002. Use offset=2001 to continue.]"
        result["details"] = {"truncation":{"content":shown,"truncated":True,"truncatedBy":"lines","totalLines":2002,"totalBytes":len(corpus.read_bytes()),"outputLines":2000,"outputBytes":len(shown.encode()),"lastLinePartial":False,"firstLineExceedsLimit":False,"maxLines":2000,"maxBytes":51200}}
        path.write_text("".join(json.dumps(row)+"\n" for row in rows))
        validation = module.validate_run_record(self.manifest, record, self.root)
        self.assertTrue(validation["valid"], validation["invalidReasons"])

    def test_bash_grammar_allows_only_bounded_options_and_corpus_files(self):
        good = [
            "rg -nFi pattern corpus/x.txt",
            "rg --no-config --line-number pattern corpus/x.txt",
            "grep -nE -- 'one.*two' corpus/x.txt",
            "wc -l corpus/x.txt",
            "sha256sum corpus/x.txt",
        ]
        bad = [
            "rg --pre='cat /etc/passwd' root corpus/x.txt",
            "rg --pre 'cat /etc/passwd' root corpus/x.txt",
            "grep --exclude-from=/etc/passwd one corpus/x.txt",
            "grep --exclude-from /etc/passwd one corpus/x.txt",
            "wc --files0-from=/etc/passwd corpus/x.txt",
            "wc --files0-from /etc/passwd corpus/x.txt",
            "rg -g '*.txt' one corpus/x.txt",
            "rg -n one corpus",
            "rg -n one corpus/x.txt\nprintf nope",
        ]
        for command, expected in [(value, True) for value in good] + [(value, False) for value in bad]:
            record = self._record()
            path = Path(record["parentSession"])
            rows = [json.loads(line) for line in path.read_text().splitlines()]
            call = next(row for row in rows if row.get("id") == "readcall")["message"]["content"][0]
            call.update({"name":"bash", "arguments":{"command":command}})
            next(row for row in rows if row.get("id") == "readresult")["message"]["toolName"] = "bash"
            path.write_text("".join(json.dumps(row)+"\n" for row in rows))
            with self.subTest(command=command):
                self.assertEqual(module.validate_run_record(self.manifest, record, self.root)["valid"], expected)

    def test_rejects_truncation_metadata_and_unverifiable_bash(self):
        record = self._record()
        rows = [json.loads(line) for line in Path(record["parentSession"]).read_text().splitlines()]
        next(row for row in rows if row.get("type") == "message" and row["message"].get("role") == "toolResult")["message"]["details"] = {"truncation":{"truncated":True,"outputLines":3}}
        Path(record["parentSession"]).write_text("".join(json.dumps(row)+"\n" for row in rows))
        self.assertFalse(module.validate_run_record(self.manifest, record, self.root)["valid"])

        record = self._record()
        rows = [json.loads(line) for line in Path(record["parentSession"]).read_text().splitlines()]
        call = next(row for row in rows if row.get("id") == "readcall")["message"]["content"][0]
        call.update({"name":"bash", "arguments":{"command":"cat /etc/passwd"}})
        next(row for row in rows if row.get("id") == "readresult")["message"]["toolName"] = "bash"
        Path(record["parentSession"]).write_text("".join(json.dumps(row)+"\n" for row in rows))
        self.assertFalse(module.validate_run_record(self.manifest, record, self.root)["valid"])


if __name__ == "__main__": unittest.main()
