# Copilot instructions

## Bootstrap and validation commands

- Bootstrap or re-apply the dotfiles from the repo root with `./install.sh`. This is the canonical entrypoint used by the Linuxbrew cache workflow too.
- For non-destructive validation, use `chezmoi status`, `chezmoi diff`, and `chezmoi managed`.
- There is no repo-wide automated test or lint target today, so there is no single-test command to run. Validation is centered on `chezmoi` preview commands plus targeted checks for the files you changed.

## High-level architecture

- This repository is the source tree for a `chezmoi`-managed home directory. `install.sh` bootstraps `chezmoi` if needed, then hands off to `chezmoi init --apply --source=<repo>`.
- `.chezmoi.toml.tmpl` computes shared template data such as `headless`, `ephemeral`, and user identity. `.chezmoiscripts/` contains the ordered lifecycle hooks that do bootstrap work such as Homebrew install, TPM install, Linux-specific setup, and Neovim setup.
- Root-level `dot_*` files map to dotfiles in `$HOME`. `dot_config/**` contains application configs, and `dot_local/bin/executable_*` contains custom commands that are installed into `~/.local/bin`.
- Assistant configuration is split by tool: `dot_copilot/` is the source of truth for Copilot CLI instructions, MCP config, agents, and skills; `dot_config/opencode/` is the parallel source of truth for OpenCode instructions and MCP config.
- Neovim is a LazyVim setup under `dot_config/nvim`. Its `lua/config/lazy.lua` intentionally points `lazyvim.json` and `lazy-lock.json` at the `chezmoi` source tree so edits stay in the repo instead of drifting into the applied `~/.config/nvim`.

## Key conventions

- Follow `chezmoi` naming rules already used throughout the repo: `dot_` for dotfiles, `.tmpl` for templated files, `executable_` for scripts that must keep execute bits, and `private_` for private paths.
- Keep shell changes modular. `dot_zshrc.tmpl` is mainly a loader that sources `$ZSH/*.zsh`, `$ZSH/config/*.zsh`, and `$ZSH/completions/*.zsh`; new shell behavior usually belongs in those sourced files, not in the entrypoint.
- Keep bootstrap changes inside `.chezmoiscripts/` and preserve the numbered ordering. Later scripts rely on `/tmp/chezmoi-utils.sh`, which is generated once by `run_before_00-setup-utils.sh.tmpl`.
- Add or remove Homebrew dependencies by editing the tap/brew/cask lists in `.chezmoiscripts/run_once_after_10-install-homebrew-deps.sh.tmpl`. Do not scatter standalone `brew install` calls elsewhere.
- Preserve the repo's source-path-aware Neovim behavior. `dot_config/nvim/lua/config/lazy.lua` and `dot_config/nvim/lua/plugins/coding.lua` deliberately reference `~/.local/share/chezmoi/dot_config/nvim` so plugin metadata and completions work while editing the source repo.
- Prefer `jj` for repo-local version-control workflows when practical. The repo includes `.jj/`, bootstrap installs `jj`, `dot_config/jj/config.toml` defines local aliases, and `dot_local/bin/executable_pm` assumes `jj git init --colocate` for new local projects.
- If a change is meant to affect AI assistant behavior, check both `dot_copilot/` and `dot_config/opencode/`; they intentionally mirror similar concerns but are configured independently.
