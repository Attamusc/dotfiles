#!/usr/bin/env python3
"""Offline, privacy-safe usage parser for persisted Pi v3 sessions."""

import argparse
import hashlib
import json
import re
import shlex
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

USAGE_FIELDS = ("input", "output", "cacheRead", "cacheWrite", "totalTokens")


def _invalid(code: str, message: str, **details: Any) -> dict:
    return {
        "valid": False,
        "diagnostics": [{"code": code, "message": message, **details}],
    }


def _timestamp_ms(value: object) -> int:
    if not isinstance(value, str):
        raise ValueError("timestamp must be an ISO-8601 string")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return round(parsed.timestamp() * 1000)


def _read_session_entries(path: Path) -> tuple[list[tuple[int, dict]] | None, dict | None]:
    try:
        lines = Path(path).read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        return None, _invalid("session_not_found", "Session file does not exist")
    except OSError as error:
        return None, _invalid("session_unreadable", "Session file could not be read", errorType=type(error).__name__)

    entries = []
    for line_number, line in enumerate(lines, 1):
        if not line.strip():
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            return None, _invalid("malformed_json", "Session contains malformed JSON", line=line_number)
        if not isinstance(entry, dict):
            return None, _invalid("malformed_entry", "Session entry must be an object", line=line_number)
        entries.append((line_number, entry))
    return entries, None


def parse_session_usage(path: Path) -> dict:
    """Return safe identity, conditions, timing, and parent assistant usage."""
    path = Path(path)
    entries, error = _read_session_entries(path)
    if error:
        return error
    assert entries is not None

    if not entries or entries[0][1].get("type") != "session":
        return _invalid("missing_session_header", "First non-empty entry must be a session header")
    header = entries[0][1]
    if header.get("version") != 3:
        return _invalid("unsupported_session_version", "Only persisted Pi v3 sessions are supported", version=header.get("version"))

    tree_entries = entries[1:]
    ids = set()
    children = {}
    previous_id = None
    for line_number, entry in tree_entries:
        entry_id = entry.get("id")
        parent_id = entry.get("parentId")
        if not isinstance(entry_id, str) or entry_id in ids:
            return _invalid("malformed_session_tree", "Entry IDs must be present and unique", line=line_number)
        if parent_id != previous_id:
            return _invalid("ambiguous_session_tree", "Session is not a single linear branch", line=line_number)
        children[parent_id] = children.get(parent_id, 0) + 1
        if children[parent_id] > 1:
            return _invalid("ambiguous_session_tree", "Session contains multiple branches", line=line_number)
        ids.add(entry_id)
        previous_id = entry_id
        if entry.get("type") in ("compaction", "branch_summary"):
            return _invalid("unsupported_session_history", "Compacted or summarized branches are not supported", line=line_number)

    totals = {field: 0 for field in USAGE_FIELDS}
    responses = []
    changes = []
    timestamps = []
    try:
        timestamps.append((header["timestamp"], _timestamp_ms(header["timestamp"])))
        for line_number, entry in tree_entries:
            timestamp = entry.get("timestamp")
            timestamps.append((timestamp, _timestamp_ms(timestamp)))
            if entry.get("type") == "model_change":
                changes.append({"type": "model", "timestamp": timestamp, "provider": entry.get("provider"), "model": entry.get("modelId")})
            elif entry.get("type") == "thinking_level_change":
                changes.append({"type": "thinking", "timestamp": timestamp, "thinking": entry.get("thinkingLevel")})
            elif entry.get("type") == "message":
                message = entry.get("message")
                if not isinstance(message, dict):
                    return _invalid("malformed_message", "Message entry must contain a message object", line=line_number)
                if message.get("role") != "assistant":
                    continue
                if message.get("stopReason") in ("aborted", "error"):
                    return _invalid("aborted_session", "Assistant response did not complete successfully", line=line_number, stopReason=message.get("stopReason"))
                usage = message.get("usage")
                if not isinstance(usage, dict):
                    return _invalid("missing_usage", "Assistant response has no usage object", line=line_number)
                values = {}
                for field in USAGE_FIELDS:
                    value = usage.get(field)
                    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
                        return _invalid("malformed_usage", "Usage fields must be nonnegative integers", line=line_number, field=field)
                    values[field] = value
                    totals[field] += value
                responses.append({
                    "entryId": entry.get("id"),
                    "timestamp": timestamp,
                    "provider": message.get("provider"),
                    "model": message.get("model"),
                    "stopReason": message.get("stopReason"),
                    "usage": values,
                    "requestInputFootprint": values["input"] + values["cacheRead"] + values["cacheWrite"],
                    "outputTokens": values["output"],
                })
    except (KeyError, ValueError):
        return _invalid("malformed_timestamp", "Session contains a missing or invalid timestamp")

    if not responses:
        return _invalid("missing_usage", "Session contains no completed assistant usage records")

    return {
        "valid": True,
        "diagnostics": [],
        "identity": {
            "sourcePath": str(path.resolve()),
            "sessionId": header.get("id"),
            "version": header.get("version"),
            "parentSession": header.get("parentSession"),
        },
        "startedAt": timestamps[0][0],
        "endedAt": timestamps[-1][0],
        "elapsedMs": timestamps[-1][1] - timestamps[0][1],
        "totals": totals,
        "responses": responses,
        "peakRequestInputFootprint": max(response["requestInputFootprint"] for response in responses),
        "conditionChanges": changes,
    }


