#!/usr/bin/env bash

set -euo pipefail

ROOT=$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
BASELINE="$ROOT/tests/portability/known-user-paths.txt"

fail() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

for command in awk bash chezmoi comm cp find grep jq mktemp sh sort tar zsh; do
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

render_platform darwin arm64 ''
render_platform linux amd64 fedora

# Extension points for later landing steps:
# - check_package_manifests: validate one owner per baseline capability.
# - check_private_merge_fixtures: validate additive arrays and MCP map merging.

printf 'ok: portability checks passed\n'
