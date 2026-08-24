#!/usr/bin/env python3
"""Structural-only validation for the preregistered pilot definition."""

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "manifest.json"
EXPECTED_ORDER = [
    ["direct", "scout-first"],
    ["scout-first", "direct"],
    ["direct", "scout-first"],
    ["scout-first", "direct"],
]
EXPECTED_CONDITIONS = {
    "parentProvider": "openai-codex",
    "parentModel": "gpt-6-astra",
    "parentThinking": "high",
    "freshSession": True,
    "persistSession": True,
    "strategies": {
        "direct": {"parentTools": ["read", "bash"], "children": {"required": 0, "maximum": 0}},
        "scout-first": {
            "parentTools": ["read", "bash", "subagent"],
            "children": {
                "required": 1,
                "maximum": 1,
                "agent": "scout",
                "provider": "openai-codex",
                "model": "gpt-5.6-luna",
                "thinking": "low",
                "tools": ["read", "bash"],
            },
        },
    },
}


def fail(message: str) -> None:
    raise SystemExit(f"INVALID: {message}")


def checked_file(path_text: str) -> Path:
    path = (ROOT / path_text).resolve()
    if ROOT not in path.parents or not path.is_file():
        fail(f"missing or escaping file: {path_text}")
    return path


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check_range(anchor: dict, corpus_paths: set[str], task_id: str) -> None:
    path_text = anchor.get("path")
    if path_text not in corpus_paths:
        fail(f"operator anchor outside corpus for {task_id}: {path_text}")
    lines = checked_file(path_text).read_text(encoding="utf-8").splitlines()
    start, end = anchor.get("startLine"), anchor.get("endLine")
    if not isinstance(start, int) or not isinstance(end, int) or start < 1 or end < start or end > len(lines):
        fail(f"operator anchor does not resolve for {task_id}: {anchor}")


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if manifest.get("schemaVersion") != 1:
        fail("schemaVersion must be 1")
    if manifest.get("conditions") != EXPECTED_CONDITIONS:
        fail("fixed conditions differ from preregistration")

    tasks = manifest.get("tasks", [])
    if len(tasks) != 4:
        fail("exactly four tasks are required")
    for index, task in enumerate(tasks):
        task_id = task.get("id", "unknown")
        if task.get("strategies") != ["direct", "scout-first"] or task.get("pairOrder") != EXPECTED_ORDER[index]:
            fail(f"strategy/order mismatch for {task_id}")
        definition = checked_file(task.get("definition", ""))
        if digest(definition) != task.get("definitionSha256"):
            fail(f"definition hash mismatch: {task_id}")
        prompt = definition.read_text(encoding="utf-8")
        if "## Model prompt (use verbatim)" not in prompt or "Use exactly these headings:" not in prompt:
            fail(f"model prompt boundary/headings missing: {task_id}")
        model_input = prompt.split("## Model prompt (use verbatim)\n", 1)[1]
        if any(term in model_input.lower() for term in ("manifest", "rubric", "required fact", "revieweranchor")):
            fail(f"operator-only material leaked into model prompt: {task_id}")

        corpus_paths = set()
        for item in task.get("corpus", []):
            path = checked_file(item.get("path", ""))
            corpus_paths.add(item["path"])
            if digest(path) != item.get("sha256"):
                fail(f"corpus hash mismatch: {item['path']}")

        rubric = task.get("rubric", {})
        facts = rubric.get("requiredFacts", [])
        if not rubric.get("operatorOnly") or not facts:
            fail(f"operator rubric missing: {task_id}")
        if len({fact.get('id') for fact in facts}) != len(facts):
            fail(f"duplicate fact id: {task_id}")
        for fact in facts:
            if not fact.get("text") or not fact.get("reviewerAnchors"):
                fail(f"fact text/anchors missing: {task_id}/{fact.get('id')}")
            for anchor in fact["reviewerAnchors"]:
                check_range(anchor, corpus_paths, task_id)

    scoring = manifest.get("correctnessScoring", {})
    if scoring.get("partialCreditChangesGate") is not False or not scoring.get("semanticReview", "").startswith("Manual"):
        fail("manual semantic hard-gate declaration missing")
    record = manifest.get("runRecordSchema", {}).get("record", {})
    for field in ("latencyMs", "correctness", "followUp", "parentVerification", "concurrency", "quotaReferences"):
        if field not in record:
            fail(f"run record field missing: {field}")

    print("OK: structural schema, fixed conditions, alternating pairs, prompt/corpus hashes, operator anchors, and range bounds validated")
    print("NOTE: semantic fact support requires the separate manual review documented in runbook.md")


if __name__ == "__main__":
    main()