def parse_strategy_usage(path: Path) -> dict:
    """Parse parent and linked scout sessions without counting nested usage twice.

    The combined total adds assistant usage from each independently parsed session
    exactly once. Tool-result ``usage`` is intentionally ignored: it may describe
    nested work and adding it alongside the child session would double-count it.
    """
    path = Path(path)
    parent = parse_session_usage(path)
    if not parent["valid"]:
        return {"valid": False, "diagnostics": parent["diagnostics"], "parent": parent, "scouts": [], "combined": None, "links": []}
    entries, read_error = _read_session_entries(path)
    if read_error:
        return {"valid": False, "diagnostics": read_error["diagnostics"], "parent": parent, "scouts": [], "combined": None, "links": []}
    assert entries is not None

    calls = {}
    starts = []
    completions = []
    for sequence, (_, entry) in enumerate(entries[1:], 1):
        if entry.get("type") == "message" and isinstance(entry.get("message"), dict):
            message = entry["message"]
            if message.get("role") == "assistant" and isinstance(message.get("content"), list):
                for block in message["content"]:
                    if isinstance(block, dict) and block.get("type") == "toolCall" and block.get("name") == "subagent":
                        calls[block.get("id")] = block.get("arguments")
            elif message.get("role") == "toolResult" and message.get("toolName") == "subagent":
                starts.append((sequence, entry, message, calls.get(message.get("toolCallId"))))
        elif entry.get("type") == "custom_message" and entry.get("customType") == "subagent_result":
            completions.append((sequence, entry))

    links = []
    scouts = []
    seen_paths = set()
    seen_sessions = set()
    for start_sequence, start_entry, start_message, arguments in starts:
        details = start_message.get("details")
        if start_message.get("isError") or not isinstance(details, dict) or details.get("status") != "started" or not isinstance(arguments, dict):
            return _invalid_strategy(parent, scouts, links, "invalid_subagent_start", "Subagent start result is invalid")
        child_value = details.get("sessionFile")
        if not isinstance(child_value, str) or not child_value:
            return _invalid_strategy(parent, scouts, links, "invalid_subagent_start", "Subagent start has no session file")
        child_path = Path(child_value).expanduser().resolve()
        matching = [(sequence, entry) for sequence, entry in completions if isinstance(entry.get("details"), dict) and Path(str(entry["details"].get("sessionFile", ""))).expanduser().resolve() == child_path]
        if not matching:
            same_identity = [entry for _, entry in completions if isinstance(entry.get("details"), dict) and all(entry["details"].get(field) == details.get(field) for field in ("name", "task", "agent"))]
            code = "mismatched_subagent_linkage" if same_identity else "incomplete_subagent"
            return _invalid_strategy(parent, scouts, links, code, "Subagent has no matching completion record")
        if len(matching) != 1:
            return _invalid_strategy(parent, scouts, links, "mismatched_subagent_linkage", "Subagent has multiple completion records")
        completion_sequence, completion_entry = matching[0]
        completion = completion_entry["details"]
        for field in ("name", "task", "agent"):
            if details.get(field) != completion.get(field) or details.get(field) != arguments.get(field):
                return _invalid_strategy(parent, scouts, links, "mismatched_subagent_linkage", "Subagent start and completion metadata differ")
        if (completion.get("exitCode") != 0 or completion.get("sessionFileExists") is False
                or completion.get("error") or completion.get("errorMessage")
                or completion.get("watcherAborted") or completion.get("moduleAborted")):
            return _invalid_strategy(parent, scouts, links, "failed_subagent", "Subagent did not complete successfully")
        if completion_sequence <= start_sequence:
            return _invalid_strategy(parent, scouts, links, "mismatched_subagent_linkage", "Subagent completion precedes its start")
        if child_path in seen_paths:
            continue
        child = parse_session_usage(child_path)
        if not child["valid"]:
            code = "child_session_not_found" if child["diagnostics"][0]["code"] == "session_not_found" else "invalid_child_session"
            return _invalid_strategy(parent, scouts, links, code, "Linked child session is unavailable or invalid", childDiagnostics=child["diagnostics"])
        session_id = child["identity"].get("sessionId")
        if session_id in seen_sessions:
            seen_paths.add(child_path)
            continue
        seen_paths.add(child_path)
        seen_sessions.add(session_id)
        invocation = {field: value for field in ("id", "name", "agent") if (value := details.get(field)) is not None}
        invocation.update({field: value for field in ("model", "tools", "skills", "fork") if (value := arguments.get(field)) is not None})
        links.append({
            "sessionPath": str(child_path),
            "invocation": invocation,
            "start": {"sequence": start_sequence, "entryId": start_entry.get("id"), "timestamp": start_entry.get("timestamp")},
            "completion": {"sequence": completion_sequence, "entryId": completion_entry.get("id"), "timestamp": completion_entry.get("timestamp")},
        })
        scouts.append(child)

    if len(completions) != len(starts):
        return _invalid_strategy(parent, scouts, links, "mismatched_subagent_linkage", "Completion record has no matching start")
    combined = {field: parent["totals"][field] + sum(child["totals"][field] for child in scouts) for field in USAGE_FIELDS}
    return {"valid": True, "diagnostics": [], "parent": parent, "scouts": scouts, "combined": combined, "links": links}


