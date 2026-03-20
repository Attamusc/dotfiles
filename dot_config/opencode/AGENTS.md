## Custom Agents and Skills

### Agents (subagents, invoke with @)

- **@planner** — Interviews about requirements and produces a structured
  `docs/plans/*.md` file. Read-only for source code, never writes code. Uses
  `claude-opus-4.6`. Use for any non-trivial task before building.
- **@advisor** — Senior architect for bouncing ideas, reviewing approaches,
  and debugging strategy. Fully read-only, gives direct opinions. Uses
  `claude-opus-4.6`.

### Skill Discovery

Skills are loaded on-demand. OpenCode discovers skills from multiple paths:

- **Shared skills** at `~/.agents/skills/` — shared with pi coding agent
- **OpenCode-only skills** at `~/.config/opencode/skill/`
- **Project-local skills** at `.opencode/skills/` or `.agents/skills/`

### Shared Skills (`~/.agents/skills/`)

These skills are available to both OpenCode and pi:

- **agents-md** — Methodology for creating AGENTS.md files containing only
  non-discoverable context. Loaded by `/init`.
- **codebase-investigation** — Investigate a codebase and write findings to
  Obsidian vault as a resource entity note.
- **code-simplifier** — Refactor complex code into simpler, more readable
  implementations while preserving behavior.
- **datadog-incident-investigation** — Systematic Datadog investigation of
  production incidents followed by an Obsidian vault write-up.
- **frontend-design** — Implement frontend features with visual fidelity,
  using browser screenshots for iterative verification.
- **github** — GitHub workflow automation: PRs, issues, reviews, checks.
- **iterate-pr** — Iterate on a PR based on CI checks and reviewer feedback
  until it is ready to merge.
- **learn-codebase** — Systematically explore and map an unfamiliar codebase
  to build working understanding.
- **notekeeper** — Records and retrieves project decisions, patterns, and
  gotchas in `.notes/`. Maintains institutional memory across sessions.
- **obsidian-article-capture** — Capture a web article into an Obsidian vault
  as an EMS Article entity note.
- **obsidian-cli** — Obsidian CLI patterns for vault operations: create notes,
  set properties, search, query Bases.
- **obsidian-vault-conventions** — EMS/Dataview/Templater conventions for the
  Obsidian vault.
- **playwright-cli** — Automates browser interactions for web testing, form
  filling, screenshots, and data extraction.
- **researcher** — Looks up external docs, GitHub repos, library APIs.
  Returns distilled findings, not raw dumps.
- **skill-creator** — Guide for creating effective skills that extend agent
  capabilities with specialized knowledge and workflows.

### OpenCode-Only Skills (`~/.config/opencode/skill/`)

- **app-valet** — GitHub App Valet development patterns and conventions.
- **jujutsu** — Guide to Jujutsu (jj) version control system.

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
via `~/.agents/skills/` and connect to the same MCP servers (Datadog, Kusto,
WorkIQ). pi has its own subagents (planner, scout, worker, reviewer,
researcher) and extensions (cmux, todos, cost, watchdog, etc.).

### Workflow Hint

For complex tasks: `/plan` first, review the plan, implement, then `/note`
to capture learnings. Use `@advisor` when stuck on a design decision. Use
`/research` when you need to understand an external library or API.

When starting in a new codebase: `/init` to create AGENTS.md files, then
`/init update` periodically as the project evolves.
