# Upstream

This skill adapts Cursor Team Kit's `verify-this` skill into the verification front door for the existing Pi capability owners and the local verification contracts.

- Source: https://github.com/cursor/plugins/blob/889ec4b68fa5aab0e867dad71ec3fdf386ae48f3/cursor-team-kit/skills/verify-this/SKILL.md
- Repository: https://github.com/cursor/plugins
- Path: `cursor-team-kit/skills/verify-this/SKILL.md`
- Commit: `889ec4b68fa5aab0e867dad71ec3fdf386ae48f3`
- License: MIT

## Preserved upstream content

- `UPSTREAM-SKILL.md` is the pinned upstream `SKILL.md`, byte-identical.

## Ownership

- `verify-this` is the sole owner of general verification orchestration, manifest closure, evidence grading, the canonical Markdown report, and its verdict.
- Project `.agents/skills/verify-<scope>/SKILL.md` definitions own project-specific checks.
- `blast-radius` owns impact analysis; `control-cli` and its selected existing host capability own execution and lifecycle control.
- `verify-integration`, `tdd`, `github`, and `playwright-cli` retain their specialized methods and capabilities.

## Local deviations

- Replaced the upstream baseline/treatment-only workflow with a definition-driven, bounded check manifest that supports changes, claims, features, commands, and integrations.
- Added selection and validation of one trusted project verification definition. Missing definitions permit only repository-evidenced generic checks and force an incomplete-coverage verdict.
- Delegated affected-scope analysis to `blast-radius`, live execution to `control-cli`, and contract comparison to `verify-integration` rather than duplicating those capabilities.
- Added explicit safety classes, host capabilities, timeouts or stopping conditions, pass signals, failure interpretations, evidence retention, and cleanup obligations before execution.
- Replaced the upstream three-verdict text format with the canonical Markdown report and `PASS`, `FAIL`, or `INCOMPLETE` semantics.
- Added terminal statuses for every planned check and explicit `measured`, `observed`, `agent-reported`, or `unverified` evidence grades. Agent-reported and unverified evidence cannot support a pass.
- Retained runtime-native output only as referenced supporting evidence; no artifact hierarchy, verdict database, workflow dependency, extension, or process controller is created.
- Added fail-closed mutation approval, capability, cleanup, and process-exit requirements through their existing owners.

## Re-sync

1. Fetch the upstream file at the pinned commit into `UPSTREAM-SKILL.md` without modification.
2. Review upstream changes for verification targeting, evidence comparison, and verdict guidance.
3. Preserve the local contracts and the ownership boundaries above.
4. Update the commit, license, and deviations above.
