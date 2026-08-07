#!/usr/bin/env bash

set -euo pipefail

ROOT=$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
BASELINE="$ROOT/tests/portability/known-user-paths.txt"
MERGE_JSON_FIXTURES="$ROOT/tests/portability/fixtures/merge-json"

fail() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

for command in awk bash cat chezmoi comm cp diff find git grep jq mktemp python3 sh sort tar zsh; do
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

check_package_contract() {
  local platform=$1
  local manifest_entries=$2
  local contract=$3
  local required_commands=$4
  local contract_packages="$WORK/$platform-contract-packages"
  local contract_commands="$WORK/$platform-contract-commands"
  local sorted="$WORK/$platform-sorted"

  [[ -f "$contract" ]] || fail "missing $platform package contract: ${contract#"$PUBLIC_SOURCE/"}"
  awk -F '\t' 'NF != 2 || $1 == "" || $2 == "" { exit 1 }' "$contract" || \
    fail "invalid $platform package contract row"

  cut -f1 "$contract" >"$contract_packages"
  cut -f2 "$contract" >"$contract_commands"
  LC_ALL=C sort -u "$contract_packages" >"$sorted"
  diff -u "$sorted" "$contract_packages" >/dev/null || \
    fail "$platform package contract entries must be sorted and unique"
  LC_ALL=C sort -u "$contract_commands" >"$sorted"
  [[ $(wc -l <"$contract_commands") -eq $(wc -l <"$sorted") ]] || \
    fail "$platform baseline commands must each have exactly one package owner"

  diff -u "$contract_packages" "$manifest_entries" >/dev/null || \
    fail "$platform manifest does not match its package-to-command contract"
  diff -u "$required_commands" "$sorted" >/dev/null || \
    fail "$platform package contract does not match the required command baseline"
}

check_package_manifests() {
  local fedora_manifest="$PUBLIC_SOURCE/packages/fedora.txt"
  local brew_manifest="$PUBLIC_SOURCE/packages/Brewfile"
  local package_fixtures="$PUBLIC_SOURCE/tests/portability/fixtures/packages"
  local fedora_entries="$WORK/fedora-manifest-entries"
  local brew_entries="$WORK/brew-manifest-entries"
  local brew_formulae="$WORK/brew-formulae"
  local brew_casks="$WORK/brew-casks"
  local sorted="$WORK/package-sorted"
  local fedora_commands="$WORK/fedora-required-commands"
  local brew_commands="$WORK/brew-required-commands"

  [[ -f "$fedora_manifest" ]] || fail "missing Fedora package manifest"
  [[ -f "$brew_manifest" ]] || fail "missing macOS Brew manifest"

  awk 'NF && $1 !~ /^#/ {
    if (NF != 1 || $1 !~ /^[A-Za-z0-9@+._\/-]+$/) exit 1
    print $1
  }' "$fedora_manifest" >"$fedora_entries" || fail "invalid Fedora package manifest entry"
  LC_ALL=C sort -u "$fedora_entries" >"$sorted"
  diff -u "$sorted" "$fedora_entries" >/dev/null || \
    fail "Fedora package manifest entries must be sorted and unique"

  awk '
    NF == 0 { next }
    $0 ~ /^(tap|brew|cask) "[A-Za-z0-9@+._\/-]+"$/ { next }
    { exit 1 }
  ' "$brew_manifest" || fail "invalid Brew manifest entry"
  awk '$1 == "brew" { value=$0; sub(/^[^"]*"/, "", value); sub(/"$/, "", value); print value }' \
    "$brew_manifest" >"$brew_formulae"
  awk '$1 == "cask" { value=$0; sub(/^[^"]*"/, "", value); sub(/"$/, "", value); print value }' \
    "$brew_manifest" >"$brew_casks"
  LC_ALL=C sort -u "$brew_formulae" >"$sorted"
  diff -u "$sorted" "$brew_formulae" >/dev/null || \
    fail "Brew formula entries must be sorted and unique"
  [[ $(cat "$brew_casks") == copilot-cli ]] || fail "copilot-cli must be the only shared cask"
  [[ $(awk '$1 == "tap" { print }' "$brew_manifest") == 'tap "anomalyco/tap"' ]] || \
    fail "anomalyco/tap must be the only shared tap"
  { cat "$brew_formulae"; cat "$brew_casks"; } | LC_ALL=C sort >"$brew_entries"

  cat >"$fedora_commands" <<'EOF'
