#!/usr/bin/env bash

set -euo pipefail

ROOT=${1:-$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)}
GUARD="$ROOT/scripts/protected-local-state.py"
WORK=$(mktemp -d "${TMPDIR:-/tmp}/portability-guard.XXXXXX")
cleanup() {
  rm -rf -- "$WORK"
}
trap cleanup EXIT HUP INT TERM
chmod 700 "$WORK"

snapshot() {
  python3 "$GUARD" snapshot \
    --repo "$1" \
    --output "$2" \
    --path "fixture-localrc=$1/.fixture-localrc" \
    >/dev/null
}

expect_changed() {
  local before=$1
  local after=$2
  local category=$3
  local output
  if output=$(python3 "$GUARD" compare --before "$before" --after "$after" 2>&1); then
    printf 'error: protected-state %s mutation was not detected\n' "$category" >&2
    return 1
  fi
  if grep -Eq '/Users/|/home/|PRIVATE|secret-value' <<<"$output"; then
    printf 'error: protected-state failure exposed private path or content\n' >&2
    return 1
  fi
}

live_before="$WORK/live-before.json"
live_after="$WORK/live-after.json"
python3 "$GUARD" snapshot --repo "$ROOT" --output "$live_before" >/dev/null

fixture="$WORK/fixture-repo"
mkdir -p "$fixture/.data-private/nested" "$fixture/.local-skills"
printf '.data-private/\n.local-skills/\n.fixture-localrc\n' >"$fixture/.gitignore"
printf 'secret-value\n' >"$fixture/.data-private/nested/value"
printf 'sort-before-root\n' >"$fixture/.data-private/!entry"
printf 'skill-target\n' >"$fixture/skill-target"
ln -s ../skill-target "$fixture/.local-skills/example"
printf 'local\n' >"$fixture/.fixture-localrc"
chmod 700 "$fixture/.data-private" "$fixture/.data-private/nested" "$fixture/.local-skills"
chmod 600 "$fixture/.data-private/nested/value" "$fixture/.data-private/!entry" "$fixture/.fixture-localrc"
git -C "$fixture" init -q
git -C "$fixture" add .gitignore skill-target
git -C "$fixture" \
  -c user.name='Portability Guard' \
  -c user.email='portability@example.invalid' \
  commit -qm 'fixture baseline'

git_before=$(git -C "$fixture" status --porcelain)
[[ -z "$git_before" ]] || {
  printf 'error: synthetic Git baseline is not clean\n' >&2
  exit 1
}
baseline="$WORK/fixture-baseline.json"
snapshot "$fixture" "$baseline"
python3 - "$baseline" <<'PY'
import json
import pathlib
import sys
manifest = json.loads(pathlib.Path(sys.argv[1]).read_text())
root = next(item for item in manifest["roots"] if item["label"] == "repo-data-private")
assert root["root_type"] == "directory"
PY

# Deletion of an ignored directory is invisible to Git but must fail the manifest comparison.
rm -rf -- "$fixture/.data-private"
git_after=$(git -C "$fixture" status --porcelain)
[[ -z "$git_after" ]] || {
  printf 'error: synthetic Git status changed; test no longer proves the ignored-state gap\n' >&2
  exit 1
}
after_delete="$WORK/after-delete.json"
snapshot "$fixture" "$after_delete"
expect_changed "$baseline" "$after_delete" deletion

# Recreate the fixture and prove content and mode changes are independently detected.
mkdir -p "$fixture/.data-private/nested"
printf 'secret-value\n' >"$fixture/.data-private/nested/value"
printf 'sort-before-root\n' >"$fixture/.data-private/!entry"
chmod 700 "$fixture/.data-private" "$fixture/.data-private/nested"
chmod 600 "$fixture/.data-private/nested/value" "$fixture/.data-private/!entry"
restored="$WORK/restored.json"
snapshot "$fixture" "$restored"
python3 "$GUARD" compare --before "$baseline" --after "$restored" >/dev/null

printf 'changed-value\n' >"$fixture/.data-private/nested/value"
after_content="$WORK/after-content.json"
snapshot "$fixture" "$after_content"
expect_changed "$baseline" "$after_content" content

printf 'secret-value\n' >"$fixture/.data-private/nested/value"
chmod 644 "$fixture/.data-private/nested/value"
after_mode="$WORK/after-mode.json"
snapshot "$fixture" "$after_mode"
expect_changed "$baseline" "$after_mode" mode

# Negative-test targets must be under the runner-owned temp root and outside the live repository.
if python3 "$GUARD" assert-temp-target \
  --repo "$ROOT" \
  --temp-root "$WORK" \
  --target "$ROOT/dot_zshrc.tmpl" \
  >/dev/null 2>&1; then
  printf 'error: live-repository negative-test target was accepted\n' >&2
  exit 1
fi
python3 "$GUARD" assert-temp-target \
  --repo "$ROOT" \
  --temp-root "$WORK" \
  --target "$fixture/dot_zshrc.tmpl" \
  >/dev/null

python3 "$GUARD" snapshot --repo "$ROOT" --output "$live_after" >/dev/null
python3 "$GUARD" compare --before "$live_before" --after "$live_after" >/dev/null

manifest_mode=$(stat -f '%Lp' "$live_before" 2>/dev/null || stat -c '%a' "$live_before")
[[ "$manifest_mode" == 600 ]] || {
  printf 'error: protected-state manifest mode is %s, expected 600\n' "$manifest_mode" >&2
  exit 1
}

printf 'ok: protected ignored-state guardrails\n'