def _invalid_strategy(parent: dict, scouts: list, links: list, code: str, message: str, **details: Any) -> dict:
    invalid = _invalid(code, message, **details)
    return {"valid": False, "diagnostics": invalid["diagnostics"], "parent": parent, "scouts": scouts, "combined": None, "links": links}


def _model_input_hash(manifest: dict, task: dict, strategy: str, root: Path) -> str:
    definition = (root / task["definition"]).read_text(encoding="utf-8")
    shared = definition.split("## Model prompt (use verbatim)\n", 1)[1].rstrip("\n")
    value = shared + "\n\n" + manifest["routingInstructions"][strategy]
    return hashlib.sha256(value.encode()).hexdigest()


def _expected_read_result(path: Path, arguments: dict, details: object) -> tuple[str, tuple[int, int]]:
    lines = path.read_text(encoding="utf-8").split("\n")
    start = max(1, arguments.get("offset", 1))
    if start > len(lines):
        raise ValueError("read offset outside file")
    limit = arguments.get("limit")
    end_index = min(start - 1 + limit, len(lines)) if isinstance(limit, int) else len(lines)
    selected = "\n".join(lines[start - 1:end_index])
    counted = selected.split("\n")
    if selected.endswith("\n"): counted.pop()
    output, byte_count = [], 0
    for line in counted[:2000]:
        size = len(line.encode()) + (1 if output else 0)
        if byte_count + size > 50 * 1024: break
        output.append(line); byte_count += size
    truncated = len(output) < len(counted) or len(selected.encode()) > 50 * 1024
    if truncated:
        truncation = details.get("truncation") if isinstance(details, dict) else None
        by = "lines" if len(output) >= 2000 and byte_count <= 50 * 1024 else "bytes"
        expected_details = {"truncated": True, "truncatedBy": by, "totalLines": len(counted), "totalBytes": len(selected.encode()),
            "outputLines": len(output), "outputBytes": len("\n".join(output).encode()), "lastLinePartial": False,
            "firstLineExceedsLimit": bool(counted and len(counted[0].encode()) > 50 * 1024), "maxLines": 2000, "maxBytes": 50 * 1024}
        flags = {key: truncation.get(key) for key in expected_details} if isinstance(truncation, dict) else None
        if flags != expected_details or expected_details["firstLineExceedsLimit"]:
            raise ValueError("read truncation metadata mismatch or unsupported first line")
        shown_end = start + len(output) - 1
        suffix = f"[Showing lines {start}-{shown_end} of {len(lines)}"
        if by == "bytes": suffix += " (50.0KB limit)"
        selected = "\n".join(output) + f"\n\n{suffix}. Use offset={shown_end + 1} to continue.]"
        end_index = shown_end
    elif isinstance(details, dict) and details.get("truncation"):
        raise ValueError("unexpected truncation metadata")
    elif isinstance(limit, int) and end_index < len(lines):
        selected += f"\n\n[{len(lines) - end_index} more lines in file. Use offset={end_index + 1} to continue.]"
    return selected, (start, end_index)


