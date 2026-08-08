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
    .chezmoi*|.data/*|dot_*|install.sh|packages/*|run_*|tuna/*)
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

    if [[ "$shell" == sh ]] && grep -Eq \
        '(^|[;[:space:]])\[\[|^[[:space:]]*function[[:space:]]|^[[:space:]]*local[[:space:]]|(^|[;[:space:]])read[[:space:]]+-p|<[[:space:]]*\(' \
        "$file"; then
      printf 'error: Bash-only syntax under sh shebang in %s (%s render)\n' \
        "$relative_path" "$label" >&2
      return 1
    fi

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
cc
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
git filter-repo
hx
jq
mosh
ps
rg
tig
tmux
tree
tree-sitter
wget
wl-copy
xdg-open
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
git filter-repo
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
tree-sitter
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
  local arm_fedora_guard="$WORK/fedora44-arm-platform-guard.sh"
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
  local relative_path rendered_hook runtime_file secure_line trust_line bundle_line

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
  grep -Fq '"$machine" != x86_64' "$PUBLIC_SOURCE/install.sh" || \
    fail "install.sh does not reject unsupported Fedora architectures"
  grep -Fq 'https://get.chezmoi.io' "$PUBLIC_SOURCE/install.sh" || \
    fail "macOS bootstrap does not use the current chezmoi installer"

  grep -Fq '# Brewfile SHA-256:' "$hooks/$mac_hook" || \
    fail "macOS package hook is not content-addressed to Brewfile"
  grep -Fq 'install -d -m 700 "$trust_dir"' "$hooks/$mac_hook" || \
    fail "macOS package hook does not secure the Homebrew trust directory"
  grep -Fq 'trust --tap anomalyco/tap' "$hooks/$mac_hook" || \
    fail "macOS package hook does not trust the declared OpenCode tap"
  grep -Fq 'bundle --file=' "$hooks/$mac_hook" || fail "macOS package hook omits brew bundle"
  secure_line=$(grep -n 'install -d -m 700 "$trust_dir"' "$hooks/$mac_hook" | cut -d: -f1)
  trust_line=$(grep -n 'trust --tap anomalyco/tap' "$hooks/$mac_hook" | cut -d: -f1)
  bundle_line=$(grep -n 'bundle --file=' "$hooks/$mac_hook" | cut -d: -f1)
  (( secure_line < trust_line && trust_line < bundle_line )) || \
    fail "macOS package hook must secure, trust, then run brew bundle"
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
  render_source_template linux arm64 fedora 44 ".chezmoiscripts/$guard" "$arm_fedora_guard"
  sh "$darwin_guard"
  sh "$fedora_guard"
  assert_platform_gate_rejects Ubuntu "$ubuntu_guard"
  assert_platform_gate_rejects 'Fedora 43' "$old_fedora_guard"
  assert_platform_gate_rejects 'Fedora 44 arm64' "$arm_fedora_guard"

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

check_mise_contract() {
  local config_template=dot_config/mise/config.toml.tmpl
  local hook_template=.chezmoiscripts/run_onchange_after_10-install-mise-tools.sh.tmpl
  local fixtures="$PUBLIC_SOURCE/tests/portability/fixtures/mise"
  local darwin_config="$WORK/mise-darwin.toml"
  local fedora_config="$WORK/mise-fedora.toml"
  local darwin_hook="$WORK/mise-darwin-hook.sh"
  local fedora_hook="$WORK/mise-fedora-hook.sh"
  local darwin_changed="$WORK/mise-darwin-hook-changed.sh"
  local fedora_changed="$WORK/mise-fedora-hook-changed.sh"
  local template_backup="$WORK/mise-config-template-backup"
  local hook_name=${hook_template##*/}

  [[ -f "$PUBLIC_SOURCE/$config_template" ]] || fail "missing rendered mise configuration"
  [[ -f "$PUBLIC_SOURCE/$hook_template" ]] || fail "missing mise installation hook"
  [[ "${hook_name#*_after_}" < 20-setup-neovim.sh.tmpl ]] || \
    fail "mise tools must install before Neovim setup"

  render_source_template darwin arm64 '' '' "$config_template" "$darwin_config"
  render_source_template linux amd64 fedora 44 "$config_template" "$fedora_config"
  diff -u "$fixtures/darwin.toml" "$darwin_config" >/dev/null || \
    fail "Darwin mise configuration does not match its authority contract"
  diff -u "$fixtures/fedora.toml" "$fedora_config" >/dev/null || \
    fail "Fedora mise configuration does not match its authority contract"

  python3 - "$darwin_config" "$fedora_config" <<'PY'
import pathlib
import sys
import tomllib

