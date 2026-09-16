#!/usr/bin/env python3
"""Read-only exact-byte promotion handshake; durable mutation belongs to owner skills."""
import argparse
import base64
import binascii
import hashlib
import json
import os
import re
import stat
import sys
sys.dont_write_bytecode = True
from contextlib import contextmanager
from pathlib import Path, PurePosixPath

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from shared.privacy import contains_private_text

MAX_BYTES = 16 * 1024
NOTE_PATHS = {"decision": ".notes/decisions.md", "pattern": ".notes/patterns.md", "gotcha": ".notes/gotchas.md", "context": ".notes/context.md"}
PROPOSAL_KEYS = {"status", "destination", "owner", "destinationKind", "operation", "payload", "provenance", "limits", "semantic"}
LIMIT_KEYS = {"tainted", "redactions", "truncated", "omissionsUnfit"}
ROOT_IDENTITY_KEYS = {"device", "inode"}
TUPLE_KEYS = {"rootIdentity", "destination", "owner", "destinationKind", "operation", "baseSha256", "contentBytes", "contentSha256", "expectedResultSha256", "provenance", "limits", "semantic", "proposalSha256"}
APPROVAL_KEYS = {"decision", "proposalSha256", "rootIdentity", "destination", "owner", "destinationKind", "operation", "baseSha256", "contentSha256", "expectedResultSha256"}
HASH = re.compile(r"^[0-9a-f]{64}$")
CITATION = re.compile(r"^session:[A-Za-z0-9._:-]{1,128}#entry:[A-Za-z0-9._:-]{1,128}$")

class Rejected(Exception): pass

class BoundedParser(argparse.ArgumentParser):
    def error(self, _message):
        raise Rejected("invalid-arguments")

def digest(data): return hashlib.sha256(data).hexdigest()
def canonical(value): return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")
def exact_keys(value, keys, reason="invalid-input"):
    if not isinstance(value, dict) or set(value) != keys: raise Rejected(reason)
def clean_string(value):
    if not isinstance(value, str) or contains_private_text(value) or any(ord(char) < 32 and char not in "\n\t" for char in value): raise Rejected("unsafe-content")
def fail(reason):
    print(json.dumps({"state": reason if isinstance(reason, str) and re.fullmatch(r"[a-z-]{1,48}", reason) else "invalid-input"}, separators=(",", ":")))
    return 2

def strict_object(raw):
    def pairs(items):
        value = {}
        for key, item in items:
            if key in value: raise Rejected("duplicate-key")
            value[key] = item
        return value
    try:
        text = raw.decode("utf-8", "strict")
        value = json.loads(text, object_pairs_hook=pairs, parse_constant=lambda _x: (_ for _ in ()).throw(Rejected("nonfinite-number")))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise Rejected("invalid-input")
    if not isinstance(value, dict): raise Rejected("invalid-input")
    return value

def path_parts(relative):
    clean_string(relative)
    if not relative or "\\" in relative: raise Rejected("invalid-destination")
    pure = PurePosixPath(relative)
    if pure.is_absolute() or any(part in ("", ".", "..") for part in pure.parts): raise Rejected("invalid-destination")
    return pure.parts

def root_identity(root_fd):
    metadata = os.fstat(root_fd)
    return {"device": metadata.st_dev, "inode": metadata.st_ino}

def validate_root_identity(value):
    exact_keys(value, ROOT_IDENTITY_KEYS, "invalid-root-identity")
    if any(type(value[key]) is not int or value[key] < 0 for key in ROOT_IDENTITY_KEYS): raise Rejected("invalid-root-identity")

@contextmanager
def destination_handle(root_fd, relative):
    parts = path_parts(relative)
    descriptors = []
    try:
        current = os.dup(root_fd)
        descriptors.append(current)
        for part in parts[:-1]:
            try: current = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=current)
            except FileNotFoundError:
                yield None, parts[-1]
                return
            descriptors.append(current)
        yield current, parts[-1]
    except OSError as error:
        raise Rejected("invalid-destination") from error
    finally:
        for descriptor in reversed(descriptors): os.close(descriptor)