def _canonical_corpus_path(value: object, cwd: Path, allowed_files: dict[str, Path]) -> str | None:
    if not isinstance(value, str):
        return None
    candidate = Path(value).expanduser()
    candidate = candidate if candidate.is_absolute() else cwd / candidate
    try:
        resolved = candidate.resolve(strict=True)
    except OSError:
        return None
    return next((key for key, source in allowed_files.items() if not source.is_symlink() and resolved == source.resolve(strict=True)), None)


def _text_user_content(content: object) -> tuple[str | None, bool]:
    if isinstance(content, str):
        return content, True
    if not isinstance(content, list):
        return None, False
    texts = []
    for block in content:
        if not isinstance(block, dict) or block.get("type") != "text" or not isinstance(block.get("text"), str):
            return None, False
        texts.append(block["text"])
    return "".join(texts), True


def _session_contract(path: Path, allowed_files: dict[str, Path] | None = None) -> dict:
    """Extract hashes and verified tool evidence without retaining session prose."""
    entries, error = _read_session_entries(path)
    if error:
        return error
    assert entries is not None
    prompts, prompt_texts, tools, results, final_citations = [], [], [], {}, []
    invalid_user_content = False
    cwd = Path(entries[0][1].get("cwd", ""))
    final_sequence = final_timestamp = None
    for sequence, (_, entry) in enumerate(entries[1:], 1):
        if entry.get("type") != "message" or not isinstance(entry.get("message"), dict):
            continue
        message = entry["message"]
        if message.get("role") == "user":
            content, valid_text = _text_user_content(message.get("content"))
            invalid_user_content |= not valid_text
            if content is not None:
                prompts.append(hashlib.sha256(content.encode()).hexdigest())
                prompt_texts.append(content)
        if message.get("role") == "assistant" and isinstance(message.get("content"), list):
            has_tool = False
            texts = []
            for block in message["content"]:
                if isinstance(block, dict) and block.get("type") == "toolCall":
                    has_tool = True
                    tools.append({"sequence": sequence, "id": block.get("id"), "name": block.get("name"), "arguments": block.get("arguments")})
                elif isinstance(block, dict) and block.get("type") == "text" and isinstance(block.get("text"), str):
                    texts.append(block["text"])
            if not has_tool and message.get("stopReason") not in ("aborted", "error"):
                final_sequence, final_timestamp = sequence, entry.get("timestamp")
                final_citations = [{"path": _canonical_corpus_path(match.group(1), cwd, allowed_files or {}), "startLine": int(match.group(2)), "endLine": int(match.group(3))}
                    for text in texts for match in re.finditer(r"([A-Za-z0-9_./-]+):(\d+)-(\d+)", text)]
        if message.get("role") == "toolResult":
            details = message.get("details")
            actual_range = None
            call = next((tool for tool in tools if tool.get("id") == message.get("toolCallId")), None)
            output_matches = False
            canonical_path = None
            if message.get("toolName") == "read" and call and isinstance(call.get("arguments"), dict) and not message.get("isError") and allowed_files is not None:
                arguments = call["arguments"]
                canonical_path = _canonical_corpus_path(arguments.get("path"), cwd, allowed_files)
                source = allowed_files.get(canonical_path)
                text = next((block.get("text") for block in message.get("content", []) if isinstance(block, dict) and isinstance(block.get("text"), str)), None)
                try:
                    expected_text, actual_range = _expected_read_result(source, arguments, details) if source else (None, None)
                    output_matches = text == expected_text
                except (OSError, TypeError, ValueError):
                    actual_range = None
            results[message.get("toolCallId")] = {"sequence": sequence, "toolName": message.get("toolName"), "isError": message.get("isError"), "actualRange": actual_range, "outputMatches": output_matches,
                "canonicalPath": canonical_path}
    return {"valid": not invalid_user_content, "promptHashes": prompts, "promptTexts": prompt_texts, "tools": tools, "results": results,
            "finalCitations": final_citations, "finalSequence": final_sequence, "finalTimestamp": final_timestamp,
            "headerTimestamp": entries[0][1].get("timestamp"), "cwd": str(cwd)}


