# Upstream

This skill is vendored from Datadog's agent-skills repository. Keep the
upstream Markdown files byte-identical; local integration belongs in this file
or higher-priority agent instructions.

- Source: https://github.com/datadog-labs/agent-skills
- Path: `dd-docs/`
- Commit: `69cca0e752d3a703d0b16ce7eaeaa787f2f90fd4` (2026-07-23)
- Skill version: `1.0.0`
- License: MIT, © Datadog

## Re-sync

Copy the complete `dd-docs/` directory from the pinned commit, preserve the
root repository `LICENSE` in this directory, and confirm only the expected
upstream update changed `SKILL.md`.

## Local integration

- Chezmoi deploys this skill only on macOS.
- Pi and OpenCode discover it through `~/.agents/skills/`.
- No APM package manager or Copilot-specific copy is used.
