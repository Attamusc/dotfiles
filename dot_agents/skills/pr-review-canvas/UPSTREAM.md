# Upstream provenance

- Source: https://github.com/cursor/plugins/tree/889ec4b68fa5aab0e867dad71ec3fdf386ae48f3/cursor-team-kit/skills/pr-review-canvas
- Commit: `889ec4b68fa5aab0e867dad71ec3fdf386ae48f3`
- License: MIT
- Preserved files: `UPSTREAM-SKILL.md` is byte-identical to upstream `cursor-team-kit/skills/pr-review-canvas/SKILL.md`; `LICENSE` preserves the repository MIT notice at the pinned commit.
- SHA-256 (`UPSTREAM-SKILL.md`): `88a07a2459197acba3c5e06b7d695e35ad618a998442b72d05cdba4efc117ac6`
- SHA-256 (`LICENSE`): `702f5f331b56aff0e33d8c7826df5202559f894145eb70355c6477b55b5bb8a0`

## Local deviations

The local entry point makes Markdown the canonical artifact, validates a bounded document model, groups changes by reviewer value, and optionally projects the same model through Glimpse's absolute `src/glimpse.mjs` interface. It does not copy or use Cursor Canvas, its local server, fixed ports, browser automation, hooks, state, transcript forwarding, process/pane lifecycle, or status reporting. GitHub and iterate-pr remain the data owners; this skill owns only the whole-PR walkthrough.