def _bash_is_scoped(command: object, cwd: Path, allowed_files: dict[str, Path]) -> bool:
    if not isinstance(command, str) or re.search(r"[\r\n|;&><`$()]", command):
        return False
    try:
        words = shlex.split(command)
    except ValueError:
        return False
    if not words or words[0] not in ("rg", "grep", "wc", "sha256sum"):
        return False
    tool, arguments = words[0], words[1:]
    short_flags = {"rg": set("nliFw"), "grep": set("nliFEw"), "wc": {"l"}, "sha256sum": set()}[tool]
    long_flags = {
        "rg": {"--line-number", "--files-with-matches", "--ignore-case", "--fixed-strings", "--word-regexp", "--no-config"},
        "grep": {"--line-number", "--files-with-matches", "--ignore-case", "--fixed-strings", "--extended-regexp", "--word-regexp"},
        "wc": {"--lines"},
        "sha256sum": set(),
    }[tool]
    index = 0
    while index < len(arguments) and arguments[index].startswith("-"):
        option = arguments[index]
        if option == "--":
            index += 1
            break
        if option.startswith("--"):
            if option not in long_flags:
                return False
        elif len(option) < 2 or not set(option[1:]) <= short_flags:
            return False
        index += 1
    operands = arguments[index:]
    if tool in ("rg", "grep"):
        if len(operands) < 2:
            return False
        operands = operands[1:]
    return bool(operands) and all(_canonical_corpus_path(word, cwd, allowed_files) is not None for word in operands)


def _ranges_cover(intervals: list[tuple[int, int]], start: int, end: int) -> bool:
    cursor = start
    for left, right in sorted(intervals):
        if left > cursor:
            break
        if right >= cursor:
            cursor = right + 1
        if cursor > end:
            return True
    return False