def read_at(parent_fd, name):
    if parent_fd is None: return None
    try: descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent_fd)
    except FileNotFoundError: return None
    except OSError as error: raise Rejected("invalid-destination") from error
    try:
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1: raise Rejected("invalid-destination")
        chunks, total = [], 0
        while True:
            chunk = os.read(descriptor, 65536)
            if not chunk: break
            total += len(chunk)
            if total > 8 * 1024 * 1024: raise Rejected("destination-too-large")
            chunks.append(chunk)
        return b"".join(chunks)
    finally: os.close(descriptor)

def validate_common(destination, owner, kind, operation, semantic, payload, root_fd=None):
    clean_string(destination); clean_string(owner); clean_string(kind); clean_string(operation)
    if kind in NOTE_PATHS:
        exact_keys(semantic, set(), "invalid-semantic")
        lines = payload.rstrip("\n").splitlines()
        if owner != "notekeeper" or destination != NOTE_PATHS[kind] or operation != "append": raise Rejected("wrong-owner-kind-operation")
        if not lines or not re.fullmatch(r"## Date: \d{4}-\d{2}-\d{2}", lines[0]) or not 2 <= len(lines) <= 6: raise Rejected("invalid-note-entry")
    elif kind == "glossary":
        exact_keys(semantic, {"glossaryOnly"}, "invalid-semantic")
        if owner != "domain-modeling" or destination != "CONTEXT.md" or operation not in ("append", "create") or semantic["glossaryOnly"] is not True: raise Rejected("invalid-glossary")
    elif kind == "adr":
        exact_keys(semantic, {"hardToReverse", "surprising", "tradeOff", "nextAdrNumber"}, "invalid-semantic")
        if any(semantic[key] is not True for key in ("hardToReverse", "surprising", "tradeOff")) or type(semantic["nextAdrNumber"]) is not int: raise Rejected("invalid-adr")
        match = re.fullmatch(r"docs/adr/(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md", destination)
        if owner != "domain-modeling" or operation != "create" or not match or int(match.group(1)) != semantic["nextAdrNumber"]: raise Rejected("invalid-adr")
        if root_fd is not None:
            try:
                docs = os.open("docs", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=root_fd)
                try: adr = os.open("adr", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=docs)
                finally: os.close(docs)
            except FileNotFoundError: existing = []
            except OSError as error: raise Rejected("invalid-adr-number") from error
            else:
                try: existing = [int(m.group(1)) for name in os.listdir(adr) if (m := re.fullmatch(r"(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md", name)) and stat.S_ISREG(os.stat(name, dir_fd=adr, follow_symlinks=False).st_mode)]
                finally: os.close(adr)
                if int(match.group(1)) != max(existing, default=0) + 1: raise Rejected("invalid-adr-number")
    else: raise Rejected("invalid-destination-kind")

def validate_limits(value):
    exact_keys(value, LIMIT_KEYS, "tainted-or-unfit")
    if value["tainted"] is not False or type(value["redactions"]) is not int or value["redactions"] != 0 or value["truncated"] is not False or value["omissionsUnfit"] is not False: raise Rejected("tainted-or-unfit")

def validate_provenance(value):
    if not isinstance(value, list) or not 1 <= len(value) <= 8: raise Rejected("invalid-provenance")
    for citation in value:
        clean_string(citation)
        if len(citation.encode("utf-8")) > 256 or not CITATION.fullmatch(citation): raise Rejected("invalid-provenance")

def decode64(value):
    if not isinstance(value, str): raise Rejected("invalid-tuple")
    try: decoded = base64.b64decode(value, validate=True)
    except (ValueError, binascii.Error): raise Rejected("invalid-tuple")
    if base64.b64encode(decoded).decode("ascii") != value: raise Rejected("invalid-tuple")
    try: decoded.decode("utf-8", "strict")
    except UnicodeDecodeError: raise Rejected("invalid-tuple")
    return decoded

