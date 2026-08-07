# Dotfiles

Shared terminal configuration for macOS and Fedora 44, managed with
[chezmoi](https://www.chezmoi.io/).

The repository keeps the same shell, editor, version-control, and Pi workflow
on both systems. Package versions and install paths may differ by platform.
GUI applications and desktop-environment configuration are not part of the
shared contract.

## Supported platforms

- macOS on Apple silicon or Intel
- Fedora 44 on x86_64

Other Linux distributions, older Fedora releases, Windows bootstrap,
Codespaces, and Linuxbrew are unsupported. Bootstrap stops before applying
files on an unsupported platform.

Herdr is the sole configured Pi/subagent multiplexer. See
[ADR-0006](docs/adr/0006-herdr-is-the-sole-supported-multiplexer.md).
tmux remains available as an interactive terminal tool, not an agent fallback.

## Before bootstrap

The `Attamusc/pi-hunk-review` package and release are private. Authenticate Git
and GitHub CLI before running the dotfiles installer on a new host. The account
must be able to clone that repository and download its release assets.

```sh
gh auth login
gh auth setup-git
gh auth status --hostname github.com
```

Install both Git and `gh` manually first when the new host lacks them. Fedora
can use `sudo dnf install gh git`. On macOS, install the Command Line Tools for
Git (`xcode-select --install`) and install `gh` through Homebrew when available
or GitHub's supported binary distribution. The bootstrap deliberately fails
rather than embedding or prompting for a token.

## Bootstrap

Clone the repository, enter it, and run:

```sh
./install.sh
```

`install.sh` verifies the platform, bootstraps chezmoi, and runs the ordered
lifecycle:

1. Install Homebrew when it is missing on macOS.
2. Install native packages from `packages/Brewfile` or `packages/fedora.txt`.
3. Configure Fedora's login shell and install TPM.
4. Apply managed files.
5. Install the mise toolchain.
6. Install the checksum-verified pi-hunk-review core release.
7. Activate Bob's stable Neovim.
8. Reconcile pinned Pi packages.

Package-manager, download, checksum, and command-verification failures stop the
responsible stage. Re-running `./install.sh` resumes the idempotent stages.

## Shared command baseline

The shared workflow includes:

- Shell: `zsh`, Sheldon, Starship, zoxide
- Core CLI: bat, eza, fd, fzf, ripgrep, jq, tree, curl, wget
- Terminal/editor: Herdr, tmux, TPM, Bob-managed Neovim, Helix
- Version control: Git, gh, jj, delta, tig, ghq, git-filter-repo, lazygit, jjui
- Agents: Pi, OpenCode, Copilot CLI
- Runtime: mise-managed Node, npm, and npx
- Remote shell: mosh

### Package authority

| Capability | macOS | Fedora 44 |
|---|---|---|
| Native terminal tools | Homebrew | DNF |
| Node | mise | mise |
| Fedora package gaps | — | mise/Aqua |
| Pi | Homebrew | mise npm backend |
| Copilot CLI | Homebrew cask | mise npm backend |
| Neovim | Bob stable | Bob stable |
| pi-hunk-review core | Authenticated release archive | Authenticated release archive |

Bob keeps previously installed Neovim versions as the rollback lane. Removing a
package from a manifest does not uninstall it from an existing host.

## Machine-local configuration

Ignored local files extend the public baseline without publishing work or
machine-specific values:

- `.data-private/` — private Pi/MCP settings merged by chezmoi
- `.local-skills/` — untracked skills linked into the active skill roots
- `~/.gitconfig.local` — credentials, signing, and work-host Git settings
- `~/.localrc` — shell additions loaded after shared zsh configuration

These files are not synchronized or backed up by this repository. Back them up
separately if they are needed to rebuild a machine. See
[Machine-local overlays](docs/private-overlays.md) for merge semantics and safe
examples.

Specialist packages are also machine-owned: cloud/Kubernetes CLIs, container
engines, language toolchains and servers, QMK, Ollama, and OCR/media tooling are
outside the shared manifests.

## Preview and apply

Run the non-mutating repository contract check first:

```sh
scripts/check-portability.sh
```

Then inspect managed host changes:

```sh
chezmoi status
chezmoi diff
```

Apply only after reviewing the diff:

```sh
chezmoi apply
```

The portability check renders isolated macOS and Fedora configurations. It does
not install packages or apply home-directory state. Negative tests run only in
temporary repositories, and protected ignored state is compared before and
after mutation-capable phases.

## Focused smoke checks

After apply:

```sh
zsh -lic 'command -v herdr nvim hx pi opencode copilot gh jj tv mosh'
command -v nvim
nvim --headless '+qa'
pi list
gh auth status --hostname github.com
```

Start Pi inside Herdr, open one child agent in a visible pane, then detach and
reattach before considering a new host complete. Fedora runtime and SSH
detach/reattach must be verified on the real machine; static macOS CI is not a
substitute.

## Rollback

Configuration rollback is version-control-based: revert the relevant commit and
review `chezmoi diff` before applying it. Do not keep fallback package entries or
runtime compatibility shims in the public configuration.

For Neovim, select a previous Bob-managed version with `bob use <version>`.
Package removal and credential changes remain explicit manual operations.