def validate_run_record(manifest: dict, record: dict, manifest_dir: Path) -> dict:
    reasons = []
    task = next((item for item in manifest.get("tasks", []) if item.get("id") == record.get("taskId")), None)
    strategy = record.get("strategy")
    if not task or strategy not in ("direct", "scout-first"):
        return {"valid": False, "invalidReasons": ["unknown task or strategy"], "usage": {"parent": None, "scouts": [], "combined": None}}
    expected = manifest["conditions"]
    rule = expected["strategies"][strategy]
    observed = record.get("observedConditions", {})
    for field in ("parentProvider", "parentModel", "parentThinking"):
        if observed.get(field) != expected.get(field): reasons.append(f"{field} mismatch")
    if observed.get("parentTools") != rule.get("parentTools"): reasons.append("parent tool condition mismatch")
    expected_position = task["pairOrder"].index(strategy) + 1
    if record.get("pairPosition") != expected_position: reasons.append("pair position mismatch")
    if record.get("status") != "complete": reasons.append("run is not complete")
    sessions = record.get("scoutSessions")
    count = len(sessions) if isinstance(sessions, list) else -1
    children = rule["children"]
    if count < children["required"] or count > children["maximum"] or (isinstance(sessions, list) and len(set(sessions)) != len(sessions)):
        reasons.append("child session count mismatch")
    child_observed = observed.get("child", {})
    if strategy == "direct":
        if any(child_observed.get(x) is not None for x in ("agent", "provider", "model", "thinking")) or child_observed.get("tools") != []:
            reasons.append("direct child condition mismatch")
    else:
        for field in ("agent", "provider", "model", "thinking", "tools"):
            if child_observed.get(field) != children.get(field): reasons.append(f"child {field} mismatch")
    try:
        expected_hash = _model_input_hash(manifest, task, strategy, Path(manifest_dir))
    except (OSError, KeyError, IndexError):
        reasons.append("prompt source unavailable")
        expected_hash = None
    if observed.get("promptSha256") != expected_hash: reasons.append("prompt hash mismatch")
    if observed.get("corpus") != task.get("corpus"): reasons.append("corpus metadata mismatch")
    allowed_files = {item["path"]: (Path(manifest_dir) / item["path"]).resolve() for item in task.get("corpus", [])}
    for item in task.get("corpus", []):
        try:
            actual = hashlib.sha256(allowed_files[item["path"]].read_bytes()).hexdigest()
        except OSError:
            actual = None
        if actual != item.get("sha256"): reasons.append(f"corpus hash mismatch: {item.get('path')}")

    parent_path = Path(record.get("parentSession", ""))
    usage = parse_strategy_usage(parent_path)
    contract = _session_contract(parent_path, allowed_files)
    if not usage.get("valid") or not contract.get("valid"):
        reasons.append("parent or linked session invalid")
    else:
        if len(contract["promptHashes"]) != 1 or contract["promptHashes"][0] != expected_hash: reasons.append("source prompt mismatch")
        actual_names = [tool["name"] for tool in contract["tools"]]
        if any(name not in rule["parentTools"] for name in actual_names): reasons.append("actual parent tool mismatch")
        for tool in contract["tools"]:
            arguments = tool.get("arguments") if isinstance(tool.get("arguments"), dict) else {}
            if tool["name"] == "read":
                result = contract["results"].get(tool.get("id"))
                if not result or result.get("canonicalPath") is None: reasons.append("parent read outside corpus")
                if not result or not result.get("outputMatches"): reasons.append("parent read result does not match frozen corpus")
            if tool["name"] == "bash" and not _bash_is_scoped(arguments.get("command"), Path(contract["cwd"]), allowed_files): reasons.append("unverifiable parent bash scope")
        if actual_names.count("subagent") != children["required"]: reasons.append("actual child invocation count mismatch")
        linked = [item["identity"]["sourcePath"] for item in usage["scouts"]]
        declared = [str(Path(value).resolve()) for value in sessions] if isinstance(sessions, list) else []
        if linked != declared: reasons.append("declared child linkage mismatch")
        if strategy == "scout-first" and usage.get("links"):
            invocation = usage["links"][0]["invocation"]
            invocation_tools = invocation.get("tools")
            if isinstance(invocation_tools, str): invocation_tools = invocation_tools.split(",")
            expected_invocation_model = f"{children['provider']}/{children['model']}"
            if invocation.get("agent") != children.get("agent") or invocation.get("model") != expected_invocation_model or invocation_tools != children.get("tools"):
                reasons.append("actual child invocation condition mismatch")
        if not parent_path.is_absolute() or usage["parent"]["identity"].get("parentSession") is not None: reasons.append("parent session is not fresh persisted root")
        response_conditions = {(x["provider"], x["model"]) for x in usage["parent"]["responses"]}
        if response_conditions != {(expected["parentProvider"], expected["parentModel"])}: reasons.append("actual parent model mismatch")
        parent_thinking = [change["thinking"] for change in usage["parent"]["conditionChanges"] if change["type"] == "thinking"]
        if parent_thinking != [expected["parentThinking"]]: reasons.append("actual parent thinking mismatch")
        subagent_call = next((tool for tool in contract["tools"] if tool["name"] == "subagent"), None)
        invocation_task = subagent_call.get("arguments", {}).get("task") if subagent_call else None
        for scout in usage["scouts"]:
            child_contract = _session_contract(Path(scout["identity"]["sourcePath"]), allowed_files)
            if not child_contract.get("valid") or len(child_contract.get("promptTexts", [])) != 1 or not isinstance(invocation_task, str) or invocation_task not in child_contract["promptTexts"][0]: reasons.append("child task binding mismatch")
            for tool in child_contract.get("tools", []):
                arguments = tool.get("arguments") if isinstance(tool.get("arguments"), dict) else {}
                if tool["name"] not in children.get("tools", []): reasons.append("actual child tool mismatch")
                if tool["name"] == "read":
                    result = child_contract["results"].get(tool.get("id"))
                    if not result or result.get("canonicalPath") is None: reasons.append("child read outside corpus")
                    if not result or not result.get("outputMatches"): reasons.append("child read result does not match frozen corpus")
                if tool["name"] == "bash" and not _bash_is_scoped(arguments.get("command"), Path(child_contract["cwd"]), allowed_files): reasons.append("unverifiable child bash scope")
            response_conditions = {(x["provider"], x["model"]) for x in scout["responses"]}
            if response_conditions != {(children.get("provider"), children.get("model"))}: reasons.append("actual child model mismatch")
            child_thinking = [change["thinking"] for change in scout["conditionChanges"] if change["type"] == "thinking"]
            if child_thinking != [children.get("thinking")]: reasons.append("actual child thinking mismatch")

    if not isinstance(record.get("latencyMs"), int) or isinstance(record.get("latencyMs"), bool) or record.get("latencyMs", -1) < 0: reasons.append("invalid latency")
    follow_up = record.get("followUp", {})
    if any(not isinstance(follow_up.get(field), int) or isinstance(follow_up.get(field), bool) or follow_up.get(field, -1) < 0 for field in ("parentReadCallsAfterScout", "parentBashCallsAfterScout")): reasons.append("invalid follow-up counts")
    verification = record.get("parentVerification", {})
    if contract.get("valid"):
        actual_child_sequence = usage["links"][0]["completion"]["sequence"] if usage.get("links") else None
        if verification.get("childCompletedSequence") != actual_child_sequence: reasons.append("child completion sequence mismatch")
        if verification.get("finalAnswerSequence") != contract.get("finalSequence"): reasons.append("final answer sequence mismatch")
        if any(tool["sequence"] > contract.get("finalSequence", -1) for tool in contract["tools"]): reasons.append("tool call occurs after final answer")
        if record.get("startedAt") != contract.get("headerTimestamp") or record.get("endedAt") != contract.get("finalTimestamp"): reasons.append("run timestamps mismatch")
        try:
            actual_latency = _timestamp_ms(contract["finalTimestamp"]) - _timestamp_ms(contract["headerTimestamp"])
        except (TypeError, ValueError):
            actual_latency = None
        if record.get("latencyMs") != actual_latency: reasons.append("latency mismatch")
        if actual_child_sequence is None:
            actual_follow = {"parentReadCallsAfterScout": 0, "parentBashCallsAfterScout": 0}
        else:
            bounded = [tool for tool in contract["tools"] if actual_child_sequence < tool["sequence"] < contract["finalSequence"]]
            actual_follow = {"parentReadCallsAfterScout": sum(tool["name"] == "read" for tool in bounded), "parentBashCallsAfterScout": sum(tool["name"] == "bash" for tool in bounded)}
        if follow_up != actual_follow: reasons.append("follow-up counts mismatch")
    correctness = record.get("correctness", {})
    fact_rows = correctness.get("facts", [])
    expected_ids = [fact["id"] for fact in task.get("rubric", {}).get("requiredFacts", [])]
    if [row.get("factId") for row in fact_rows] != expected_ids: reasons.append("correctness facts mismatch")
    corpus_paths = {item["path"] for item in task.get("corpus", [])}
    structural_correct = not correctness.get("contradictions")
    for row in fact_rows:
        if row.get("factScore") not in (0, 1) or row.get("citationScore") not in (0, 1) or not row.get("reviewerNote"):
            reasons.append("malformed correctness score"); structural_correct = False
        structural_correct &= row.get("factScore") == 1 and row.get("citationScore") == 1
        for citation in row.get("acceptedCitations", []):
            if citation.get("path") not in corpus_paths or not isinstance(citation.get("startLine"), int) or not isinstance(citation.get("endLine"), int) or citation["startLine"] < 1 or citation["endLine"] < citation["startLine"]:
                reasons.append("citation outside corpus range"); structural_correct = False
    if correctness.get("correct") is not bool(structural_correct): reasons.append("correctness total contradicts scores")

    if task["id"] == "exact-integration-contract" and strategy == "scout-first" and contract.get("valid"):
        child_sequence = usage["links"][0]["completion"]["sequence"] if usage.get("links") else None
        final_sequence = contract.get("finalSequence")
        reads = {item.get("toolCallId"): item for item in verification.get("parentReads", [])}
        for read_id, read in reads.items():
            result = contract["results"].get(read_id)
            details = result.get("details") if result else None
            call = next((tool for tool in contract["tools"] if tool.get("id") == read_id and tool.get("name") == "read"), None)
            arguments = call.get("arguments") if call else None
            if (not result or result.get("toolName") != "read" or result.get("isError") or not result.get("outputMatches") or not isinstance(arguments, dict)
                    or result.get("canonicalPath") != read.get("path")
                    or result.get("actualRange") != (read.get("startLine"), read.get("endLine"))
                    or result.get("sequence") != read.get("completedSequence")):
                reasons.append("parent read evidence mismatch")
        mappings = verification.get("factRangeMappings", [])
        accepted = [(row["factId"], citation) for row in fact_rows for citation in row.get("acceptedCitations", [])]
        accepted_citations = [citation for _, citation in accepted]
        # Fact grouping need not preserve prose order or repeated occurrences.
        final_ranges = {json.dumps(citation, sort_keys=True) for citation in contract.get("finalCitations", [])}
        scored_ranges = {json.dumps(citation, sort_keys=True) for citation in accepted_citations}
        if final_ranges != scored_ranges:
            reasons.append("final answer citations differ from scored citations")
        for fact_id, citation in accepted:
            mapping = next((m for m in mappings if m.get("factId") == fact_id and m.get("citation") == citation), None)
            intervals = []
            if mapping:
                for read_id in mapping.get("parentReadToolCallIds", []):
                    read = reads.get(read_id)
                    if read and read.get("path") == citation.get("path") and isinstance(child_sequence, int) and isinstance(final_sequence, int) and child_sequence < read.get("completedSequence", -1) < final_sequence:
                        intervals.append((read["startLine"], read["endLine"]))
            if not _ranges_cover(intervals, citation["startLine"], citation["endLine"]): reasons.append("final citation lacks post-child parent read coverage")

    parent_totals = usage.get("parent", {}).get("totals") if usage.get("parent") else None
    result_usage = {"parent": parent_totals, "scouts": [x["totals"] for x in usage.get("scouts", [])], "combined": usage.get("combined")}
    return {"valid": not reasons, "invalidReasons": list(dict.fromkeys(reasons)), "usage": result_usage,
            "peakParentInputFootprint": usage.get("parent", {}).get("peakRequestInputFootprint") if usage.get("parent") else None,
            "latencyMs": record.get("latencyMs"), "followUp": record.get("followUp"), "correct": correctness.get("correct"),
            "quotaReferences": record.get("quotaReferences"), "concurrency": record.get("concurrency"), "pairPosition": record.get("pairPosition")}


