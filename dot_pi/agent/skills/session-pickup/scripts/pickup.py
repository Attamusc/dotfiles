#!/usr/bin/env python3
"""Build bounded working context from the canonical session reader."""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

MAX_OUTPUT_BYTES = 16 * 1024
MAX_READER_BYTES = 16 * 1024
MAX_FOCUS_CHARS = 256
MAX_EXCERPT_CHARS = 1200
MAX_ITEMS = 6
MAX_PER_SECTION = 2
SOURCES = {
    "message (original)",
    "custom-message (original)",
    "branch-summary (derived)",
    "compaction-summary (derived)",
}
SECTIONS = (
    "Goal and current state",
    "Recorded decisions",
    "Unfinished work and blockers",
    "Relevant paths and symbols",
    "Contradictions and unknowns",
)
REDACTION = re.compile(r"\[REDACTED:([^\]]+)\]")


def error(code):
    text = f"## Reconstruction status\n\n- {code}\n\n## Disclosure notes\n\n- No excerpts or promotion proposal were rendered.\n"
    sys.stdout.write(text[:MAX_OUTPUT_BYTES])
    return 2


def classify(item):
    text = item["text"].casefold()
    if re.search(r"\b(decid(?:e|ed|ing)|decision|chose|chosen)\b", text):
        return "Recorded decisions"
    if re.search(r"\b(todo|unfinished|remaining|next step|blocked|blocker|failed|failure)\b", text):
        return "Unfinished work and blockers"
    if re.search(r"\b(contradict|conflict|unknown|unclear|question|uncertain|not documented)\b", text):
        return "Contradictions and unknowns"
    if re.search(r"(?:^|[\s'\"])(?:\.?[\w.-]+/)+[\w.-]+|`[^`]+`|\b(?:class|function|method|symbol)\s+[A-Za-z_$]", item["text"]):
        return "Relevant paths and symbols"
    return "Goal and current state"


def strings(value):
    return isinstance(value, list) and all(isinstance(item, str) for item in value)


def validate(document):
    if not isinstance(document, dict) or document.get("status") not in ("complete", "partial-with-diagnostics"):
        return False
    if document.get("contractProfile") != "pi-0.84.4-runtime":
        return False
    selection = document.get("selection")
    if not isinstance(selection, dict) or set(selection) != {"path", "sessionId", "leafId"}:
        return False
    path, session, leaf = (selection.get(key) for key in ("path", "sessionId", "leafId"))
    if not all(isinstance(value, str) and value for value in (path, session, leaf)) or path.startswith("/") or ".." in path.split("/"):
        return False
    if not strings(document.get("activeEntryIds")) or not strings(document.get("contextEntryIds")):
        return False
    for key in ("totalActiveEntries", "totalContextEntries", "omittedActiveEntryIds", "omittedContextEntryIds"):
        if type(document.get(key)) is not int or document[key] < 0:
            return False
    if document["totalActiveEntries"] != len(document["activeEntryIds"]) + document["omittedActiveEntryIds"]:
        return False
    if document["totalContextEntries"] != len(document["contextEntryIds"]) + document["omittedContextEntryIds"]:
        return False
    if selection["leafId"] not in document["activeEntryIds"]:
        return False
    if not strings(document.get("diagnostics")) or not isinstance(document.get("items"), list):
        return False
    redactions = document.get("redactions")
    if not isinstance(redactions, dict) or any(not isinstance(key, str) or type(count) is not int or count < 0 for key, count in redactions.items()):
        return False
    if type(document.get("omittedItems", 0)) is not int or document.get("omittedItems", 0) < 0:
        return False
    if type(document.get("identityCompactions", 0)) is not int or document.get("identityCompactions", 0) < 0:
        return False
    if "truncated" in document and not isinstance(document["truncated"], bool):
        return False
    for item in document["items"]:
        if not isinstance(item, dict) or item.get("source") not in SOURCES:
            return False
        if not all(isinstance(item.get(key), str) for key in ("entryId", "provenance", "text")):
            return False
        if "role" in item and not isinstance(item["role"], str):
            return False
        if item["provenance"] != f"session:{session}#entry:{item['entryId']}":
            return False
    return True


def choose(items, total_items):
    """Select evidence without ever forwarding the complete selected transcript."""
    limit = min(MAX_ITEMS, len(items), max(0, total_items - 1))
    if not limit:
        return []
    special = [item for item in items if item["source"] != "message (original)"]
    semantic = [item for item in items if classify(item) != "Goal and current state"]
    ordered = []
    for item in ([items[0]] + special + semantic + [items[-1]]):
        if item not in ordered:
            ordered.append(item)
    counts = {section: 0 for section in SECTIONS}
    chosen = []
    for item in ordered:
        section = classify(item)
        if len(chosen) < limit and counts[section] < MAX_PER_SECTION:
            chosen.append(item)
            counts[section] += 1
    return chosen


def json_line(value):
    return json.dumps(value, ensure_ascii=True, separators=(",", ":"), allow_nan=False)


