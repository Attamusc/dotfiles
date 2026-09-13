# Upstream

This skill adapts Cursor pstack's `create-verification-skill` into an approval-gated generator for the shared verification definition contract.

- Source: https://github.com/cursor/plugins/blob/889ec4b68fa5aab0e867dad71ec3fdf386ae48f3/pstack/skills/create-verification-skill/SKILL.md
- Repository: https://github.com/cursor/plugins
- Path: `pstack/skills/create-verification-skill/SKILL.md`
- Commit: `889ec4b68fa5aab0e867dad71ec3fdf386ae48f3`
- License: MIT

## Preserved upstream content

- `UPSTREAM-SKILL.md` is the pinned upstream `SKILL.md`, byte-identical.

## Local deviations

- Changed the default output from Cursor's `.cursor/skills/verify-<app>/` to the Agent Skills project path `.agents/skills/verify-<scope>/SKILL.md`.
- Generate exactly one `SKILL.md`; removed feature maps, helpers, scaffolding, and maintenance suggestions.
- Replaced the launch/doctor/drive template with the canonical `verify-this` definition contract and its ordered check schema.
- Require inspection of repository-owned command manifests, tests, CI, documentation, and contract sources.
- Require every command to cite the repository paths that establish it; prohibit inference from naming or framework conventions.
- Added complete proposal display, canonical validation, and explicit approval before any project write.
- Added proposal-only behavior for projects that do not accept committed Agent Skills and guaranteed no project changes when approval is absent or declined.
- Added working-tree preservation and overwrite protections.
- Prohibit writing `AGENTS.md`, notes, unrelated skills, and transcript-derived guidance.
- Removed the upstream instruction to fix a broken checkout before generation; evidence gaps are reported instead of changing unrelated project code.
- Removed Cursor-only invocation metadata and paths.

## Re-sync

1. Fetch the upstream file at the pinned commit into `UPSTREAM-SKILL.md` without modification.
2. Review upstream changes only for repository interview and verification-definition generation improvements.
3. Preserve the local canonical contract, single-file scope, and approval-before-write boundary.
4. Update the commit, license, and deviations above.
