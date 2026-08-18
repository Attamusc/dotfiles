# Upstream

This skill is vendored from Datadog's agent-skills repository. Keep the
upstream Markdown files byte-identical; local integration belongs in this file
or higher-priority agent instructions.

- Source: https://github.com/datadog-labs/agent-skills
- Path: `dd-pup/`
- Commit: `69cca0e752d3a703d0b16ce7eaeaa787f2f90fd4` (2026-07-23)
- Skill version: `1.0.1`
- License: MIT, © Datadog

## Re-sync

Copy the complete `dd-pup/` directory from the pinned commit, preserve the
root repository `LICENSE` in this directory, and confirm only the expected
upstream update changed `SKILL.md`.

## Local integration

- Chezmoi deploys this skill only on macOS.
- Pi and OpenCode discover it through `~/.agents/skills/`.
- Pup is installed separately through the official `datadog-labs/pack`
  Homebrew tap; agents do not use Pup to install skills.
- `~/.config/pup/config.yaml` enables Pup's enforced read-only mode by default.
