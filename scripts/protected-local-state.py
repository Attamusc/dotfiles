#!/usr/bin/env python3

import argparse
import hashlib
import json
import os
import stat
import sys
from pathlib import Path

VERSION = 1


def sha256(parts):
    digest = hashlib.sha256()
    for part in parts:
        if isinstance(part, str):
            part = part.encode("utf-8", "surrogateescape")
        digest.update(len(part).to_bytes(8, "big"))
        digest.update(part)
    return digest.hexdigest()


def file_digest(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def classify(mode):
    if stat.S_ISREG(mode):
        return "file"
    if stat.S_ISDIR(mode):
        return "directory"
    if stat.S_ISLNK(mode):
        return "symlink"
    return "other"


def snapshot_root(label, root):
    if not root.exists() and not root.is_symlink():
        empty = sha256([])
        return {
            "label": label,
            "exists": False,
            "root_type": "missing",
            "entry_count": 0,
            "file_count": 0,
            "directory_count": 0,
            "symlink_count": 0,
            "relative_paths_sha256": empty,
            "modes_sha256": empty,
            "symlink_targets_sha256": empty,
            "contents_sha256": empty,
            "state_sha256": sha256([label, "missing"]),
        }

    root_type = classify(root.lstat().st_mode)
    records = []
    stack = [(".", root)]
    while stack:
        relative, path = stack.pop()
        metadata = path.lstat()
        kind = classify(metadata.st_mode)
        mode = f"{stat.S_IMODE(metadata.st_mode):04o}"
        record = {
            "relative": relative,
            "kind": kind,
            "mode": mode,
            "content": "",
            "target": "",
        }
        if kind == "file":
            record["content"] = file_digest(path)
        elif kind == "symlink":
            record["target"] = sha256([os.readlink(path)])
        elif kind == "directory":
            children = sorted(path.iterdir(), key=lambda item: os.fsencode(item.name), reverse=True)
            for child in children:
                child_relative = child.name if relative == "." else f"{relative}/{child.name}"
                stack.append((child_relative, child))
        records.append(record)

    records.sort(key=lambda record: os.fsencode(record["relative"]))
    path_records = [record["relative"] for record in records]
    mode_records = [f'{record["relative"]}\0{record["kind"]}\0{record["mode"]}' for record in records]
    target_records = [f'{record["relative"]}\0{record["target"]}' for record in records if record["target"]]
    content_records = [f'{record["relative"]}\0{record["content"]}' for record in records if record["content"]]
    state_records = [json.dumps(record, sort_keys=True, separators=(",", ":")) for record in records]

    return {
        "label": label,
        "exists": True,
        "root_type": root_type,
        "entry_count": len(records),
        "file_count": sum(record["kind"] == "file" for record in records),
        "directory_count": sum(record["kind"] == "directory" for record in records),
        "symlink_count": sum(record["kind"] == "symlink" for record in records),
        "relative_paths_sha256": sha256(path_records),
        "modes_sha256": sha256(mode_records),
        "symlink_targets_sha256": sha256(target_records),
        "contents_sha256": sha256(content_records),
        "state_sha256": sha256(state_records),
    }


def default_roots(repo):
    home = Path.home()
    return [
        ("repo-data-private", repo / ".data-private"),
        ("repo-local-skills", repo / ".local-skills"),
        ("home-gitconfig-local", home / ".gitconfig.local"),
        ("home-localrc", home / ".localrc"),
    ]


def parse_extra_roots(values):
    roots = []
    for value in values:
        if "=" not in value:
            raise ValueError(f"protected path must use LABEL=PATH: {value}")
        label, raw_path = value.split("=", 1)
        if not label or not raw_path:
            raise ValueError(f"protected path must use LABEL=PATH: {value}")
        roots.append((label, Path(raw_path).expanduser().resolve(strict=False)))
    return roots


def write_manifest(path, manifest):
    path.parent.mkdir(parents=True, exist_ok=True)
    flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    descriptor = os.open(path, flags, 0o600)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as target:
            json.dump(manifest, target, indent=2, sort_keys=True)
            target.write("\n")
    except Exception:
        try:
            os.close(descriptor)
        except OSError:
            pass
        raise


def snapshot(args):
    repo = Path(args.repo).resolve(strict=True)
    roots = default_roots(repo) + parse_extra_roots(args.path)
    labels = [label for label, _ in roots]
    if len(labels) != len(set(labels)):
        raise ValueError("protected path labels must be unique")
    manifest = {
        "version": VERSION,
        "roots": [snapshot_root(label, root) for label, root in roots],
    }
    write_manifest(Path(args.output), manifest)
    print(f"ok: protected local state captured ({len(roots)} roots)")


def read_manifest(path):
    manifest = json.loads(Path(path).read_text())
    if manifest.get("version") != VERSION or not isinstance(manifest.get("roots"), list):
        raise ValueError(f"unsupported protected-state manifest: {path}")
    return manifest


def compare(args):
    before = read_manifest(args.before)
    after = read_manifest(args.after)
    before_roots = {root["label"]: root for root in before["roots"]}
    after_roots = {root["label"]: root for root in after["roots"]}
    if before_roots.keys() != after_roots.keys():
        print("error: protected local state root set changed", file=sys.stderr)
        return 1

    changes = []
    for label in sorted(before_roots):
        old = before_roots[label]
        new = after_roots[label]
        categories = []
        if old["exists"] != new["exists"] or old["root_type"] != new["root_type"]:
            categories.append("existence/type")
        if old["relative_paths_sha256"] != new["relative_paths_sha256"]:
            categories.append("path-set")
        if old["modes_sha256"] != new["modes_sha256"]:
            categories.append("mode")
        if old["symlink_targets_sha256"] != new["symlink_targets_sha256"]:
            categories.append("symlink-target")
        if old["contents_sha256"] != new["contents_sha256"]:
            categories.append("content")
        if any(old[key] != new[key] for key in ("entry_count", "file_count", "directory_count", "symlink_count")):
            categories.append("counts")
        if old["state_sha256"] != new["state_sha256"] and not categories:
            categories.append("aggregate")
        if categories:
            changes.append((label, categories))

    if changes:
        for label, categories in changes:
            print(f'error: protected local state changed: {label} ({", ".join(categories)})', file=sys.stderr)
        return 1
    print(f"ok: protected local state unchanged ({len(before_roots)} roots)")
    return 0


def is_within(path, parent):
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def assert_temp_target(args):
    repo = Path(args.repo).resolve(strict=True)
    temp_root = Path(args.temp_root).resolve(strict=True)
    target = Path(args.target).resolve(strict=False)
    if is_within(target, repo):
        print("error: negative-test target resolves inside the live repository", file=sys.stderr)
        return 1
    if not is_within(target, temp_root) or target == temp_root:
        print("error: negative-test target is outside the runner-owned temporary root", file=sys.stderr)
        return 1
    print("ok: negative-test target is isolated from the live repository")
    return 0


def parser():
    result = argparse.ArgumentParser(description="Snapshot and compare ignored machine-local state without displaying contents.")
    subparsers = result.add_subparsers(dest="command", required=True)

    snapshot_parser = subparsers.add_parser("snapshot")
    snapshot_parser.add_argument("--repo", required=True)
    snapshot_parser.add_argument("--output", required=True)
    snapshot_parser.add_argument("--path", action="append", default=[])
    snapshot_parser.set_defaults(handler=snapshot)

    compare_parser = subparsers.add_parser("compare")
    compare_parser.add_argument("--before", required=True)
    compare_parser.add_argument("--after", required=True)
    compare_parser.set_defaults(handler=compare)

    target_parser = subparsers.add_parser("assert-temp-target")
    target_parser.add_argument("--repo", required=True)
    target_parser.add_argument("--temp-root", required=True)
    target_parser.add_argument("--target", required=True)
    target_parser.set_defaults(handler=assert_temp_target)
    return result


def main():
    args = parser().parse_args()
    try:
        outcome = args.handler(args)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"error: protected local state check failed: {error}", file=sys.stderr)
        return 1
    return 0 if outcome is None else outcome


if __name__ == "__main__":
    raise SystemExit(main())
