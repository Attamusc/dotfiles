## Custom Agents and Skills

### Agents (subagents, invoke with @)

- **@planner** — Interviews about requirements and produces a structured
  `.plans/*.md` file. Read-only for source code, never writes code. Uses
  `claude-opus-4.6`. Use for any non-trivial task before building.
- **@advisor** — Senior architect for bouncing ideas, reviewing approaches,
  and debugging strategy. Fully read-only, gives direct opinions. Uses
  `claude-opus-4.6`.

### Skills (loaded on-demand)

- **researcher** — Looks up external docs, GitHub repos, library APIs.
  Returns distilled findings, not raw dumps. Triggered automatically when
  researching external libraries or APIs.
- **notekeeper** — Records and retrieves project decisions, patterns, and
  gotchas in `.notes/`. Maintains institutional memory across sessions.
  Triggered automatically when capturing learnings.
- **agents-md** — Methodology for creating AGENTS.md files containing only
  non-discoverable context. Loaded by `/init`. Includes investigation
  process, discoverability filter, and hierarchical file guidance.

### Commands (slash commands)

- `/init [update]` — Create or update AGENTS.md files for the current project.
  Overrides built-in `/init`. Loads the `agents-md` skill and runs the full
  investigation process. Pass `update` to refresh existing files.
- `/plan <description>` — Invoke the planner to create an implementation plan.
- `/research <topic>` — Research a library, API, or technical topic.
- `/note <what to record>` — Record a decision, pattern, or learning.

### Workflow Hint

For complex tasks: `/plan` first, review the plan, implement, then `/note`
to capture learnings. Use `@advisor` when stuck on a design decision. Use
`/research` when you need to understand an external library or API.

When starting in a new codebase: `/init` to create AGENTS.md files, then
`/init update` periodically as the project evolves.