def json_block(label, value):
    return f"{label}\n\n    {json_line(value)}"


def render(document, focus):
    all_items = document["items"]
    candidates = all_items
    if focus:
        needle = focus.casefold()
        candidates = [item for item in all_items if needle in item["text"].casefold()]
    retained = choose(candidates, len(all_items) + document.get("omittedItems", 0))
    grouped = {section: [] for section in SECTIONS}
    for item in retained:
        excerpt = item["text"][:MAX_EXCERPT_CHARS]
        if len(item["text"]) > MAX_EXCERPT_CHARS:
            excerpt += " … [excerpt truncated]"
        grouped[classify(item)].append({
            "entryId": item["entryId"], "provenance": item["provenance"],
            "source": item["source"], "excerpt": excerpt,
        })

    selection = document["selection"]
    prefix = (
        "## Selection\n\n" + json_block("Selection JSON:", selection) + "\n\n"
        "## Reconstruction status\n\n"
        f"- Status: {document['status']}\n"
        f"- Contract profile: {document['contractProfile']}\n"
        f"- Active entry count: {document['totalActiveEntries']}\n"
        f"- Context entry count: {document['totalContextEntries']}"
    )

    # Remove whole evidence rows until the measured final document reaches a fixed point.
    while True:
        section_parts = []
        flattened = []
        for section in SECTIONS:
            rows = grouped[section]
            flattened.extend(rows)
            body = "\n\n".join(json_block("Evidence JSON:", row) for row in rows) or "- None extracted."
            section_parts.append(f"## {section}\n\n{body}")
        omitted = document.get("omittedItems", 0) + len(all_items) - len(flattened)
        disclosure_prefix = (
            "## Disclosure notes\n\n"
            + json_block("Diagnostics JSON:", document["diagnostics"]) + "\n\n"
            f"- Derived summaries used: {sum(row['source'].endswith('(derived)') for row in flattened)}\n"
            f"- Identity compactions: {document.get('identityCompactions', 0)}\n\n"
        )
        disclosure_suffix = (
            f"- Reader truncated: {'yes' if document.get('truncated') else 'no'}\n"
            f"- Omitted active entry IDs: {document.get('omittedActiveEntryIds', 0)}\n"
            f"- Omitted context entry IDs: {document.get('omittedContextEntryIds', 0)}\n"
            f"- Omitted items: {omitted}\n"
            f"- Focus: {'applied (narrowing only)' if focus else 'none'}"
        )
        without_counts = "\n\n".join([prefix] + section_parts + [disclosure_prefix + disclosure_suffix]) + "\n"
        redaction_counts = {}
        for kind in REDACTION.findall(without_counts):
            redaction_counts[kind] = redaction_counts.get(kind, 0) + 1
        disclosure = disclosure_prefix + json_block("Redactions JSON:", redaction_counts) + "\n\n" + disclosure_suffix
        output = "\n\n".join([prefix] + section_parts + [disclosure]) + "\n"
        if len(output.encode("utf-8")) <= MAX_OUTPUT_BYTES:
            return output
        nonempty = [(section, rows) for section, rows in grouped.items() if rows]
        if not nonempty:
            return None
        nonempty[-1][1].pop()


def read_document(args):
    reader = Path(__file__).resolve().parents[2] / "session-reader" / "scripts" / "read_session.py"
    command = [sys.executable, "-B", "-I", str(reader), args.path, "--sessions-root", args.sessions_root, "--leaf", args.leaf, "--mode", "resolve"]
    child_env = {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8"}
    try:
        result = subprocess.run(command, capture_output=True, timeout=30, env=child_env)
    except (OSError, subprocess.TimeoutExpired):
        return None, "reader-invocation-failed"
    if len(result.stdout) > MAX_READER_BYTES:
        return None, "reader-output-overflow"
    try:
        document = json.loads(result.stdout.decode("utf-8"))
    except (UnicodeError, json.JSONDecodeError):
        return None, "invalid-resolved-document"
    if result.returncode != 0:
        status = document.get("status") if isinstance(document, dict) else None
        return None, status if isinstance(status, str) and len(status) <= 128 else "reader-failed"
    return document, None


def main():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--path", required=True)
    parser.add_argument("--sessions-root", required=True)
    parser.add_argument("--leaf", required=True)
    parser.add_argument("--focus")
    try:
        args = parser.parse_args()
    except SystemExit:
        return error("invalid-arguments")
    if args.focus is not None and (not args.focus.strip() or len(args.focus) > MAX_FOCUS_CHARS or any(ord(c) < 32 for c in args.focus)):
        return error("invalid-focus")
    document, failure = read_document(args)
    if failure:
        return error(failure)
    if not validate(document):
        return error("invalid-resolved-document")
    try:
        output = render(document, args.focus.strip() if args.focus else None)
        if output is None:
            return error("pickup-output-overflow")
        sys.stdout.buffer.write(output.encode("utf-8"))
        return 0
    except (UnicodeError, ValueError, TypeError):
        return error("pickup-render-failed")


if __name__ == "__main__":
    raise SystemExit(main())
