#!/usr/bin/env bash

set -euo pipefail

ROOT=$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
BASELINE="$ROOT/tests/portability/known-user-paths.txt"
MERGE_JSON_FIXTURES="$ROOT/tests/portability/fixtures/merge-json"

fail() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

for command in awk bash cat chezmoi comm cp diff find grep jq mktemp python3 sh sort tar zsh; do
  command -v "$command" >/dev/null 2>&1 || fail "required command not found: $command"
done

[[ -f "$BASELINE" ]] || fail "missing user-path baseline: $BASELINE"

WORK=$(mktemp -d "${TMPDIR:-/tmp}/check-portability.XXXXXX")
cleanup() {
  rm -rf -- "$WORK"
}
trap cleanup EXIT HUP INT TERM

PUBLIC_SOURCE="$WORK/source"
mkdir -p "$PUBLIC_SOURCE"

# Build an isolated source tree so ignored machine-local overlays cannot affect
# rendering. Runtime/cache directories are omitted for speed.
while IFS= read -r -d '' source_path; do
  relative_path=${source_path#"$ROOT/"}
  destination_path="$PUBLIC_SOURCE/$relative_path"
  mkdir -p "$(dirname -- "$destination_path")"
  cp -Pp -- "$source_path" "$destination_path"
done < <(
  find "$ROOT" \
    \( -path "$ROOT/.git" \
       -o -path "$ROOT/.jj" \
       -o -path "$ROOT/.opencode" \
       -o -path "$ROOT/.pi" \
       -o -path "$ROOT/.artifacts" \
       -o -path "$ROOT/.ruff_cache" \
       -o -path "$ROOT/.local-skills" \
       -o -path "$ROOT/.data-private" \) -prune \
    -o \( -type f -o -type l \) -print0
)

check_json_files() {
  local directory=$1
  local label=$2
  local count=0
  local file error relative_path

  while IFS= read -r -d '' file; do
    relative_path=${file#"$directory/"}
    if ! error=$(jq empty "$file" 2>&1); then
      printf 'error: invalid JSON in %s (%s):\n%s\n' "$relative_path" "$label" "$error" >&2
      return 1
    fi
    count=$((count + 1))
  done < <(find "$directory" -type f -name '*.json' -print0)

  printf 'ok: %s JSON syntax (%d files)\n' "$label" "$count"
}

is_runtime_source() {
  case "$1" in
    .chezmoi*|.data/*|dot_*|install.sh|run_once_*|tuna/*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

check_user_paths() {
  local actual="$WORK/user-paths.actual"
  local expected="$WORK/user-paths.expected"
  local unexpected="$WORK/user-paths.unexpected"
  local missing="$WORK/user-paths.missing"
  local pattern='/(Users|home)/[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9._@%+=:,~-]+)*'
  local file relative_path matches user_path count

  : >"$actual"
  while IFS= read -r -d '' file; do
    relative_path=${file#"$PUBLIC_SOURCE/"}
    is_runtime_source "$relative_path" || continue

    if matches=$(LC_ALL=C grep -Eo "$pattern" "$file"); then
      while IFS= read -r user_path; do
        case "$user_path" in
          /home/linuxbrew|/home/linuxbrew/*)
            continue
            ;;
        esac
        printf '%s\t%s\n' "$relative_path" "$user_path" >>"$actual"
      done <<<"$matches"
    fi
  done < <(find "$PUBLIC_SOURCE" -type f -print0)

  LC_ALL=C sort -u "$actual" -o "$actual"
  LC_ALL=C awk '!/^[[:space:]]*(#|$)/' "$BASELINE" | LC_ALL=C sort -u >"$expected"
  comm -13 "$expected" "$actual" >"$unexpected"
  comm -23 "$expected" "$actual" >"$missing"

  if [[ -s "$unexpected" || -s "$missing" ]]; then
    if [[ -s "$unexpected" ]]; then
      printf 'error: unexpected public user-specific absolute paths:\n' >&2
      while IFS= read -r user_path; do
        printf '  + %s\n' "$user_path" >&2
      done <"$unexpected"
    fi
    if [[ -s "$missing" ]]; then
      printf 'error: stale entries in %s:\n' "${BASELINE#"$ROOT/"}" >&2
      while IFS= read -r user_path; do
        printf '  - %s\n' "$user_path" >&2
      done <"$missing"
    fi
    return 1
  fi

  count=$(wc -l <"$actual")
  count=${count//[[:space:]]/}
  printf 'ok: public user-specific paths match migration baseline (%d entries)\n' "$count"
}

shell_for_file() {
  local file=$1
  local relative_path=$2
  local first_line

  first_line=''
  if IFS= read -r first_line <"$file"; then
    :
  fi
  case "$first_line" in
    *'/bin/bash'*|*'/usr/bin/env bash'*)
      printf 'bash\n'
      ;;
    *'/bin/zsh'*|*'/usr/bin/env zsh'*)
      printf 'zsh\n'
      ;;
    *'/bin/sh'*|*'/usr/bin/env sh'*)
      printf 'sh\n'
      ;;
    *)
      case "$relative_path" in
        *.zsh|.zshrc|*/.zshrc)
          printf 'zsh\n'
          ;;
        *.sh)
          printf 'sh\n'
          ;;
      esac
      ;;
  esac
}

