## Writing style

Write plainly. Cut hollow filler that asserts significance instead of showing
it. Banned: empty significance claims ("X is real", "game-changer", "cannot be
overstated", "plays a crucial role"), throat-clearing ("it's worth noting",
"needless to say", "in today's fast-paced world"), hollow intensifiers
(truly/genuinely/fundamentally/"at its core") when they carry the sentence, the
"not just X, but Y" flourish when it's rhetoric, and vague magnitude words
(significant/substantial/robust) used without a number. Show why something
matters with a specific fact, number, or mechanism — not adjectives.

## Custom Agents and Skills

### Agents (subagents, invoke with @)

- **@spec** — Clarifies WHAT to build. Interviews about intent, scope,
  effort level, and success criteria, then writes a structured spec to
  `docs/specs/*.md`. Read-only for source code, never plans architecture.
  Uses `gpt-5.6-sol`. Use when requirements are unclear or you want to
  nail down exactly what "done" looks like before planning.
- **@planner** — Figures out HOW to build it. Takes a spec (or request),
  explores approaches, validates design, runs a premortem, and produces a
  structured plan in `docs/plans/*.md`. Read-only for source code, never
  writes code. Uses `gpt-5.6-sol`. Use for any non-trivial task.
- **@advisor** — Senior architect for bouncing ideas, reviewing approaches,
  and debugging strategy. Fully read-only, gives direct opinions. Uses
  `claude-opus-5` as an independent check on GPT-produced work.

### Skill Discovery

Skills are loaded on-demand. OpenCode discovers skills from multiple paths:

- **Shared skills** at `~/.agents/skills/` — shared with pi coding agent
- **OpenCode-only skills** at `~/.config/opencode/skill/`
- **Project-local skills** at `.opencode/skills/` or `.agents/skills/`

### Shared Skills (`~/.agents/skills/`)

Shared with pi. OpenCode discovers these automatically, so they aren't listed
here — a hand-maintained inventory drifts and the loader already has the real
one. Each skill is a directory containing `SKILL.md`; run `ls ~/.agents/skills`
for the current set.

Private skills stay out of the public dotfiles repo: sources live in the
chezmoi source tree under `.local-skills/agents/` (gitignored) and are
symlinked into `~/.agents/skills/` by `run_after_40-link-local-skills.sh`.

### OpenCode-Only Skills (`~/.config/opencode/skill/`)

- **app-valet** — GitHub App Valet development patterns and conventions.
- **jujutsu** — Guide to Jujutsu (jj) version control system. Also present in
  `~/.agents/skills/jujutsu/` for pi; the two copies are maintained separately.

### Commands (slash commands)

- `/init [update]` — Create or update AGENTS.md files for the current project.
  Overrides built-in `/init`. Loads the `agents-md` skill and runs the full
  investigation process. Pass `update` to refresh existing files.
- `/plan <description>` — Invoke the planner to create an implementation plan.
- `/research <topic>` — Research a library, API, or technical topic.
- `/note <what to record>` — Record a decision, pattern, or learning.

### Sibling Tool: pi coding agent

[pi](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/)
is configured alongside OpenCode at `~/.pi/agent/`. Both tools share skills
via `~/.agents/skills/` and connect to the same MCP servers (Kusto and
WorkIQ). pi has its own subagents (planner, scout, worker, reviewer,
researcher) and extensions (todos, cost, watchdog, etc.).

On macOS, Datadog access comes from the shared `dd-docs`, `dd-pup`, `dd-audit`,
and `dd-apm` skills rather than MCP. Load the relevant skill before running a
`pup` command; do not improvise Pup commands. Pup is read-only by default.
The `dd-apm` bundle also documents infrastructure-changing commands outside
Pup, so do not install dependencies, change infrastructure, restart workloads,
change remapping rules, or request secrets in chat without an explicit request
and per-command authorization. Datadog skills and Pup are absent on Fedora.

### Workflow Hint

For complex tasks: use `@spec` to clarify requirements, then `/plan` to
create an implementation plan, implement, then `/note` to capture learnings.
For simpler tasks, jump straight to `/plan`. Use `@advisor` when stuck on a
design decision. Use `/research` when you need to understand an external
library or API.

When starting in a new codebase: `/init` to create AGENTS.md files, then
`/init update` periodically as the project evolves.
