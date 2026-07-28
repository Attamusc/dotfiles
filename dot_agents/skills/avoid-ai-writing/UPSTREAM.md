# Upstream

`SKILL.md` is vendored **verbatim** from a third party. Do not edit it — local
adjustments go in this file so re-syncing stays a straight copy.

- Source: https://github.com/conorbronsdon/avoid-ai-writing
- Path: `plugins/avoid-ai-writing/skills/avoid-ai-writing/SKILL.md`
- Version: 3.19.0
- Commit: 22529c2338f770a27f4015d6ed6a84c15e2e9617 (2026-07-29)
- License: MIT, © Conor Bronsdon

## Re-sync

```bash
cd ~/.local/share/chezmoi/dot_agents/skills/avoid-ai-writing
curl -sL -o SKILL.md \
  https://raw.githubusercontent.com/conorbronsdon/avoid-ai-writing/main/plugins/avoid-ai-writing/skills/avoid-ai-writing/SKILL.md
git diff --stat SKILL.md
```

Then update the version and commit fields above. Upstream also ships a regex
detector (`detector/patterns.js`) and a Cursor rules file; neither is vendored.

## Local integration

- **Voice comes from `write-like-me`.** For anything going out under Sean's
  name, `write-like-me` is the target; this skill supplies the audit checklist.
  Where the two disagree, `write-like-me` wins.
- Ignore the upstream voice profiles (`casual` / `professional` / `technical` /
  `warm` / `blunt`) when `write-like-me` is in play — they compete with it.
- `AGENTS.md` "Prose Discipline" is the always-on subset. This skill is the
  full audit, loaded on demand.
- SKILL.md is ~79KB (roughly 20K tokens). That's the largest skill in this
  setup by an order of magnitude, so it only earns its cost on a real editing
  pass — not as a background style check.