bat
chezmoi
chsh
curl
delta
eza
fd
file
fzf
gh
git
git-filter-repo
hx
jq
mosh
ps
rg
tig
tmux
tree
wget
zoxide
zsh
EOF
  cat >"$brew_commands" <<'EOF'
bat
bob
chezmoi
copilot
curl
delta
eza
fd
fzf
gh
ghq
git
git-filter-repo
herdr
hx
jj
jjui
jq
lazygit
mise
mosh
opencode
pi
rg
sheldon
starship
tig
tmux
tree
tv
wget
zoxide
zsh
EOF

  check_package_contract fedora "$fedora_entries" "$package_fixtures/fedora.tsv" "$fedora_commands"
  check_package_contract brew "$brew_entries" "$package_fixtures/brew.tsv" "$brew_commands"

  printf 'ok: Fedora and macOS package authority manifests\n'
}

synthetic_git_config() {
  local home=$1
  shift

  HOME="$home" \
  XDG_CONFIG_HOME="$home/.config" \
  GIT_CONFIG_GLOBAL="$home/.gitconfig" \
  GIT_CONFIG_NOSYSTEM=1 \
    git config --global --includes "$@"
}

check_git_config() {
  local rendered=$1
  local platform=$2
  local public_config="$rendered/.gitconfig"
  local git_home="$WORK/git-home-$platform"
  local local_config="$git_home/.gitconfig.local"
  local value status

  [[ -f "$public_config" ]] || fail "missing rendered Git configuration: $public_config"

  mkdir -p "$git_home/.config"
  cp -- "$public_config" "$git_home/.gitconfig"

  synthetic_git_config "$git_home" --list >/dev/null || \
    fail "$platform Git configuration fails when ~/.gitconfig.local is absent"

  value=$(synthetic_git_config "$git_home" --get include.path) || \
    fail "$platform Git configuration does not include ~/.gitconfig.local"
  [[ "$value" == '~/.gitconfig.local' ]] || \
    fail "$platform Git include target is unexpected: $value"

  for key in user.signingkey gpg.program gpg.ssh.program; do
    if value=$(synthetic_git_config "$git_home" --get "$key"); then
      fail "$platform public Git configuration sets $key"
    else
      status=$?
      [[ $status -eq 1 ]] || fail "$platform Git query failed for $key"
    fi
  done

  if value=$(synthetic_git_config "$git_home" --get-regexp '^credential\.'); then
    fail "$platform public Git configuration contains credential settings: $value"
  else
    status=$?
    [[ $status -eq 1 ]] || fail "$platform Git credential query failed"
  fi

  value=$(synthetic_git_config "$git_home" --get user.name) || \
    fail "$platform public Git configuration lost user.name"
  [[ -n "$value" ]] || fail "$platform public Git user.name is empty"
  value=$(synthetic_git_config "$git_home" --get user.email) || \
    fail "$platform public Git configuration lost user.email"
  [[ -n "$value" ]] || fail "$platform public Git user.email is empty"
  [[ $(synthetic_git_config "$git_home" --get core.editor) == nvim ]] || \
    fail "$platform public Git configuration lost the shared editor"
  [[ $(synthetic_git_config "$git_home" --get core.pager) == delta ]] || \
    fail "$platform public Git configuration lost the shared pager"
  synthetic_git_config "$git_home" --get alias.main-branch >/dev/null || \
    fail "$platform public Git configuration lost shared aliases"
  [[ $(synthetic_git_config "$git_home" --get gpg.format) == ssh ]] || \
    fail "$platform public Git configuration lost the SSH signing baseline"

  if value=$(synthetic_git_config "$git_home" --type=bool --get commit.gpgsign); then
    [[ "$value" == false ]] || \
      fail "$platform public Git configuration enables signed commits"
  else
    status=$?
    [[ $status -eq 1 ]] || fail "$platform Git commit.gpgsign query failed"
  fi

  cat >"$local_config" <<'EOF'
[credential]
  helper = synthetic-local-helper
[user]
  signingkey = synthetic-local-signing-key
[commit]
  gpgsign = true
[gpg "ssh"]
  program = /synthetic/local/ssh-signer
[portability]
  localIncludeLoaded = true
EOF

  [[ $(synthetic_git_config "$git_home" --get portability.localIncludeLoaded) == true ]] || \
    fail "$platform Git configuration did not load ~/.gitconfig.local"
  [[ $(synthetic_git_config "$git_home" --get credential.helper) == synthetic-local-helper ]] || \
    fail "$platform local Git configuration did not supply credential settings"
  [[ $(synthetic_git_config "$git_home" --get user.signingkey) == synthetic-local-signing-key ]] || \
    fail "$platform local Git configuration did not supply a signing key"
  [[ $(synthetic_git_config "$git_home" --get gpg.ssh.program) == /synthetic/local/ssh-signer ]] || \
    fail "$platform local Git configuration did not supply a signing program"
  [[ $(synthetic_git_config "$git_home" --type=bool --get commit.gpgsign) == true ]] || \
    fail "$platform local Git configuration did not enable signed commits"

  printf 'ok: %s Git machine-local include behavior\n' "$platform"
}

