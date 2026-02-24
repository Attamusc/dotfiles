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

### Commands (slash commands)

- `/plan <description>` — Invoke the planner to create an implementation plan.
- `/research <topic>` — Research a library, API, or technical topic.
- `/note <what to record>` — Record a decision, pattern, or learning.

### Workflow Hint

For complex tasks: `/plan` first, review the plan, implement, then `/note`
to capture learnings. Use `@advisor` when stuck on a design decision. Use
`/research` when you need to understand an external library or API.