def summarize_records(manifest: dict, records: list[dict], manifest_dir: Path) -> dict:
    pairs = []
    for task in manifest.get("tasks", []):
        runs = []
        for strategy in task["pairOrder"]:
            matches = [record for record in records if record.get("taskId") == task["id"] and record.get("strategy") == strategy]
            if len(matches) != 1:
                runs.append({"strategy": strategy, "valid": False, "invalidReasons": ["missing or duplicate run"], "efficiencyWin": False})
                continue
            validated = validate_run_record(manifest, matches[0], manifest_dir)
            validated["strategy"] = strategy
            validated["efficiencyWin"] = False
            runs.append(validated)
        if len(runs) == 2 and all(run.get("valid") for run in runs):
            direct = next(run for run in runs if run["strategy"] == "direct")
            scout = next(run for run in runs if run["strategy"] == "scout-first")
            scout["efficiencyWin"] = bool(scout.get("correct") and direct.get("correct") and scout["usage"]["combined"]["totalTokens"] < direct["usage"]["combined"]["totalTokens"])
        pairs.append({"taskId": task["id"], "pairOrder": task["pairOrder"], "runs": runs})
    complete = len(records) == len(manifest.get("tasks", [])) * 2 and all(run.get("valid") for pair in pairs for run in pair["runs"])
    return {"schemaVersion": 1, "pairs": pairs, "aggregates": {"validPairCount": sum(all(r.get("valid") for r in p["runs"]) for p in pairs), "efficiencyWinCount": sum(any(r.get("efficiencyWin") for r in p["runs"]) for p in pairs)}, "recommendation": "Provisional: actual complete runs require operator review." if complete else "Provisional: incomplete or invalid run set; no efficiency recommendation."}


