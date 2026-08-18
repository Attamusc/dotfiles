# Upstream

This bundle is adapted from Datadog's agent-skills repository for Pi and
OpenCode's different discovery models.

- Source: https://github.com/datadog-labs/agent-skills
- Path: `dd-apm/`
- Commit: `69cca0e752d3a703d0b16ce7eaeaa787f2f90fd4` (2026-07-23)
- Skill version: `1.1.0`
- License: MIT, © Datadog

## Preserved upstream content

- `UPSTREAM-SKILL.md` is the pinned upstream root `SKILL.md`, byte-identical.
- Every nested `WORKFLOW.md` is byte-identical to the upstream `SKILL.md` at
  the same relative directory.
- `LICENSE` is the pinned repository root license.

## Local adaptation

- `SKILL.md` is the runtime entry point. It differs from
  `UPSTREAM-SKILL.md` only by using relative `WORKFLOW.md` paths and setting
  `alwaysApply: false`.
- Nested upstream files are named `WORKFLOW.md` because OpenCode recursively
  registers every nested `SKILL.md`; the Kubernetes and Linux workflows reuse
  five names and otherwise collide. Pi stops at the root skill, but both hosts
  now expose the same four top-level Datadog skills.
- Chezmoi deploys this bundle only on macOS.
- Pup is read-only by default. Higher-priority Pi and OpenCode instructions
  prohibit infrastructure changes, dependency installation, and secret entry
  in chat unless the user explicitly requests and authorizes the operation.

## Re-sync

1. Copy upstream `dd-apm/SKILL.md` to `UPSTREAM-SKILL.md`.
2. Copy each nested upstream `SKILL.md` to `WORKFLOW.md` at the same relative
   directory.
3. Rebase the small runtime `SKILL.md` path and `alwaysApply` adaptations.
4. Update the commit, date, and version above and verify OpenCode exposes only
   `dd-apm`, not the nested workflow names.
