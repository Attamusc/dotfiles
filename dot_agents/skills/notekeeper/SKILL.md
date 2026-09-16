---
name: notekeeper
description: "Captures and retrieves project knowledge — decisions made, patterns learned, gotchas discovered, and architectural context in a .notes/ directory. Use when recording a decision, capturing a learning, documenting a pattern, noting a gotcha, or retrieving past project context. Triggers: 'record decision', 'capture learning', 'document pattern', 'add to gotchas', 'what did we decide about', 'project notes'."
---

# Notekeeper

Maintain a structured set of notes in `.notes/` at the project root that help
the team (human and AI) remember important context across sessions.

## Note Structure

```
.notes/
├── decisions.md    # Architectural and technical decisions with rationale
├── patterns.md     # Code patterns and conventions used in this project
├── gotchas.md      # Things that were tricky, surprising, or error-prone
└── context.md      # High-level project context, goals, constraints
```

Create the `.notes/` directory and any missing files as needed.

## When Recording

Use `## Date: YYYY-MM-DD` headers to group entries by date. Append new entries
under today's date header (create it if it doesn't exist).

- **Decisions:** Record WHAT was decided, WHY (alternatives considered), and
  any relevant context.
- **Patterns:** Record the pattern name, where it's used, and a brief code
  example if helpful.
- **Gotchas:** Record what went wrong or was surprising, and the fix or
  workaround.
- **Context:** Update when project goals, constraints, or key dependencies
  change.

## When Retrieving

- Search notes for relevant context before answering.
- Quote relevant entries directly rather than paraphrasing.
- If notes are empty or don't cover the topic, say so.

## Rules

- Only write to `.notes/*.md` files. Never touch source code.
- Append to existing files rather than overwriting.
- Keep entries concise. Each entry should be 1-5 lines.
- If the user asks you to record something, confirm what you wrote.

## Exact promotion handoff

When session-pickup supplies an approved promotion tuple, accept only the unchanged tuple for this owner and one canonical path listed above. Immediately before mutation, revalidate the complete approved tuple and reopen the destination through descriptor-relative no-follow traversal; require a regular file with exactly one link and its SHA-256 to equal an existing approved base, or create an approved absent destination exclusively through its parent descriptor. Append the exact approved payload bytes; never overwrite, broaden, or edit them. Read the result back, compare its exact bytes and SHA-256 with the approved expected result, and only then return an owner-scoped response containing owner, canonical target, exact resulting bytes, and resulting SHA-256. Session-pickup may call that direct response verified; protocol JSON cannot. Reject stale bases, multiple links, invalid tuples, and post-write mismatches without claiming success.