darwin = tomllib.loads(pathlib.Path(sys.argv[1]).read_text())["tools"]
fedora = tomllib.loads(pathlib.Path(sys.argv[2]).read_text())["tools"]
assert darwin == {"node": "24"}
assert fedora == {
    "node": "24",
    "bob": "4",
    "ghq": "1",
    "herdr": "0.8.0",
    "jj": "0.44.0",
    "jjui": "0.10.9",
    "lazygit": "0.64.0",
    "npm:@earendil-works/pi-coding-agent": "0.83.0",
    "npm:@github/copilot": "1",
    "opencode": "1",
    "sheldon": "0.8.5",
    "starship": "1",
    "television": "0.15.9",
}
PY

  render_source_template darwin arm64 '' '' "$hook_template" "$darwin_hook"
  render_source_template linux amd64 fedora 44 "$hook_template" "$fedora_hook"
  bash -n "$darwin_hook"
  bash -n "$fedora_hook"
  grep -Fq '# Rendered mise config SHA-256:' "$PUBLIC_SOURCE/$hook_template" || \
    fail "mise hook is not content-addressed to its rendered configuration"
  grep -Fq 'MISE_YES=1' "$PUBLIC_SOURCE/$hook_template" || fail "mise hook is not noninteractive"
  grep -Fq '"$mise_bin" install --verbose' "$PUBLIC_SOURCE/$hook_template" || \
    fail "mise hook does not expose install failures"
  grep -Fq '"$mise_bin" which "$command_name"' "$PUBLIC_SOURCE/$hook_template" || \
    fail "mise hook does not verify command ownership"
  if grep -Eq '\|\|[[:space:]]*(:|true)|--yes' "$PUBLIC_SOURCE/$hook_template"; then
    fail "mise hook suppresses failure or uses an unsupported --yes flag"
  fi
  grep -Fq 'https://mise.run' "$fedora_hook" || fail "Fedora hook does not bootstrap mise"
  ! grep -Fq 'https://mise.run' "$darwin_hook" || fail "macOS hook bypasses Homebrew mise ownership"
  grep -Fq 'mise_prefix=$("$brew" --prefix mise)' "$darwin_hook" || \
    fail "macOS hook does not resolve mise through Homebrew ownership"
  grep -Fq 'commands=(node npm npx)' "$darwin_hook" || fail "macOS mise command baseline is incomplete"
  ! grep -Fq 'commands+=' "$darwin_hook" || fail "macOS mise config claims Fedora tool ownership"
  grep -Fq 'commands+=(sheldon starship herdr jj ghq tv lazygit jjui bob opencode pi copilot)' "$fedora_hook" || \
    fail "Fedora mise command baseline is incomplete"

  cp "$PUBLIC_SOURCE/$config_template" "$template_backup"
  printf '\n# portability digest probe\n' >>"$PUBLIC_SOURCE/$config_template"
  render_source_template darwin arm64 '' '' "$hook_template" "$darwin_changed"
  render_source_template linux amd64 fedora 44 "$hook_template" "$fedora_changed"
  cp "$template_backup" "$PUBLIC_SOURCE/$config_template"
  cmp -s "$darwin_hook" "$darwin_changed" && fail "Darwin mise config changes do not rerun the hook"
  cmp -s "$fedora_hook" "$fedora_changed" && fail "Fedora mise config changes do not rerun the hook"

  printf 'ok: shared mise toolchain contract\n'
}