def render_markdown(summary: dict) -> str:
    lines = ["# Context-efficiency pilot report", "", "Pi-reported token telemetry is not subscription billing. Quota observations are account-wide context.", ""]
    for pair in summary["pairs"]:
        lines += [f"## Pair: {pair['taskId']}", f"Order: {' → '.join(pair['pairOrder'])}", ""]
        for run in pair["runs"]:
            lines += [f"### {run['strategy']}", "```json", json.dumps(run, indent=2, sort_keys=True), "```", ""]
    lines += ["## Aggregates", "```json", json.dumps(summary["aggregates"], indent=2, sort_keys=True), "```", "", "## Recommendation", summary["recommendation"], ""]
    return "\n".join(lines)


def _load_records(paths: list[Path]) -> list[dict]:
    records = []
    for path in paths:
        value = json.loads(path.read_text(encoding="utf-8"))
        records.extend(value if isinstance(value, list) else [value])
    return records


def main() -> None:
    if len(sys.argv) == 2 and sys.argv[1] not in ("parse", "validate", "report", "-h", "--help"):
        print(json.dumps(parse_strategy_usage(Path(sys.argv[1])), sort_keys=True, separators=(",", ":")))
        return
    parser = argparse.ArgumentParser(description="Parse, validate, and report context-efficiency pilot sessions")
    subparsers = parser.add_subparsers(dest="command")
    parse_cmd = subparsers.add_parser("parse")
    parse_cmd.add_argument("session", type=Path)
    for name in ("validate", "report"):
        command = subparsers.add_parser(name)
        command.add_argument("--manifest", type=Path, default=Path("research/context-efficiency/manifest.json"))
        command.add_argument("--records", type=Path, nargs="+", required=True)
        command.add_argument("--output-json", type=Path)
        if name == "report": command.add_argument("--output-markdown", type=Path, default=Path("research/context-efficiency/report.md"))
    args = parser.parse_args()
    if args.command in (None, "parse"):
        session = args.session if args.command == "parse" else None
        if session is None: parser.error("choose parse, validate, or report")
        output = parse_strategy_usage(session)
    else:
        manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
        output = summarize_records(manifest, _load_records(args.records), args.manifest.parent)
        if args.command == "report":
            args.output_markdown.parent.mkdir(parents=True, exist_ok=True)
            args.output_markdown.write_text(render_markdown(output), encoding="utf-8")
    text = json.dumps(output, indent=2, sort_keys=True)
    if getattr(args, "output_json", None):
        args.output_json.parent.mkdir(parents=True, exist_ok=True); args.output_json.write_text(text + "\n", encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