check_shell_files() {
  local directory=$1
  local label=$2
  local count=0
  local file relative_path shell syntax_error

  while IFS= read -r -d '' file; do
    relative_path=${file#"$directory/"}
    shell=$(shell_for_file "$file" "$relative_path")
    [[ -n "$shell" ]] || continue

    if ! syntax_error=$("$shell" -n "$file" 2>&1); then
      printf 'error: invalid %s syntax in %s (%s render):\n%s\n' \
        "$shell" "$relative_path" "$label" "$syntax_error" >&2
      return 1
    fi
    count=$((count + 1))
  done < <(find "$directory" -type f -print0)

  printf 'ok: %s rendered shell syntax (%d files)\n' "$label" "$count"
}

check_merge_json_fixture() {
  local name=$1
  local status=$2
  local wrap_key=${3:-}
  local relative_fixture="tests/portability/fixtures/merge-json/$name"
  local fixture="$PUBLIC_SOURCE/$relative_fixture"
  local template="$WORK/merge-json-$name.tmpl"
  local actual="$WORK/merge-json-$name.actual.json"
  local expected="$WORK/merge-json-$name.expected.json"
  local normalized_actual="$WORK/merge-json-$name.actual.normalized.json"
  local normalized_expected="$WORK/merge-json-$name.expected.normalized.json"
  local difference="$WORK/merge-json-$name.diff"
  local invocation

  [[ -f "$fixture/public.json" ]] || fail "missing merge-json fixture input: $relative_fixture/public.json"
  [[ -f "$fixture/expected.json" ]] || fail "missing merge-json fixture output: $relative_fixture/expected.json"

  if [[ -n "$wrap_key" ]]; then
    printf -v invocation \
      '{{ template "merge-json" (dict "public" "%s/public.json" "private" "%s/private.json" "sourceDir" .chezmoi.sourceDir "wrapKey" "%s") }}' \
      "$relative_fixture" "$relative_fixture" "$wrap_key"
  else
    printf -v invocation \
      '{{ template "merge-json" (dict "public" "%s/public.json" "private" "%s/private.json" "sourceDir" .chezmoi.sourceDir) }}' \
      "$relative_fixture" "$relative_fixture"
  fi
  [[ -f "$PUBLIC_SOURCE/.chezmoitemplates/merge-json" ]] || fail "missing merge-json template"
  {
    printf '{{ define "merge-json" }}\n'
    cat "$PUBLIC_SOURCE/.chezmoitemplates/merge-json"
    printf '\n{{ end }}\n%s\n' "$invocation"
  } >"$template"

  HOME="$WORK/home" \
  XDG_CACHE_HOME="$WORK/cache" \
  XDG_CONFIG_HOME="$WORK/config" \
  XDG_DATA_HOME="$WORK/data" \
    chezmoi \
      --source "$PUBLIC_SOURCE" \
      --destination "$WORK/home" \
      --cache "$WORK/cache/chezmoi" \
      --config "$WORK/config/chezmoi.toml" \
      --no-tty \
      --refresh-externals=never \
      execute-template --init --file "$template" \
      >"$actual"

  jq -S . "$fixture/expected.json" >"$normalized_expected"
  if ! jq -S . "$actual" >"$normalized_actual"; then
    printf 'error: merge-json fixture rendered invalid JSON: %s\n' "$name" >&2
    return 1
  fi

  if diff -u "$normalized_expected" "$normalized_actual" >"$difference"; then
    if [[ "$status" == pending ]]; then
      printf 'error: pending merge-json fixture now passes; activate it: %s\n' "$name" >&2
      return 1
    fi
    printf 'ok: merge-json fixture: %s\n' "$name"
    return 0
  fi

  if [[ "$status" == pending ]]; then
    printf 'pending: merge-json fixture: %s (additive array contract not implemented)\n' "$name"
    return 0
  fi

  printf 'error: merge-json fixture mismatch: %s\n' "$name" >&2
  cat "$difference" >&2
  return 1
}

check_merge_json_fixtures() {
  [[ -d "$MERGE_JSON_FIXTURES" ]] || fail "missing merge-json fixtures: $MERGE_JSON_FIXTURES"

  check_merge_json_fixture public-only active
  check_merge_json_fixture scalar-override active
  check_merge_json_fixture mcp-map active mcpServers
  check_merge_json_fixture additive-arrays active
}

render_platform() {
  local platform=$1
  local architecture=$2
  local os_release=$3
  local rendered="$WORK/rendered-$platform"
  local archive="$WORK/$platform.tar"
  local config="$WORK/config/chezmoi.toml"
  local state="$WORK/state-$platform.boltdb"
  local override

  override=$(jq -cn \
    --arg os "$platform" \
    --arg arch "$architecture" \
    --arg home "$WORK/home" \
    --arg os_release "$os_release" \
    '{chezmoi: {os: $os, arch: $arch, username: "portability", hostname: "portability", homeDir: $home}}
     | if $os_release == "" then . else .chezmoi.osRelease = {id: $os_release, versionID: "44"} end')

  HOME="$WORK/home" \
  XDG_CACHE_HOME="$WORK/cache" \
  XDG_CONFIG_HOME="$WORK/config" \
  XDG_DATA_HOME="$WORK/data" \
    chezmoi \
      --source "$PUBLIC_SOURCE" \
      --destination "$WORK/home" \
      --cache "$WORK/cache/chezmoi" \
      --config "$config" \
      --persistent-state "$state" \
      --no-tty \
      --refresh-externals=never \
      --override-data "$override" \
      archive --format tar --output "$archive"

  mkdir -p "$rendered"
  tar -xf "$archive" -C "$rendered"
  printf 'ok: %s public configuration renders without a private overlay\n' "$platform"
  check_json_files "$rendered" "$platform rendered"
  check_shell_files "$rendered" "$platform"
}

check_json_files "$PUBLIC_SOURCE" 'public source'
check_user_paths
"$ROOT/tests/portability/test-protected-local-state.sh" "$ROOT"

mkdir -p "$WORK/home" "$WORK/cache" "$WORK/config" "$WORK/data"
HOME="$WORK/home" \
XDG_CACHE_HOME="$WORK/cache" \
XDG_CONFIG_HOME="$WORK/config" \
XDG_DATA_HOME="$WORK/data" \
  chezmoi \
    --source "$PUBLIC_SOURCE" \
    --destination "$WORK/home" \
    --cache "$WORK/cache/chezmoi" \
    --no-tty \
    --refresh-externals=never \
    execute-template --init --file "$PUBLIC_SOURCE/.chezmoi.toml.tmpl" \
    >"$WORK/config/chezmoi.toml"
rm -- "$PUBLIC_SOURCE/.chezmoi.toml.tmpl"

check_merge_json_fixtures
render_platform darwin arm64 ''
render_platform linux amd64 fedora

# Extension points for later landing steps:
# - check_package_manifests: validate one owner per baseline capability.

printf 'ok: portability checks passed\n'