check_bob_contract() {
  local hook=.chezmoiscripts/run_onchange_after_20-setup-neovim.sh.tmpl
  local mise_hook=run_onchange_after_10-install-mise-tools.sh.tmpl
  local bob_hook=${hook##*/}
  local pi_hook=run_onchange_after_30-setup-pi.sh.tmpl
  local old_hook="$PUBLIC_SOURCE/.chezmoiscripts/run_once_after_20-setup-neovim.sh.tmpl"
  local shell_config="$PUBLIC_SOURCE/dot_config/private_zsh/config/zz-bob.zsh"
  local bob_config="$PUBLIC_SOURCE/dot_config/bob/config.toml"
  local darwin_hook="$WORK/bob-darwin-hook.sh"
  local fedora_hook="$WORK/bob-fedora-hook.sh"
  local installation_surfaces="$WORK/neovim-installation-surfaces"
  local competing_probe="$WORK/competing-neovim-probe.sh"
  local competing_pattern='^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*(([^[:space:]]*/)?brew|"\$brew")[[:space:]]+install[[:space:]].*neovim|^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*(sudo[[:space:]]+)?dnf[[:space:]]+install[[:space:]].*neovim|^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*(mise|"\$mise"|"\$mise_bin")[[:space:]]+(install|use)[[:space:]].*neovim'

  [[ -f "$PUBLIC_SOURCE/$hook" ]] || fail "missing Bob-managed Neovim hook"
  [[ -f "$PUBLIC_SOURCE/.chezmoiscripts/$mise_hook" ]] || fail "missing mise toolchain hook"
  [[ -f "$PUBLIC_SOURCE/.chezmoiscripts/$pi_hook" ]] || fail "missing Pi setup hook"
  [[ ! -e "$old_hook" ]] || fail "legacy Neovim installation hook remains"
  [[ -f "$shell_config" && -f "$bob_config" ]] || fail "missing Bob configuration"
  python3 - "$bob_config" <<'PY'
import pathlib
import sys
import tomllib
assert tomllib.loads(pathlib.Path(sys.argv[1]).read_text()) == {"add_neovim_binary_to_path": False}
PY
  [[ "${mise_hook#*_after_}" < "${bob_hook#*_after_}" \
    && "${bob_hook#*_after_}" < "${pi_hook#*_after_}" ]] || \
    fail "mise, Bob, and Pi after-hooks are ordered incorrectly"

  render_source_template darwin arm64 '' '' "$hook" "$darwin_hook"
  render_source_template linux amd64 fedora 44 "$hook" "$fedora_hook"
  bash -n "$darwin_hook"
  bash -n "$fedora_hook"

  grep -Fq 'channel=stable' "$PUBLIC_SOURCE/$hook" || fail "Bob channel is not declared stable"
  grep -Fq 'export BOB_CONFIG="$HOME/.config/bob/config.toml"' "$PUBLIC_SOURCE/$hook" || \
    fail "Bob hook does not use the noninteractive managed config"
  grep -Fq '"$bob_bin" use "$channel"' "$PUBLIC_SOURCE/$hook" || \
    fail "Bob hook does not idempotently install/use its channel"
  grep -Fq '$HOME/.local/share/bob/nvim-bin/nvim' "$PUBLIC_SOURCE/$hook" || \
    fail "Bob hook does not verify the managed Neovim path"
  grep -Fq '"$nvim_bin" --clean --headless '\''+qa'\''' "$PUBLIC_SOURCE/$hook" || \
    fail "Bob hook does not run a terminating managed Neovim smoke"
  grep -Fq 'bob_prefix=$("$brew" --prefix bob)' "$darwin_hook" || \
    fail "macOS Bob ownership is not Homebrew-derived"
  grep -Fq '"$mise_bin" which bob' "$fedora_hook" || \
    fail "Fedora Bob ownership is not mise-derived"
  if grep -Eq 'bob (uninstall|erase)' "$PUBLIC_SOURCE/$hook"; then
    fail "destructive Bob rollback behavior remains"
  fi
  find "$PUBLIC_SOURCE/.chezmoiscripts" -type f -print >"$installation_surfaces"
  find "$PUBLIC_SOURCE" -maxdepth 1 -type f -name 'run_*' -print >>"$installation_surfaces"
  printf '%s\n' "$PUBLIC_SOURCE/install.sh" >>"$installation_surfaces"
  if xargs grep -E "$competing_pattern" <"$installation_surfaces" >/dev/null 2>&1; then
    fail "competing direct Neovim installer remains"
  fi
  printf '%s\n' 'MISE_GLOBAL_CONFIG_FILE="$config" "$mise_bin" use neovim@stable' >"$competing_probe"
  grep -Eq "$competing_pattern" "$competing_probe" || \
    fail "competing Neovim scanner misses environment-prefixed mise commands"

  grep -Fq 'export BOB_CONFIG="$HOME/.config/bob/config.toml"' "$shell_config" || \
    fail "interactive Bob commands do not use the managed config"
  grep -Fq 'export PATH="$HOME/.local/share/bob/nvim-bin:$PATH"' "$shell_config" || \
    fail "Bob Neovim path does not precede native package paths"
  if grep -Fq 'neovim' "$PUBLIC_SOURCE/packages/Brewfile" \
    || grep -Fq 'neovim' "$PUBLIC_SOURCE/packages/fedora.txt"; then
    fail "native package manifest competes with Bob for Neovim"
  fi

  printf 'ok: Bob-managed Neovim authority contract\n'
}

check_neovim_contract() {
  local tooling="$PUBLIC_SOURCE/dot_config/nvim/lua/plugins/tooling.lua"

  [[ -f "$tooling" ]] || fail "missing headless Neovim tooling policy"
  grep -Fq 'local headless = #vim.api.nvim_list_uis() == 0' "$tooling" || \
    fail "Neovim tooling policy does not detect headless startup"
  grep -Fq '"mason-org/mason.nvim"' "$tooling" || \
    fail "headless Neovim policy does not cover Mason installs"
  grep -Fq '"nvim-treesitter/nvim-treesitter"' "$tooling" || \
    fail "headless Neovim policy does not cover Treesitter installs"
  [[ $(grep -Fc 'if headless then' "$tooling") -eq 2 ]] || \
    fail "headless Neovim policy does not guard both asynchronous installers"
  [[ $(grep -Fc 'opts.ensure_installed = {}' "$tooling") -eq 2 ]] || \
    fail "headless Neovim startup still schedules asynchronous installs"
  grep -Fxq gcc "$PUBLIC_SOURCE/packages/fedora.txt" || \
    fail "Fedora lacks the nvim-treesitter C compiler prerequisite"
  grep -Fxq tree-sitter-cli "$PUBLIC_SOURCE/packages/fedora.txt" || \
    fail "Fedora lacks the nvim-treesitter CLI prerequisite"
  grep -Fq 'brew "tree-sitter-cli"' "$PUBLIC_SOURCE/packages/Brewfile" || \
    fail "macOS lacks the nvim-treesitter CLI prerequisite"

  printf 'ok: headless Neovim tooling contract\n'
}

check_shell_contract() {
  local aliases_template=dot_config/private_zsh/aliases.zsh.tmpl
  local path_template=dot_config/private_zsh/path.zsh.tmpl
  local darwin_aliases="$WORK/aliases-darwin.zsh"
  local fedora_aliases="$WORK/aliases-fedora.zsh"
  local darwin_path="$WORK/path-darwin.zsh"
  local fedora_path="$WORK/path-fedora.zsh"
  local rendered_shell_file

  [[ -f "$PUBLIC_SOURCE/$aliases_template" ]] || fail "missing platform-rendered shell aliases"
  [[ ! -e "$PUBLIC_SOURCE/dot_config/private_zsh/aliases.zsh" ]] || \
    fail "untemplated platform aliases remain"

  render_source_template darwin arm64 '' '' "$aliases_template" "$darwin_aliases"
  render_source_template linux amd64 fedora 44 "$aliases_template" "$fedora_aliases"
  render_source_template darwin arm64 '' '' "$path_template" "$darwin_path"
  render_source_template linux amd64 fedora 44 "$path_template" "$fedora_path"
  for rendered_shell_file in "$darwin_aliases" "$fedora_aliases" "$darwin_path" "$fedora_path"; do
    zsh -n "$rendered_shell_file"
  done

  grep -Fq 'alias copy="pbcopy"' "$darwin_aliases" || fail "macOS copy alias is not native"
  grep -Fq 'alias o="open"' "$darwin_aliases" || fail "macOS open alias is not native"
  grep -Fq 'alias copy="wl-copy"' "$fedora_aliases" || fail "Fedora copy alias is not Wayland-native"
  grep -Fq 'alias o="xdg-open"' "$fedora_aliases" || fail "Fedora open alias is not native"
  ! grep -Eq 'mvim|VDCAssistant|pbcopy|alias o="open"' "$fedora_aliases" || \
    fail "macOS-only alias leaked into Fedora"
  ! grep -Eq 'CMUX_HOME|OBSIDIAN_HOME|/Applications|linuxbrew' "$fedora_path" || \
    fail "macOS/Linuxbrew runtime path leaked into Fedora"
  ! grep -Fq 'CMUX_HOME' "$darwin_path" || fail "cmux remains in shared shell runtime"
  [[ ! -e "$PUBLIC_SOURCE/dot_config/private_zsh/config/bob.zsh" ]] || \
    fail "Bob path still loads before mise activation"
  grep -Fq 'export PATH="$HOME/.local/share/bob/nvim-bin:$PATH"' \
    "$PUBLIC_SOURCE/dot_config/private_zsh/config/zz-bob.zsh" || \
    fail "Bob path precedence was lost"
  grep -Fq 'if (( $+commands[mise] ));' \
    "$PUBLIC_SOURCE/dot_config/private_zsh/config/mise-en-place.zsh" || \
    fail "mise shell activation is not guarded"
  grep -Fq 'path=("$HOME/.local/bin" ${path:#"$HOME/.local/bin"})' \
    "$PUBLIC_SOURCE/dot_config/private_zsh/config/rust.zsh" || \
    fail "Cargo activation can shadow release-installed user binaries"
  [[ mise-en-place.zsh < zz-bob.zsh ]] || fail "Bob path must load after mise activation"

  printf 'ok: platform-correct shared shell contract\n'
}

check_fedora_shell_startup() {
  local home="$WORK/rendered-linux"
  local zsh_bin

  zsh_bin=$(command -v zsh)
  mkdir -p \
    "$home/.cargo/bin" \
    "$home/.local/bin" \
    "$home/.local/share/mise/shims" \
    "$home/.local/share/bob/nvim-bin"
  cat >"$home/.local/bin/mise" <<'EOF'
#!/bin/sh
if [ "${1:-}" = activate ]; then
  printf '%s\n' 'export PATH="$HOME/.local/share/mise/shims:$PATH"'
fi
EOF
  cat >"$home/.local/share/mise/shims/nvim" <<'EOF'
#!/bin/sh
exit 0
EOF
  cat >"$home/.local/share/bob/nvim-bin/nvim" <<'EOF'
#!/bin/sh
exit 0
EOF
  cat >"$home/.cargo/env" <<'EOF'
export PATH="$HOME/.cargo/bin:$PATH"
EOF
  cat >"$home/.cargo/bin/pi-hunk-review-core" <<'EOF'
#!/bin/sh
printf '%s\n' 'pi-hunk-review-core v0.1.0'
EOF
  cat >"$home/.local/bin/pi-hunk-review-core" <<'EOF'
#!/bin/sh
printf '%s\n' 'pi-hunk-review-core v0.1.1'
EOF
  chmod +x \
    "$home/.cargo/bin/pi-hunk-review-core" \
    "$home/.local/bin/mise" \
    "$home/.local/bin/pi-hunk-review-core" \
    "$home/.local/share/mise/shims/nvim" \
    "$home/.local/share/bob/nvim-bin/nvim"

  local optional_probe_output
  optional_probe_output=$(env -i \
    HOME="$home" \
    PATH=/usr/bin:/bin \
    "$zsh_bin" -dfc '
      which() {
        print -u2 -- "/usr/bin/which: no op in ($PATH)"
        return 1
      }
      source "$HOME/.config/zsh/config/op.zsh"
    ' 2>&1)
  [[ -z "$optional_probe_output" ]] || \
    fail "missing optional shell tools write startup errors: $optional_probe_output"

  printf '%s\n' 'export PORTABILITY_LOCALRC=loaded' >"$home/.localrc"
  env -i \
    HOME="$home" \
    ZDOTDIR="$home" \
    PATH=/usr/bin:/bin \
    "$zsh_bin" -dfc '
      source "$ZDOTDIR/.zshrc"
      [[ $PORTABILITY_LOCALRC == loaded ]]
      [[ ${aliases[copy]} == wl-copy ]]
      [[ ${aliases[o]} == xdg-open ]]
      [[ ${aliases[v]} == nvim ]]
      [[ $path[1] == "$HOME/.local/share/bob/nvim-bin" ]]
      [[ $(command -v nvim) == "$HOME/.local/share/bob/nvim-bin/nvim" ]]
      [[ $(command -v pi-hunk-review-core) == "$HOME/.local/bin/pi-hunk-review-core" ]]
      [[ $(pi-hunk-review-core --version) == "pi-hunk-review-core v0.1.1" ]]
      [[ -z ${CMUX_HOME+x} ]]
      [[ $PATH != *::* ]]
    '
  rm -f "$home/.localrc"
  printf 'ok: fresh Fedora zsh startup\n'
}

contains_active_cmux_reference() {
  local file=$1
  local relative_path=$2
  local pattern=$3

  if [[ "$relative_path" == dot_config/herdr/config.toml ]]; then
    grep -Ei "$pattern" "$file" 2>/dev/null \
      | grep -Fvx \
        -e "# Match cmux's spatial navigation: horizontal movement changes tabs;" \
        -e "# Jump directly to a tab by number, matching cmux's surface selection." \
      >/dev/null
    return
  fi
  grep -Eiq "$pattern" "$file" 2>/dev/null
}

check_agent_contract() {
  local settings="$PUBLIC_SOURCE/.data/pi/agent/settings.json"
  local mcp="$PUBLIC_SOURCE/.data/pi/agent/mcp.json"
  local opencode="$PUBLIC_SOURCE/dot_config/opencode/opencode.jsonc"
  local hook=.chezmoiscripts/run_onchange_after_30-setup-pi.sh.tmpl
  local old_hook="$PUBLIC_SOURCE/.chezmoiscripts/run_once_after_30-setup-pi.sh.tmpl"
  local darwin_hook="$WORK/pi-darwin-hook.sh"
  local fedora_hook="$WORK/pi-fedora-hook.sh"
  local changed_hook="$WORK/pi-changed-hook.sh"
  local settings_backup="$WORK/pi-settings-backup.json"
  local settings_changed="$WORK/pi-settings-changed.json"
  local mise_home="$WORK/pi-fedora-home"
  local mise_stub="$mise_home/.local/bin/mise"
  local gh_stub="$mise_home/.local/bin/gh"
  local fake_pi="$mise_home/.local/share/mise/pi"
  local mise_stub_log="$WORK/mise-stub.log"
  local mise_stub_expected="$WORK/mise-stub.expected"
  local gh_stub_log="$WORK/gh-stub.log"
  local gh_stub_expected="$WORK/gh-stub.expected"
  local active_runtime_files="$WORK/active-runtime-files"
  local cmux_heading_probe="$WORK/cmux-heading-probe.md"
  local cmux_uppercase_probe="$WORK/cmux-uppercase-probe.md"
  local cmux_pattern='pi-cmux|CMUX_HOME|skills/cmux|(^|[^[:alnum:]_-])cmux([^[:alnum:]_-]|$)'
  local relative_path runtime_file

  [[ -f "$settings" && -f "$mcp" && -f "$opencode" ]] || fail "missing public agent configuration"
  [[ -f "$PUBLIC_SOURCE/$hook" ]] || fail "missing Pi package reconciliation hook"
  [[ ! -e "$old_hook" ]] || fail "warning-only Pi setup hook remains"

  [[ ! -e "$PUBLIC_SOURCE/dot_pi/agent/skills/cmux" \
    && ! -L "$PUBLIC_SOURCE/dot_pi/agent/skills/cmux" ]] || \
    fail "cmux skill path remains in managed runtime"
  : >"$active_runtime_files"
  while IFS= read -r -d '' runtime_file; do
    relative_path=${runtime_file#"$PUBLIC_SOURCE/"}
    is_runtime_source "$relative_path" || continue
    printf '%s\n' "$runtime_file" >>"$active_runtime_files"
  done < <(find "$PUBLIC_SOURCE" \( -type f -o -type l \) -print0)
  if grep -Ei 'pi-cmux|CMUX_HOME|skills/cmux|(^|/)cmux(/|$)' "$active_runtime_files" >/dev/null 2>&1; then
    fail "cmux remains in an active managed runtime path"
  fi
  while IFS= read -r runtime_file; do
    relative_path=${runtime_file#"$PUBLIC_SOURCE/"}
    if contains_active_cmux_reference "$runtime_file" "$relative_path" "$cmux_pattern"; then
      fail "cmux remains in active managed runtime configuration"
    fi
  done <"$active_runtime_files"
  printf '%s\n' '### Use cmux' >"$cmux_heading_probe"
  contains_active_cmux_reference "$cmux_heading_probe" dot_pi/agent/AGENTS.md "$cmux_pattern" || \
    fail "cmux scanner ignores active Markdown headings"
  printf '%s\n' '### Use CMUX' >"$cmux_uppercase_probe"
  contains_active_cmux_reference "$cmux_uppercase_probe" dot_pi/agent/AGENTS.md "$cmux_pattern" || \
    fail "cmux scanner is case-sensitive"

  python3 - "$settings" "$mcp" "$opencode" <<'PY'
import json
import pathlib
import re
import sys

settings=json.loads(pathlib.Path(sys.argv[1]).read_text())
mcp=json.loads(pathlib.Path(sys.argv[2]).read_text())
opencode=json.loads(pathlib.Path(sys.argv[3]).read_text())
expected_packages=[
    "git:github.com/nicobailon/pi-mcp-adapter",
    "git:github.com/HazAT/glimpse",
    "git:github.com/Attamusc/pi-interactive-subagents@f609e7f0a5ab935dc36d3c805928536978563579",
    "git:github.com/HazAT/pi-autoresearch",
    "git:github.com/carderne/pi-nvim",
    "git:github.com/Attamusc/pi-herdr@d975127b94df95a615282ece14b02865b9a2c3d9",
    "git:github.com/Attamusc/pi-television@c3826bc268e05a1045e1d2339fc5a0cd3fd17a7e",
    "git:github.com/Attamusc/pi-hunk-review@v0.1.1",
]
assert settings["packages"] == expected_packages
assert settings["extensions"] == ["+extensions/smart-sessions/index.ts"]
assert len(settings["packages"]) == len(set(settings["packages"]))
for package in settings["packages"]:
    assert "pi-cmux" not in package
for package in settings["packages"]:
    if package == "git:github.com/Attamusc/pi-hunk-review@v0.1.1":
        continue
    if package.startswith("git:github.com/Attamusc/"):
        assert re.search(r"@[0-9a-f]{40}$", package)
assert mcp == {"settings": {"samplingAutoApprove": True}, "mcpServers": {}}
assert opencode == {"$schema": "https://opencode.ai/config.json", "model": "github-copilot/gpt-5.6-sol"}
for document in (settings, mcp, opencode):
    encoded=json.dumps(document)
    assert "/Users/" not in encoded and "/home/" not in encoded
PY

  render_source_template darwin arm64 '' '' "$hook" "$darwin_hook"
  render_source_template linux amd64 fedora 44 "$hook" "$fedora_hook"
  bash -n "$darwin_hook"
  bash -n "$fedora_hook"
  grep -Fq '# Public Pi settings SHA-256:' "$PUBLIC_SOURCE/$hook" || \
    fail "Pi hook is not content-addressed to public settings"
  grep -Fq '# Private Pi settings SHA-256:' "$PUBLIC_SOURCE/$hook" || \
    fail "Pi hook is not content-addressed to private settings"
  grep -Fq '"$pi_bin" update --extensions' "$darwin_hook" || \
    fail "macOS Pi hook does not reconcile configured extensions"
  grep -Fq 'brew_prefix=$("$brew" --prefix)' "$darwin_hook" || \
    fail "macOS Pi ownership is not Homebrew-derived"
  grep -Fq '"$mise_bin" which pi' "$fedora_hook" || fail "Fedora Pi ownership is not mise-derived"
  grep -Fq '"$mise_bin" exec -- pi --version' "$fedora_hook" || \
    fail "Fedora Pi version check does not run inside mise"
  grep -Fq '"$mise_bin" exec -- pi update --extensions' "$fedora_hook" || \
    fail "Fedora Pi reconciliation does not run inside mise"
  grep -Fq 'gh auth status --hostname github.com' "$fedora_hook" || \
    fail "Pi hook does not require authenticated private-package access"
  grep -Fq 'GIT_CONFIG_GLOBAL="$local_git_config" gh auth setup-git' "$fedora_hook" || \
    fail "Pi hook does not configure GitHub credentials in the local Git seam"
  grep -Fq 'GIT_TERMINAL_PROMPT=0 MISE_GLOBAL_CONFIG_FILE=' "$fedora_hook" || \
    fail "Fedora Pi reconciliation can prompt for a GitHub password"
  grep -Fq 'GIT_TERMINAL_PROMPT=0 "$pi_bin" update --extensions' "$darwin_hook" || \
    fail "macOS Pi reconciliation can prompt for a GitHub password"
  ! grep -Eq '"\$pi_bin" install([[:space:]]|$)' "$PUBLIC_SOURCE/$hook" || \
    fail "Pi hook uses install without a package source"
  if grep -Eq '\|\|[[:space:]]*(:|true|echo)|not found.*skipping|Warning:' "$PUBLIC_SOURCE/$hook"; then
    fail "Pi package reconciliation suppresses required failures"
  fi

  mkdir -p "$(dirname "$mise_stub")" "$(dirname "$fake_pi")" "$mise_home/.config/mise"
  : >"$mise_home/.config/mise/config.toml"
  cat >"$mise_stub" <<'EOF'
#!/bin/sh
expected="$HOME/.config/mise/config.toml"
[ "${MISE_GLOBAL_CONFIG_FILE:-}" = "$expected" ] || exit 91
printf '%s\n' "$*" >>"$MISE_STUB_LOG"
if [ "${1:-}" = which ] && [ "${2:-}" = pi ]; then
  printf '%s\n' "$HOME/.local/share/mise/pi"
  exit 0
fi
if [ "${1:-}" = exec ]; then
  exit 0
fi
exit 92
EOF
  cat >"$gh_stub" <<'EOF'
#!/bin/sh
printf '%s\n' "$*" >>"$GH_STUB_LOG"
if [ "$*" = "auth status --hostname github.com" ]; then
  exit 0
fi
if [ "$*" = "auth setup-git" ] && [ "${GIT_CONFIG_GLOBAL:-}" = "$HOME/.gitconfig.local" ]; then
  exit 0
fi
exit 94
EOF
  cat >"$fake_pi" <<'EOF'
#!/bin/sh
exit 93
EOF
  chmod +x "$mise_stub" "$gh_stub" "$fake_pi"
  HOME="$mise_home" \
    MISE_STUB_LOG="$mise_stub_log" \
    GH_STUB_LOG="$gh_stub_log" \
    PATH="$mise_home/.local/bin:/usr/bin:/bin" \
    bash "$fedora_hook" >/dev/null
  cat >"$mise_stub_expected" <<'EOF'
which pi
exec -- pi --version
exec -- pi update --extensions
EOF
  diff -u "$mise_stub_expected" "$mise_stub_log" >/dev/null || \
    fail "Fedora Pi mise execution arguments are incorrect"
  cat >"$gh_stub_expected" <<'EOF'
auth status --hostname github.com
auth setup-git
EOF
  diff -u "$gh_stub_expected" "$gh_stub_log" >/dev/null || \
    fail "Pi hook GitHub credential setup arguments are incorrect"
  [[ -f "$mise_home/.gitconfig.local" ]] || fail "Pi hook did not create the machine-local Git seam"
  [[ $(python3 -c 'import os,stat,sys; print(f"{stat.S_IMODE(os.stat(sys.argv[1]).st_mode):o}")' \
      "$mise_home/.gitconfig.local") == 600 ]] || fail "Pi hook local Git seam is not mode 0600"

  cp "$settings" "$settings_backup"
  jq '.portabilityDigestProbe = true' "$settings" >"$settings_changed"
  cp "$settings_changed" "$settings"
  render_source_template linux amd64 fedora 44 "$hook" "$changed_hook"
  cp "$settings_backup" "$settings"
  cmp -s "$fedora_hook" "$changed_hook" && fail "Pi settings changes do not rerun package reconciliation"

  printf 'ok: portable public Pi and agent configuration\n'
}

check_herdr_contract() {
  local adr1="$PUBLIC_SOURCE/docs/adr/0001-additive-migration-cmux-herdr.md"
  local adr2="$PUBLIC_SOURCE/docs/adr/0002-fork-strategy-pi-interactive-subagents.md"
  local adr6="$PUBLIC_SOURCE/docs/adr/0006-herdr-is-the-sole-supported-multiplexer.md"
  local agents="$PUBLIC_SOURCE/dot_pi/agent/AGENTS.md"
  local lifecycle_files="$WORK/herdr-lifecycle-files"
  local lifecycle_probe="$WORK/herdr-lifecycle-probe.sh"
  local lifecycle_pattern='systemctl([^#]*)(enable|start)([^#]*)herdr|(^|[;&|[:space:]])herdr[[:space:]]+(serve|server|daemon|start-server)([;&|[:space:]]|$)'
  local relative_path runtime_file

  [[ -f "$adr1" && -f "$adr2" && -f "$adr6" && -f "$agents" ]] || \
    fail "Herdr architecture decision set is incomplete"
  grep -Fq '**Status:** Superseded' "$adr1" || fail "ADR-0001 still claims the active mux contract"
  grep -Fq '**Superseded by:** ADR-0006' "$adr1" || fail "ADR-0001 lacks its Herdr-only forward reference"
  grep -Fq '**Superseded by:** ADR-0006 (cmux preservation and runtime rollback only)' "$adr2" || \
    fail "ADR-0002 does not delimit its superseded runtime contract"
  grep -Fq '**Status:** Accepted' "$adr6" || fail "Herdr-only ADR is not accepted"
  grep -Fq 'sole multiplexer for Pi and visible subagent sessions' "$adr6" || \
    fail "Herdr-only ADR does not state the sole mux contract"
  grep -Fq 'Rollback is version-control-based' "$adr6" || \
    fail "Herdr-only ADR lacks the version-control rollback boundary"
  grep -Fq 'Herdr as its sole Pi/subagent multiplexer' "$agents" || \
    fail "active agent guidance does not name Herdr as sole mux"
  grep -Fq 'tmux as a supported fallback' "$agents" || \
    fail "active agent guidance does not delimit tmux ownership"
  grep -Fq 'Herdr starts its per-user server automatically; do not add a second lifecycle manager.' "$agents" || \
    fail "active agent guidance does not preserve Herdr's sole lifecycle manager"

  : >"$lifecycle_files"
  while IFS= read -r -d '' runtime_file; do
    relative_path=${runtime_file#"$PUBLIC_SOURCE/"}
    is_runtime_source "$relative_path" || continue
    printf '%s\n' "$runtime_file" >>"$lifecycle_files"
  done < <(find "$PUBLIC_SOURCE" \( -type f -o -type l \) -print0)
  if grep -Ei 'systemd([^/]*|/).*herdr|herdr.*\.service' "$lifecycle_files" >/dev/null 2>&1 \
    || xargs grep -Ei "$lifecycle_pattern" <"$lifecycle_files" >/dev/null 2>&1; then
    fail "a second managed Herdr lifecycle path remains"
  fi
  printf '%s\n' 'systemctl --user enable --now herdr.service' >"$lifecycle_probe"
  grep -Eiq "$lifecycle_pattern" "$lifecycle_probe" || \
    fail "Herdr lifecycle scanner misses managed systemd startup"

  printf 'ok: Herdr-only multiplexer decision contract\n'
}

check_hunk_review_contract() {
  local fixture="$PUBLIC_SOURCE/tests/portability/fixtures/pi-hunk-review-release.json"
  local settings="$PUBLIC_SOURCE/.data/pi/agent/settings.json"
  local plugin="$PUBLIC_SOURCE/dot_config/nvim/lua/plugins/pi-hunk-review.lua"
  local lock="$PUBLIC_SOURCE/.data/nvim/lazy-lock.json"
  local hook=.chezmoiscripts/run_onchange_after_15-install-pi-hunk-review-core.sh.tmpl
  local hook_name=${hook##*/}
  local bob_hook=run_onchange_after_20-setup-neovim.sh.tmpl
  local darwin_arm_hook="$WORK/hunk-core-darwin-arm64.sh"
  local darwin_x64_hook="$WORK/hunk-core-darwin-x64.sh"
  local fedora_hook="$WORK/hunk-core-fedora.sh"
  local rendered_hook

  [[ -f "$fixture" && -f "$settings" && -f "$plugin" && -f "$lock" ]] || \
    fail "pi-hunk-review integration inputs are incomplete"
  [[ -f "$PUBLIC_SOURCE/$hook" ]] || fail "missing pi-hunk-review core release hook"
  [[ "${hook_name#*_after_}" < "${bob_hook#*_after_}" ]] || \
    fail "pi-hunk-review core must install before Bob/Neovim setup"

  python3 - "$fixture" "$settings" "$lock" <<'PY'
import json
import pathlib
import sys

fixture=json.loads(pathlib.Path(sys.argv[1]).read_text())
settings=json.loads(pathlib.Path(sys.argv[2]).read_text())
lock=json.loads(pathlib.Path(sys.argv[3]).read_text())
expected={
    "tag": "v0.1.1",
    "commit": "7330ad702860bbe4e0032f1550d7ce4f123e0be1",
    "package": "git:github.com/Attamusc/pi-hunk-review@v0.1.1",
    "visibility": "private",
    "access": "github-authenticated",
    "checksumsSha256": "4d13bf5e2c132bb9078510b828ee8fedc0bb751b73333639ec6f86459038bd3d",
    "assets": {
        "pi-hunk-review-core-v0.1.1-aarch64-apple-darwin.tar.gz": "98ce47fc5d1eba10f9adec421b8b979f52dcd8aacb08e4e60c8a3ac71524cf8e",
        "pi-hunk-review-core-v0.1.1-x86_64-apple-darwin.tar.gz": "f14f994bf0c69600a070960ff098346df36a08e9ee32ef00e6b5f63b7794dc2e",
        "pi-hunk-review-core-v0.1.1-x86_64-unknown-linux-gnu.tar.gz": "89bf012a46c9ba96088af626ac9dfd7b4f821f591595ed7525d9d991d2b9185e",
    },
}
assert fixture == expected
assert settings["packages"].count(expected["package"]) == 1
assert lock["pi-hunk-review"] == {"branch": "main", "commit": expected["commit"]}
PY

  grep -Fq '"Attamusc/pi-hunk-review"' "$plugin" || fail "Neovim does not use the remote hunk-review repository"
  grep -Fq 'tag = "v0.1.1"' "$plugin" || fail "Neovim hunk-review tag is not pinned"
  grep -Fq 'init = function(plugin)' "$plugin" || fail "Neovim hunk-review lacks nested runtime initialization"
  grep -Fq 'plugin.dir .. "/shells/nvim"' "$plugin" || fail "Neovim does not prepend the nested hunk-review runtime"
  grep -Fq 'cmd = { "PiHunks", "PiHunkNote", "PiHunkSubmit", "PiHunkReject" }' "$plugin" || \
    fail "Neovim hunk-review command contract drifted"
  if grep -Eq '(^|[[:space:]])dir[[:space:]]*=|/Users/|/home/' "$plugin"; then
    fail "Neovim hunk-review retains a fixed local checkout"
  fi

  render_source_template darwin arm64 '' '' "$hook" "$darwin_arm_hook"
  render_source_template darwin amd64 '' '' "$hook" "$darwin_x64_hook"
  render_source_template linux amd64 fedora 44 "$hook" "$fedora_hook"
  for rendered_hook in "$darwin_arm_hook" "$darwin_x64_hook" "$fedora_hook"; do
    bash -n "$rendered_hook"
    grep -Fq 'version=v0.1.1' "$rendered_hook" || fail "hunk-review core version is not pinned"
    grep -Fq 'checksums_sha256=4d13bf5e2c132bb9078510b828ee8fedc0bb751b73333639ec6f86459038bd3d' \
      "$rendered_hook" || fail "hunk-review checksum manifest is not pinned"
    grep -Fq 'gh auth status --hostname github.com' "$rendered_hook" || \
      fail "private hunk-review release lacks an authenticated GitHub precondition"
    grep -Fq 'gh release download "$version"' "$rendered_hook" || \
      fail "private hunk-review release is not downloaded through GitHub CLI"
    grep -Fq -- '--pattern SHA256SUMS' "$rendered_hook" || \
      fail "hunk-review checksum manifest is not requested"
    grep -Fq 'grep -Fx "$archive_sha256  $archive"' "$rendered_hook" || \
      fail "hunk-review archive is not verified against SHA256SUMS"
    grep -Fq 'install -m 755' "$rendered_hook" || fail "hunk-review core is not installed executable"
    ! grep -Eiq 'cargo|source.build' "$rendered_hook" || fail "hunk-review source-build fallback is forbidden"
  done
  grep -Fq 'archive=pi-hunk-review-core-v0.1.1-aarch64-apple-darwin.tar.gz' "$darwin_arm_hook" || \
    fail "Apple silicon hunk-review asset mapping is wrong"
  grep -Fq 'archive=pi-hunk-review-core-v0.1.1-x86_64-apple-darwin.tar.gz' "$darwin_x64_hook" || \
    fail "Intel macOS hunk-review asset mapping is wrong"
  grep -Fq 'archive=pi-hunk-review-core-v0.1.1-x86_64-unknown-linux-gnu.tar.gz' "$fedora_hook" || \
    fail "Fedora hunk-review asset mapping is wrong"

  printf 'ok: remote pi-hunk-review release contract\n'
}

check_documentation_contract() {
  local readme="$PUBLIC_SOURCE/README.md"
  local overlays="$PUBLIC_SOURCE/docs/private-overlays.md"
  local smoke="$PUBLIC_SOURCE/docs/fedora-smoke-checks.html"
  local instructions="$PUBLIC_SOURCE/.github/copilot-instructions.md"

  [[ -f "$readme" && -f "$overlays" && -f "$smoke" && -f "$instructions" ]] || \
    fail "supported-platform documentation is incomplete"
  for required in \
    '## Supported platforms' \
    '## Before bootstrap' \
    '## Bootstrap' \
    '### Package authority' \
    '## Machine-local configuration' \
    '## Preview and apply' \
    '## Focused smoke checks' \
    '## Rollback' \
    'macOS on Apple silicon or Intel' \
    'Fedora 44 on x86_64' \
    'Attamusc/pi-hunk-review' \
    'gh auth status --hostname github.com' \
    'scripts/check-portability.sh' \
    'chezmoi diff' \
    'chezmoi apply' \
    'docs/adr/0006-herdr-is-the-sole-supported-multiplexer.md' \
    'docs/private-overlays.md'; do
    grep -Fq "$required" "$readme" || fail "README is missing required documentation anchor: $required"
  done
  grep -Fq 'Private `packages` and `extensions` append to public arrays' "$overlays" || \
    fail "private overlay array semantics are undocumented"
  grep -Fq 'MCP maps merge by server key' "$overlays" || \
    fail "private MCP merge semantics are undocumented"
  grep -Fq 'Authenticate Git and `gh`' "$instructions" || \
    fail "agent bootstrap guidance omits private release authentication"
  if grep -Eiq '(Ubuntu|Codespaces|Linuxbrew).*(is|are)[[:space:]]+supported([[:space:].,]|$)' "$readme"; then
    fail "README advertises a retired platform or mux fallback"
  fi
  if grep -Fq 'zsh -lic' "$readme" "$smoke"; then
    fail "smoke guidance starts a nested login shell that Fedora clears on exit"
  fi

  printf 'ok: supported-platform and local-ownership documentation\n'
}

ci_contract_matches() {
  local workflow=$1

  jq -e '
    (keys | sort) == ["concurrency", "jobs", "name", "on", "permissions"] and
    .name == "Portability contracts" and
    (.on | keys | sort) == ["pull_request", "push", "workflow_dispatch"] and
    .on.pull_request == {} and
    .on.push == {"branches": ["main"]} and
    .on.workflow_dispatch == {} and
    .permissions == {"contents": "read"} and
    .concurrency == {
      "group": "portability-${{ github.ref }}",
      "cancel-in-progress": true
    } and
    (.jobs | keys) == ["check"] and
    (.jobs.check | keys | sort) == ["name", "runs-on", "steps", "timeout-minutes"] and
    .jobs.check.name == "Check repository contracts" and
    .jobs.check["runs-on"] == "ubuntu-latest" and
    .jobs.check["timeout-minutes"] == 10 and
    (.jobs.check.steps | length) == 3 and
    .jobs.check.steps[0] == {
      "name": "Check out repository",
      "uses": "actions/checkout@11d5960a326750d5838078e36cf38b85af677262"
    } and
    .jobs.check.steps[1].name == "Install checker dependencies" and
    (.jobs.check.steps[1].run | split("\n")) == [
      "sudo apt-get update",
      "sudo apt-get install --yes zsh",
      "sh -c \"$(curl -fsLS https://get.chezmoi.io)\" -- -b \"$HOME/.local/bin\"",
      "echo \"$HOME/.local/bin\" >>\"$GITHUB_PATH\""
    ] and
    .jobs.check.steps[2] == {
      "name": "Check portability contracts",
      "run": "scripts/check-portability.sh"
    }
  ' "$workflow" >/dev/null
}

check_ci_contract() {
  local workflow="$PUBLIC_SOURCE/.github/workflows/portability.yml"
  local probe="$WORK/portability-ci-probe.json"

  [[ -f "$workflow" ]] || fail "missing focused portability CI workflow"
  ci_contract_matches "$workflow" || fail "focused portability CI structure violates its exact contract"

  jq '.on.pull_request_target = {}' "$workflow" >"$probe"
  ! ci_contract_matches "$probe" || fail "CI contract permits pull_request_target"
  jq '.permissions.issues = "write"' "$workflow" >"$probe"
  ! ci_contract_matches "$probe" || fail "CI contract permits write permissions"
  jq 'del(.jobs.check["timeout-minutes"])' "$workflow" >"$probe"
  ! ci_contract_matches "$probe" || fail "CI contract permits a missing timeout"
  jq '.concurrency["cancel-in-progress"] = false' "$workflow" >"$probe"
  ! ci_contract_matches "$probe" || fail "CI contract permits disabled cancellation"
  jq '.jobs.check.steps[2].run = "# scripts/check-portability.sh"' "$workflow" >"$probe"
  ! ci_contract_matches "$probe" || fail "CI contract accepts a commented-out checker"
  jq '.jobs.check.steps[2].run = "bash ./install.sh"' "$workflow" >"$probe"
  ! ci_contract_matches "$probe" || fail "CI contract permits bootstrap execution"
  jq '.jobs.check.steps[2].run = "chezmoi --source . apply"' "$workflow" >"$probe"
  ! ci_contract_matches "$probe" || fail "CI contract permits alternate apply syntax"

  printf 'ok: focused portability CI contract\n'
}

render_platform() {
  local platform=$1
  local architecture=$2
  local os_release=$3
  local rendered="$WORK/rendered-$platform"
  local archive="$WORK/$platform.tar"
  local config="$WORK/config/chezmoi.toml"
  local state="$WORK/state-$platform.boltdb"
  local override source_only

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
  for source_only in README.md docs packages research scripts tests; do
    [[ ! -e "$rendered/$source_only" ]] || fail "source-only path leaked into $platform home: $source_only"
  done
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
check_mise_contract
check_bob_contract
check_neovim_contract
check_shell_contract
check_agent_contract
check_herdr_contract
check_hunk_review_contract
check_documentation_contract
check_ci_contract
rm -- "$PUBLIC_SOURCE/.chezmoi.toml.tmpl"
check_merge_json_fixtures
check_package_manifests
render_platform darwin arm64 ''
render_platform linux amd64 fedora
check_fedora_shell_startup

printf 'ok: portability checks passed\n'
