#!/usr/bin/env python3
"""Canonical, bounded reader for one explicitly selected Pi session file."""

import argparse
import base64
import hashlib
import json
import math
import re
import sys
sys.dont_write_bytecode = True
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from shared.privacy import redact as shared_redact

MAX_OUTPUT_BYTES = 16 * 1024
MAX_DIAGNOSTIC_LINES = 20
SUPPORTED_STRUCTURAL_TYPES = {"message", "compaction", "branch_summary", "custom_message"}

SECRET_PATTERNS = (
    ("private-key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----", re.S)),
    ("authorization", re.compile(r"(?i)\b(?:bearer|basic)\s+[A-Za-z0-9+/._~=-]{8,}")),
    ("token", re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{8,}|sk-[A-Za-z0-9_-]{8,}|AKIA[A-Z0-9]{12,})\b")),
    ("url-credential", re.compile(r"(?i)\b[a-z][a-z0-9+.-]*://[^\s/@:]*:[^\s/@]+@")),
    ("environment-secret", re.compile(r"(?i)\b(?:[A-Z][A-Z0-9_]*_)?(?:API_KEY|ACCESS_KEY|TOKEN|SECRET|PASSWORD|PASSWD)\s*=\s*(?:\"(?:\\.|[^\"\\])*\"|'[^']*'|(?:\\.|[^\s])+)")),
)
ENV_RECORD = re.compile(r"^[A-Z_][A-Z0-9_]*=.*$", re.I)


class ContractError(Exception):
    pass


class BoundedParser(argparse.ArgumentParser):
    def error(self, _message):
        raise ContractError("invalid-arguments")


def arguments():
    parser = BoundedParser(add_help=False)
    parser.add_argument("session_path")
    parser.add_argument("--sessions-root")
    parser.add_argument("--leaf")
    parser.add_argument("--mode", choices=("resolve", "overview", "conversation", "full", "tools", "costs", "subagents"), default="overview")
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--max-content", type=int, default=2000)
    return parser.parse_args()


def selected_file(raw_path, raw_root):
    if not raw_root:
        raise ContractError("sessions-root-required")
    try:
        root = Path(raw_root).expanduser().resolve(strict=True)
        if not root.is_dir():
            raise ContractError("sessions-root-not-directory")
        candidate = Path(raw_path).expanduser()
        if not candidate.is_absolute():
            candidate = root / candidate
        path = candidate.resolve(strict=True)
        path.relative_to(root)
    except (OSError, ValueError):
        raise ContractError("session-path-outside-root")
    if path.suffix != ".jsonl":
        raise ContractError("session-path-not-jsonl")
    if not path.is_file() or path.is_symlink():
        raise ContractError("session-path-not-regular-file")
    return root, path


def parse_json_integer(raw):
    number = float(raw)
    if math.isfinite(number) and abs(number) <= 9007199254740991:
        return int(raw)
    return number


def parse_file(path):
    entries, malformed = [], []
    for number, raw_line in enumerate(path.read_bytes().split(b"\n"), 1):
        if not raw_line.strip():
            continue
        try:
            value = json.loads(
                raw_line.decode("utf-8"),
                parse_int=parse_json_integer,
                parse_constant=lambda _constant: (_ for _ in ()).throw(ValueError()),
            )
            if not isinstance(value, dict):
                raise ValueError
            entries.append(value)
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
            malformed.append(number)
    return entries, malformed


def validate_and_path(entries, leaf_id):
    if not leaf_id:
        raise ContractError("leaf-required")
    if not entries or entries[0].get("type") != "session" or entries[0].get("version") != 3 or not isinstance(entries[0].get("id"), str) or not entries[0]["id"]:
        raise ContractError("invalid-session-header")
    if any(entry.get("type") == "session" for entry in entries[1:]):
        raise ContractError("invalid-session-header")
    header, by_id = entries[0], {}
    for entry in entries[1:]:
        entry_id = entry.get("id")
        if entry.get("type") not in SUPPORTED_STRUCTURAL_TYPES and not isinstance(entry_id, str):
            continue
        if not isinstance(entry_id, str) or not entry_id:
            raise ContractError("entry-id-required")
        if entry_id in by_id:
            raise ContractError("duplicate-entry-id")
        by_id[entry_id] = entry
    if leaf_id not in by_id:
        raise ContractError("invalid-leaf")
    result, seen, current = [], set(), by_id[leaf_id]
    while current:
        entry_id = current["id"]
        if entry_id in seen:
            raise ContractError("cyclic-parent-chain")
        if "parentId" not in current:
            raise ContractError("missing-parent-id")
        seen.add(entry_id)
        result.append(current)
        parent = current["parentId"]
        if parent is None:
            break
        if not isinstance(parent, str) or parent not in by_id:
            raise ContractError("orphan-parent")
        if parent == entry_id:
            raise ContractError("self-parent")
        current = by_id[parent]
    result.reverse()
    if sum(entry.get("parentId") is None for entry in result) != 1:
        raise ContractError("incomplete-parent-chain")
    return header, result


