#!/usr/bin/env bash

set -euo pipefail

usage() {
  printf '%s\n' \
    'Usage: preview-dotfiles.sh [-h|--help]' \
    '' \
    'Run chezmoi status, then chezmoi diff, for this repository.' \
    'Preview only: no files are applied or installed.'
}

if [[ $# -gt 0 ]]; then
  if [[ $# -eq 1 && ( "$1" == -h || "$1" == --help ) ]]; then
    usage
    exit 0
  fi
  printf 'error: unsupported arguments: %s\n' "$*" >&2
  usage >&2
  exit 2
fi

if ! command -v chezmoi >/dev/null 2>&1; then
  printf 'error: chezmoi executable not found on PATH; required to preview dotfiles\n' >&2
  exit 127
fi

ROOT=$(CDPATH= cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)

chezmoi --source "$ROOT" status
exec chezmoi --source "$ROOT" diff
