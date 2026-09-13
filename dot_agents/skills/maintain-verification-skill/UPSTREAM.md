# Upstream

This skill adapts Cursor pstack's `maintain-verification-skill` into an approval-gated auditor for the shared verification definition contract.

- Source: https://github.com/cursor/plugins/blob/889ec4b68fa5aab0e867dad71ec3fdf386ae48f3/pstack/skills/maintain-verification-skill/SKILL.md
- Repository: https://github.com/cursor/plugins
- Path: `pstack/skills/maintain-verification-skill/SKILL.md`
- Commit: `889ec4b68fa5aab0e867dad71ec3fdf386ae48f3`
- License: MIT

## Preserved upstream content

- `UPSTREAM-SKILL.md` is the pinned upstream `SKILL.md`, byte-identical.

## Local deviations

- Require one explicit `.agents/skills/verify-<scope>/SKILL.md` path instead of discovering Cursor verification skills and feature maps.
- Replace feature-map source waves and mandatory live driving with an audit of every declared executable check against narrowly read repository sources.
- Validate the target against the canonical `verify-this` definition contract and keep contract validity separate from command staleness.
- Classify every executable declaration as `current`, `stale`, `missing`, or `ambiguous` in a fixed audit table.
- Require each stale finding to cite both the declaration source and concrete current repository evidence.
- Prohibit executing checks merely to assess staleness and prohibit all mutating-check execution during maintenance.
- Prohibit inferred replacement commands, stylistic description rewrites, unrelated checks, product fixes, feature-map maintenance, and general repository cleanup.
- Replace the upstream direct correction and PR flow with a complete unified-diff proposal, explicit approval, concurrent-change check, and single-file write boundary.
- Guarantee that absent or declined approval leaves the definition unchanged.
- Remove Cursor-only invocation metadata, paths, parallel-agent requirements, branch creation, and PR shipping.

## Re-sync

1. Fetch the upstream file at the pinned commit into `UPSTREAM-SKILL.md` without modification.
2. Review upstream changes only for techniques that improve verification-definition drift detection.
3. Preserve the local canonical contract, evidence requirements, single-file scope, and approval-before-write boundary.
4. Update the commit, license, and deviations above.
