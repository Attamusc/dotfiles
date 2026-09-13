# Upstream

This skill adapts Cursor pstack's `blast-radius` skill into the focused impact-scope input used by this verification architecture.

- Source: https://github.com/cursor/plugins/blob/889ec4b68fa5aab0e867dad71ec3fdf386ae48f3/pstack/skills/blast-radius/SKILL.md
- Repository: https://github.com/cursor/plugins
- Path: `pstack/skills/blast-radius/SKILL.md`
- Commit: `889ec4b68fa5aab0e867dad71ec3fdf386ae48f3`
- License: MIT

## Preserved upstream content

- `UPSTREAM-SKILL.md` is the pinned upstream `SKILL.md`, byte-identical.

## Ownership

- The local `blast-radius` skill is the single owner of impact-scope analysis: affected paths, direct consumers, contracts, migrations, rollback scope, verification implications, and unknown consumers.

## Local deviations

- Replaced the upstream safety-proof and risk-review workflow with a narrow impact inventory for planning and verification.
- Replaced the upstream response format with the required `Blast Radius` fields: changed paths, direct consumers, contracts, migrations, rollback scope, verification implications, and unknowns.
- Added source-of-truth-first contract inspection based on the local `verify-integration` method.
- Added narrow, path-scoped search guidance and bounded no-match language.
- Require dynamic and out-of-repository consumers to be labeled unknown rather than claiming exhaustive discovery.
- Excluded upstream `how`, `why`, `arena`, and `unslop` composition because those are separate capabilities or unavailable local dependencies.
- Excluded generic risk grading, broad code review, proof execution, process control, and verification verdicts; existing review and verification owners retain those responsibilities.
- Removed upstream `disable-model-invocation: true` so users and other planning or verification workflows can invoke this shared skill.

## Re-sync

1. Fetch the upstream file at the pinned commit into `UPSTREAM-SKILL.md` without modification.
2. Review upstream changes for impact-inventory improvements only.
3. Preserve the local ownership boundary and output contract.
4. Update the commit, license, and deviation list above.