def prepare(root, proposal):
    exact_keys(proposal, PROPOSAL_KEYS)
    if proposal["status"] != "complete": raise Rejected("incomplete-proposal")
    validate_limits(proposal["limits"]); validate_provenance(proposal["provenance"])
    payload = proposal["payload"]; clean_string(payload)
    if not payload: raise Rejected("unsafe-payload")
    payload_bytes = payload.encode("utf-8", "strict")
    if len(payload_bytes) > 8192: raise Rejected("payload-too-large")
    root_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        identity = root_identity(root_fd)
        validate_common(proposal["destination"], proposal["owner"], proposal["destinationKind"], proposal["operation"], proposal["semantic"], payload, root_fd)
        with destination_handle(root_fd, proposal["destination"]) as (parent, name): base = read_at(parent, name)
    finally: os.close(root_fd)
    if proposal["operation"] == "create" and base is not None: raise Rejected("destination-exists")
    if proposal["operation"] == "append" and base is None and proposal["owner"] == "domain-modeling": raise Rejected("append-requires-base")
    expected = payload_bytes if base is None else base + payload_bytes
    value = {"rootIdentity":identity,"destination":proposal["destination"],"owner":proposal["owner"],"destinationKind":proposal["destinationKind"],"operation":proposal["operation"],"baseSha256":"absent" if base is None else digest(base),"contentBytes":base64.b64encode(payload_bytes).decode(),"contentSha256":digest(payload_bytes),"expectedResultSha256":digest(expected),"provenance":proposal["provenance"],"limits":proposal["limits"],"semantic":proposal["semantic"]}
    value["proposalSha256"] = digest(canonical(value))
    return {"state":"shown","tuple":value}

def validate_tuple(value, root_fd=None):
    exact_keys(value, TUPLE_KEYS, "invalid-tuple")
    supplied = value["proposalSha256"]
    body = {key:item for key,item in value.items() if key != "proposalSha256"}
    if not isinstance(supplied, str) or not HASH.fullmatch(supplied) or digest(canonical(body)) != supplied: raise Rejected("changed-proposal")
    validate_root_identity(value["rootIdentity"])
    if root_fd is not None and value["rootIdentity"] != root_identity(root_fd): raise Rejected("changed-project-root")
    validate_limits(value["limits"]); validate_provenance(value["provenance"])
    content = decode64(value["contentBytes"])
    if not content or len(content) > 8192 or contains_private_text(content.decode()): raise Rejected("unsafe-content")
    if not isinstance(value["contentSha256"], str) or not HASH.fullmatch(value["contentSha256"]) or digest(content) != value["contentSha256"]: raise Rejected("changed-proposal")
    if not isinstance(value["expectedResultSha256"], str) or not HASH.fullmatch(value["expectedResultSha256"]): raise Rejected("changed-proposal")
    if value["baseSha256"] != "absent" and (not isinstance(value["baseSha256"], str) or not HASH.fullmatch(value["baseSha256"])): raise Rejected("invalid-tuple")
    validate_common(value["destination"], value["owner"], value["destinationKind"], value["operation"], value["semantic"], content.decode(), root_fd)
    return content

def validate_approval(value, approval):
    exact_keys(approval, APPROVAL_KEYS, "approval-invalid")
    try: validate_root_identity(approval["rootIdentity"])
    except Rejected: raise Rejected("approval-invalid")
    if approval["decision"] != "approve" or any(approval[key] != value[key] for key in APPROVAL_KEYS - {"decision"}): raise Rejected("approval-invalid")

def handoff(root, document):
    exact_keys(document, {"tuple", "approval"})
    value, approval = document["tuple"], document["approval"]
    root_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        content = validate_tuple(value, root_fd); validate_approval(value, approval)
        with destination_handle(root_fd, value["destination"]) as (parent, name):
            base = read_at(parent, name)
            actual = "absent" if base is None else digest(base)
            if actual != value["baseSha256"]: raise Rejected("stale-base")
            expected = content if base is None else base + content
            if digest(expected) != value["expectedResultSha256"]: raise Rejected("changed-proposal")
            return {"state":"handed-off","owner":value["owner"],"destination":value["destination"],"tuple":value}
    finally: os.close(root_fd)

def main():
    try:
        parser=BoundedParser(add_help=False)
        parser.add_argument("action",choices=("prepare","handoff"))
        parser.add_argument("--project-root",required=True)
        args=parser.parse_args()
        raw=sys.stdin.buffer.read(MAX_BYTES+1)
        if len(raw)>MAX_BYTES: raise Rejected("input-too-large")
        document=strict_object(raw); root=Path(args.project_root).resolve(strict=True)
        result={"prepare":prepare,"handoff":handoff}[args.action](root,document)
        encoded=canonical(result)
        if len(encoded)>MAX_BYTES: raise Rejected("render-too-large")
        sys.stdout.buffer.write(encoded+b"\n"); return 0
    except Rejected as error: return fail(str(error))
    except (ValueError, TypeError, KeyError, OSError, OverflowError): return fail("invalid-input")
if __name__ == "__main__": sys.exit(main())