def context_path(path):
    compactions = [entry for entry in path if entry.get("type") == "compaction"]
    if any("retainedTail" in entry for entry in compactions):
        raise ContractError("unsupported-session-contract")
    if not compactions:
        return path, []
    latest = compactions[-1]
    index = path.index(latest)
    before, found = [], False
    for entry in path[:index]:
        if entry["id"] == latest.get("firstKeptEntryId"):
            found = True
        if found:
            before.append(entry)
    return [latest, *before, *path[index + 1:]], ([] if found else ["missing-first-kept-boundary"])


def finite_number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return 0.0
    try:
        number = float(value)
    except OverflowError:
        return 0.0
    return number if math.isfinite(number) else 0.0


def entry_cost(entry):
    if entry.get("type") in ("compaction", "branch_summary"):
        usage = entry.get("usage", {})
    elif entry.get("type") == "message" and isinstance(entry.get("message"), dict) and entry["message"].get("role") == "assistant":
        usage = entry["message"].get("usage", {})
    else:
        return 0.0
    if not isinstance(usage, dict):
        return 0.0
    cost = usage.get("cost", 0)
    return finite_number(cost.get("total", 0) if isinstance(cost, dict) else cost)


def redact(text, counts):
    return shared_redact(text, counts)


IDENTITY_PREFIX = "identity:"


def display_metadata(value, counts, compactions, private_identities):
    raw = value.encode("utf-8", "surrogatepass")
    local_counts = {}
    projected = redact(value, local_counts)
    if local_counts:
        compactions[0] += 1
        ordinal = private_identities.setdefault(value, len(private_identities) + 1)
        markers = "".join(f"[REDACTED:{name}]" * count for name, count in sorted(local_counts.items()))
        return f"identity:private-{ordinal}{markers}"
    if len(raw) > 256:
        compactions[0] += 1
        return f"identity:public:sha256:{hashlib.sha256(raw).hexdigest()}"
    if value.startswith(IDENTITY_PREFIX):
        escaped = base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
        return f"identity:literal:{escaped}"
    return projected


def normalized_text(entry):
    kind = entry.get("type")
    if kind in ("compaction", "branch_summary"):
        return entry.get("summary", ""), ("compaction-summary (derived)" if kind == "compaction" else "branch-summary (derived)"), kind
    if kind == "custom_message":
        return entry.get("content", ""), "custom-message (original)", "custom"
    if kind != "message" or not isinstance(entry.get("message"), dict):
        return "", "", ""
    message = entry["message"]
    role = message.get("role")
    if role == "bashExecution":
        return f"{message.get('command', '')}\n{message.get('output', '')}".strip("\n"), "message (original)", role
    content = message.get("content") or []
    if role == "toolResult" and message.get("toolName") == "subagent":
        content = "[nested subagent result omitted]"
    return content, "message (original)", role if isinstance(role, str) else "unknown"


def safe_text(entry, counts):
    content, source, role = normalized_text(entry)
    if isinstance(content, str):
        text = content
    elif isinstance(content, list):
        text = "\n".join(item.get("text", "") for item in content if isinstance(item, dict) and item.get("type") == "text")
    else:
        text = ""
    records = re.split(r"[\n\x00]", text)
    if sum(bool(ENV_RECORD.fullmatch(record)) for record in records) >= 2:
        text = "[raw environment dump omitted]"
    return redact(text, counts), source, role


def malformed_diagnostic(lines):
    if not lines:
        return None
    shown = lines[:MAX_DIAGNOSTIC_LINES]
    return f"malformed-records:{len(lines)};lines:{','.join(map(str, shown))};omitted:{len(lines) - len(shown)}"