render_source_template() {
  local platform=$1
  local architecture=$2
  local os_release=$3
  local version=$4
  local template=$5
  local output=$6
  local override

  override=$(jq -cn \
    --arg os "$platform" \
    --arg arch "$architecture" \
    --arg home "$WORK/home" \
    --arg os_release "$os_release" \
    --arg version "$version" \
    '{chezmoi: {os: $os, arch: $arch, username: "portability", hostname: "portability", homeDir: $home}}
     | if $os_release == "" then . else .chezmoi.osRelease = {id: $os_release, versionID: $version} end')

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
      --override-data "$override" \
      execute-template --init --file "$PUBLIC_SOURCE/$template" \
      >"$output"
}

assert_platform_gate_rejects() {
  local name=$1
  local script=$2
  local output

  if output=$(sh "$script" 2>&1); then
    fail "$name platform gate unexpectedly succeeded"
  fi
  grep -Fq 'Supported targets: macOS and Fedora 44' <<<"$output" || \
    fail "$name platform rejection omitted the supported targets"
}

check_bootstrap_contract() {
  local hooks="$PUBLIC_SOURCE/.chezmoiscripts"
  local guard=run_before_00-check-supported-platform.sh.tmpl
  local mac_hook=run_onchange_before_10-install-macos-packages.sh.tmpl
  local fedora_hook=run_onchange_before_10-install-fedora-packages.sh.tmpl
  local shell_hook=run_once_before_20-configure-fedora-login-shell.sh.tmpl
  local tpm_hook=run_once_before_30-install-tpm.sh.tmpl
  local darwin_guard="$WORK/darwin-platform-guard.sh"
  local fedora_guard="$WORK/fedora-platform-guard.sh"
  local ubuntu_guard="$WORK/ubuntu-platform-guard.sh"
  local old_fedora_guard="$WORK/fedora43-platform-guard.sh"
  local mac_before="$WORK/mac-packages-before.sh"
  local mac_after="$WORK/mac-packages-after.sh"
  local fedora_before="$WORK/fedora-packages-before.sh"
  local fedora_after="$WORK/fedora-packages-after.sh"
  local other_before="$WORK/other-packages-before.sh"
  local other_after="$WORK/other-packages-after.sh"
  local homebrew_installer="$WORK/homebrew-installer.sh"
  local fedora_login_shell="$WORK/fedora-login-shell.sh"
  local tpm_installer="$WORK/tpm-installer.sh"
  local manifest_backup="$WORK/manifest-backup"
  local bootstrap_files="$WORK/bootstrap-files"
  local relative_path rendered_hook runtime_file

  for file in "$guard" "$mac_hook" "$fedora_hook" "$shell_hook" "$tpm_hook"; do
    [[ -f "$hooks/$file" ]] || fail "missing ordered bootstrap hook: $file"
  done
  for removed in \
    run_once_after_00-config-linux.sh.tmpl \
    run_once_after_10-install-homebrew-deps.sh.tmpl \
    run_once_before_02-install-tpm.sh.tmpl; do
    [[ ! -e "$hooks/$removed" ]] || fail "obsolete bootstrap hook remains: $removed"
  done
  [[ ! -e "$PUBLIC_SOURCE/.github/workflows/linuxbrew-cache.yml" ]] || \
    fail "obsolete Linuxbrew cache workflow remains"

  : >"$bootstrap_files"
  while IFS= read -r -d '' runtime_file; do
    relative_path=${runtime_file#"$PUBLIC_SOURCE/"}
    is_runtime_source "$relative_path" || continue
    printf '%s\n' "$runtime_file" >>"$bootstrap_files"
  done < <(find "$PUBLIC_SOURCE" -type f -print0)
  if [[ -d "$PUBLIC_SOURCE/.github/workflows" ]]; then
    find "$PUBLIC_SOURCE/.github/workflows" -type f -print >>"$bootstrap_files"
  fi
  if xargs grep -E '/home/linuxbrew|linuxbrew-cache|ghcr\.io/attamusc/linuxbrew-cache|CODESPACES' \
      <"$bootstrap_files" >/dev/null 2>&1; then
    fail "retired Linuxbrew or Codespaces bootstrap behavior remains"
  fi

  grep -Fq "supported_targets='macOS and Fedora 44'" "$PUBLIC_SOURCE/install.sh" || \
    fail "install.sh does not declare the supported platforms"
  grep -Fq 'Supported targets: $supported_targets' "$PUBLIC_SOURCE/install.sh" || \
    fail "install.sh rejection does not name the supported platforms"
  grep -Fq 'sudo dnf install -y chezmoi' "$PUBLIC_SOURCE/install.sh" || \
    fail "Fedora bootstrap does not install chezmoi through DNF"
  grep -Fq 'https://get.chezmoi.io' "$PUBLIC_SOURCE/install.sh" || \
    fail "macOS bootstrap does not use the current chezmoi installer"

  grep -Fq '# Brewfile SHA-256:' "$hooks/$mac_hook" || \
    fail "macOS package hook is not content-addressed to Brewfile"
  grep -Fq 'bundle --file=' "$hooks/$mac_hook" || fail "macOS package hook omits brew bundle"
  grep -Fq '# Fedora manifest SHA-256:' "$hooks/$fedora_hook" || \
    fail "Fedora package hook is not content-addressed to its manifest"
  grep -Fq 'sudo dnf install -y' "$hooks/$fedora_hook" || fail "Fedora package hook omits DNF install"
  if grep -Eq '\|\|[[:space:]]*(:|true)' "$hooks/$mac_hook" "$hooks/$fedora_hook"; then
    fail "native package hook suppresses package-manager failures"
  fi

  [[ "${mac_hook#*_before_}" < "${shell_hook#*_before_}" \
    && "${fedora_hook#*_before_}" < "${shell_hook#*_before_}" \
    && "${shell_hook#*_before_}" < "${tpm_hook#*_before_}" ]] || \
    fail "native package, login-shell, and TPM hooks are ordered incorrectly"

  render_source_template darwin arm64 '' '' ".chezmoiscripts/$guard" "$darwin_guard"
  render_source_template linux amd64 fedora 44 ".chezmoiscripts/$guard" "$fedora_guard"
  render_source_template linux amd64 ubuntu 24.04 ".chezmoiscripts/$guard" "$ubuntu_guard"
  render_source_template linux amd64 fedora 43 ".chezmoiscripts/$guard" "$old_fedora_guard"
  sh "$darwin_guard"
  sh "$fedora_guard"
  assert_platform_gate_rejects Ubuntu "$ubuntu_guard"
  assert_platform_gate_rejects 'Fedora 43' "$old_fedora_guard"

  render_source_template darwin arm64 '' '' ".chezmoiscripts/$mac_hook" "$mac_before"
  render_source_template linux amd64 fedora 44 ".chezmoiscripts/$fedora_hook" "$fedora_before"
  render_source_template darwin arm64 '' '' \
    '.chezmoiscripts/run_once_before_01-install-homebrew.sh.tmpl' "$homebrew_installer"
  render_source_template linux amd64 fedora 44 ".chezmoiscripts/$shell_hook" "$fedora_login_shell"
  render_source_template darwin arm64 '' '' ".chezmoiscripts/$tpm_hook" "$tpm_installer"
  [[ -s "$mac_before" && -s "$fedora_before" ]] || fail "native package hook rendered empty"
  for rendered_hook in \
    "$homebrew_installer" \
    "$mac_before" \
    "$fedora_before" \
    "$fedora_login_shell" \
    "$tpm_installer"; do
    bash -n "$rendered_hook"
  done
  render_source_template linux amd64 fedora 44 ".chezmoiscripts/$mac_hook" "$other_before"
  [[ ! -s "$other_before" ]] || fail "macOS package hook rendered on Fedora"
  render_source_template darwin arm64 '' '' ".chezmoiscripts/$fedora_hook" "$other_before"
  [[ ! -s "$other_before" ]] || fail "Fedora package hook rendered on macOS"

  cp "$PUBLIC_SOURCE/packages/Brewfile" "$manifest_backup"
  printf '\n# portability digest probe\n' >>"$PUBLIC_SOURCE/packages/Brewfile"
  render_source_template darwin arm64 '' '' ".chezmoiscripts/$mac_hook" "$mac_after"
  render_source_template linux amd64 fedora 44 ".chezmoiscripts/$fedora_hook" "$other_after"
  cp "$manifest_backup" "$PUBLIC_SOURCE/packages/Brewfile"
  cmp -s "$mac_before" "$mac_after" && fail "Brewfile changes do not change the run_onchange hook"
  cmp -s "$fedora_before" "$other_after" || fail "Brewfile changes altered the Fedora package hook"

  cp "$PUBLIC_SOURCE/packages/fedora.txt" "$manifest_backup"
  printf '\n# portability digest probe\n' >>"$PUBLIC_SOURCE/packages/fedora.txt"
  render_source_template linux amd64 fedora 44 ".chezmoiscripts/$fedora_hook" "$fedora_after"
  render_source_template darwin arm64 '' '' ".chezmoiscripts/$mac_hook" "$other_after"
  cp "$manifest_backup" "$PUBLIC_SOURCE/packages/fedora.txt"
  cmp -s "$fedora_before" "$fedora_after" && fail "Fedora manifest changes do not change the run_onchange hook"
  cmp -s "$mac_before" "$other_after" || fail "Fedora manifest changes altered the macOS package hook"

  printf 'ok: native macOS and Fedora bootstrap contract\n'
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
  check_git_config "$rendered" "$platform"
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

check_bootstrap_contract
rm -- "$PUBLIC_SOURCE/.chezmoi.toml.tmpl"
check_merge_json_fixtures
check_package_manifests
render_platform darwin arm64 ''
render_platform linux amd64 fedora

printf 'ok: portability checks passed\n'
