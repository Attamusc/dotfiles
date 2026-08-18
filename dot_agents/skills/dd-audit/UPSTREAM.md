# Upstream

This bundle is adapted from Datadog's agent-skills repository for Pi and
OpenCode's different discovery models.

- Source: https://github.com/datadog-labs/agent-skills
- Path: `dd-audit/`
- Commit: `69cca0e752d3a703d0b16ce7eaeaa787f2f90fd4` (2026-07-23)
- Skill version: `0.1.0`
- License: MIT, © Datadog

## Preserved upstream content

- `UPSTREAM-SKILL.md` is the pinned upstream root `SKILL.md`, byte-identical.
- Every nested `WORKFLOW.md` is byte-identical to the upstream `SKILL.md` at
  the same relative directory.
- `compliance-report/references/control-mapping.md` and `LICENSE` are
  byte-identical to the pinned repository files.

## Local adaptation

- `SKILL.md` is the runtime entry point. It adds direct links from the
  sub-skill table to each nested `WORKFLOW.md`.
- Nested upstream files are named `WORKFLOW.md` so OpenCode exposes the bundle
  only through its `dd-audit` root instead of registering every workflow as an
  independent skill. Pi already stops discovery at the root skill.
- Chezmoi deploys this bundle only on macOS.
- Pup is read-only by default. The upstream API-key deletion remediation is
  unavailable unless the user deliberately changes that local policy.

## Re-sync

1. Copy upstream `dd-audit/SKILL.md` to `UPSTREAM-SKILL.md`.
2. Copy each nested upstream `SKILL.md` to `WORKFLOW.md` at the same relative
   directory and preserve the compliance reference.
3. Rebase the runtime root's direct workflow links.
4. Update the commit, date, and version above and verify OpenCode exposes only
   `dd-audit`, not its nested workflow names.