def resolve(root, path, entries, malformed, leaf, include_cost=False):
    header, active = validate_and_path(entries, leaf)
    context, diagnostics = context_path(active)
    counts, compactions, items, private_identities = {}, [0], [], {}
    session_id = display_metadata(header["id"], counts, compactions, private_identities)
    displayed_ids = {entry["id"]: display_metadata(entry["id"], counts, compactions, private_identities) for entry in active}
    for entry in context:
        text, source, role = safe_text(entry, counts)
        if source and text:
            entry_id = displayed_ids[entry["id"]]
            items.append({"entryId": entry_id, "provenance": f"session:{session_id}#entry:{entry_id}", "source": source, "role": role, "text": text})
    malformed_note = malformed_diagnostic(malformed)
    if malformed_note:
        diagnostics.append(malformed_note)
    displayed_diagnostics = [display_metadata(note, counts, compactions, private_identities) for note in diagnostics]
    document = {
        "status": "partial-with-diagnostics" if diagnostics else "complete",
        "contractProfile": "pi-0.84.4-runtime",
        "selection": {
            "path": display_metadata(path.relative_to(root).as_posix(), counts, compactions, private_identities),
            "sessionId": session_id,
            "leafId": display_metadata(leaf, counts, compactions, private_identities),
        },
        "activeEntryIds": [displayed_ids[entry["id"]] for entry in active],
        "contextEntryIds": [displayed_ids[entry["id"]] for entry in context],
        "totalActiveEntries": len(active),
        "totalContextEntries": len(context),
        "items": items,
        "diagnostics": displayed_diagnostics,
        "redactions": counts,
        "identityCompactions": compactions[0],
    }
    if include_cost:
        total = 0.0
        for entry in active:
            total += entry_cost(entry)
            if not math.isfinite(total):
                raise ContractError("cost-overflow")
        document["cost"] = total
    return document


def marker_counts(document):
    retained = {key: value for key, value in document.items() if key != "redactions"}
    counts = {}
    for kind in re.findall(r"\[REDACTED:([^\]]+)\]", json.dumps(retained, ensure_ascii=True)):
        counts[kind] = counts.get(kind, 0) + 1
    return counts


def bounded_json(document):
    document = dict(document)
    document["items"] = list(document.get("items", []))
    document["activeEntryIds"] = list(document.get("activeEntryIds", []))
    document["contextEntryIds"] = list(document.get("contextEntryIds", []))
    original = {key: len(document[key]) for key in ("items", "activeEntryIds", "contextEntryIds")}
    document.update({"omittedItems": 0, "omittedActiveEntryIds": 0, "omittedContextEntryIds": 0, "truncated": False})
    while True:
        document["redactions"] = marker_counts(document)
        encoded = (json.dumps(document, ensure_ascii=True, sort_keys=True, allow_nan=False) + "\n").encode("utf-8")
        if len(encoded) <= MAX_OUTPUT_BYTES:
            return encoded
        if document["items"]:
            document["items"].pop()
            document["omittedItems"] = original["items"] - len(document["items"])
        elif len(document["contextEntryIds"]) > 1:
            document["contextEntryIds"].pop(0)
            document["omittedContextEntryIds"] = original["contextEntryIds"] - len(document["contextEntryIds"])
        elif len(document["activeEntryIds"]) > 1:
            document["activeEntryIds"].pop(0)
            document["omittedActiveEntryIds"] = original["activeEntryIds"] - len(document["activeEntryIds"])
        else:
            raise ContractError("resolved-document-overflow")
        document["truncated"] = True


def emit_error(code):
    sys.stdout.buffer.write(bounded_json({"status": code, "items": []}))
    return 2


def main():
    try:
        args = arguments()
        root, path = selected_file(args.session_path, args.sessions_root)
        entries, malformed = parse_file(path)
        document = resolve(root, path, entries, malformed, args.leaf, args.mode == "costs")
        if args.mode == "costs":
            document = {"status": document["status"], "cost": document["cost"], "diagnostics": document["diagnostics"]}
        sys.stdout.buffer.write(bounded_json(document))
        return 0
    except ContractError as error:
        return emit_error(str(error))
    except OSError:
        return emit_error("session-io-error")
    except Exception:
        return emit_error("invalid-supported-shape")


if __name__ == "__main__":
    raise SystemExit(main())
