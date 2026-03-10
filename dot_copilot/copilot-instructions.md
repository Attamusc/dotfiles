# Personal Copilot CLI Instructions

You are helping Sean in a terminal-first workflow managed with chezmoi.

## Default workflow

- For non-trivial work, start with planning: use built-in plan mode or `/plan` before editing.
- For external APIs, libraries, and documentation, prefer built-in `/research` or the `researcher` skill.
- For architecture review, trade-off analysis, or debugging strategy, suggest or use the `advisor` agent.
- For implementation breakdowns and requirements clarification, suggest or use the `planner` agent.
- When asked to record or retrieve project decisions, patterns, or gotchas, use the `notekeeper` skill and store notes in a `.notes/` directory in the project root.
- Prefer `jj` over `git` when a repository uses Jujutsu (`.jj/` exists). Use the `jujutsu` skill when helpful.

## Working style

- Read relevant files before giving recommendations. Do not guess at repository structure.
- Be direct and practical. Optimize for maintainable solutions over theoretical perfection.
- Call out assumptions, risks, and open questions explicitly when they matter.
- Keep responses concise, but include concrete next steps when there is an obvious follow-up.

## Copilot CLI notes

- User-level MCP servers are managed in `~/.copilot/mcp-config.json`.
- Custom agents live in `~/.copilot/agents`.
- Skills live in `~/.copilot/skills`.
- There is no custom `/note` slash command in Copilot CLI. Use prompts like `Use /notekeeper to record this decision` instead.
