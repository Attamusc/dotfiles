---
name: codebase-investigation
description: "Investigate a codebase to answer architectural or implementation questions, then write findings and an implementation plan to the Obsidian vault as a resource entity note. Use when the user asks to explore, investigate, or research how something works in a codebase and wants the findings captured as a document. Triggers: 'investigate how X works', 'explore the codebase for Y', 'research the Z system and write it up', 'document your findings', or any request combining codebase exploration with writing a report/plan to Obsidian."
---

# Codebase Investigation

Explore a codebase to answer architectural or implementation questions, synthesize findings into a structured document, and write it to the Obsidian vault as a resource entity note.

When referencing vault files in responses, use wikilinks per `[[utilities/Assistant Conventions]]`.

**Prerequisite:** Obsidian must be running (CLI commands require it). See the `obsidian-cli` skill for setup.

## Workflow

### 1. Scope the Investigation

Before exploring, establish clear boundaries:

- **Question** — What specific question or system is being investigated?
- **Scope** — Which parts of the codebase are relevant? What is explicitly out of scope?
- **Deliverable** — What should the final document contain? (findings only, findings + plan, findings + plan + effort estimate)

Ask the user to clarify if the scope is ambiguous. Use the TodoWrite tool to track investigation tasks.

### 2. Explore the Codebase

Use the Task tool with the `explore` subagent for broad searches. Use Grep/Glob directly only for targeted lookups of specific files, classes, or functions.

Investigation strategies (use in combination as needed):

- **Entry points first** — Find where the feature is invoked (routes, controllers, CLI commands, event handlers)
- **Follow the data** — Trace data flow from input through processing to storage
- **Find the boundaries** — Identify interfaces between subsystems, packages, or services
- **Read the tests** — Tests reveal intended behavior, edge cases, and integration points
- **Check configuration** — Constants, feature flags, environment variables, database schemas

Track each discovery. Update the TodoWrite list as new sub-questions emerge.

### 3. Synthesize Findings

Once exploration is complete, organize findings before writing:

- **Architecture** — How the system is structured, what the key components are
- **Data flow** — How requests/data move through the system
- **Key files** — The files that matter most, with their roles
- **Constraints** — Technical constraints, existing patterns to follow, gotchas
- **Open questions** — Things that need product or team decisions

### 4. Write to Obsidian Vault via CLI

Create the note and set properties using the Obsidian CLI. The property schema comes from `[[utilities/templates/atlas/Resource]]` (Resource template).

```bash
# Step 1: Create the note with body content
obsidian create path="atlas/notes/<Title>.md" content="<body>"

# Step 2: Set properties per the Resource entity schema
obsidian property:set path="atlas/notes/<Title>.md" name=is value="[[atlas/entities/resource]]"
obsidian property:set path="atlas/notes/<Title>.md" name=in value="" type=list
obsidian property:set path="atlas/notes/<Title>.md" name=date value="<YYYY-MM-DD>" type=date
obsidian property:set path="atlas/notes/<Title>.md" name=subject value="<Topic1>" type=list
obsidian property:set path="atlas/notes/<Title>.md" name=subject value="<Topic2>" type=list
```

**Property schema** (from Resource template):

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `is` | link | yes | `[[atlas/entities/resource]]` |
| `in` | list | yes | Collections this note belongs to (empty list if none) |
| `date` | date | yes | Today's date |
| `subject` | list | no | 2-5 short descriptive terms |

**Document structure** (adapt sections to fit the investigation — not all are required):

```markdown
# <Title>

## Problem Statement

What question was investigated and why.

## Architecture Findings

How the system works. Diagrams, tables, or prose as appropriate.

## Key Files

Table of files and their roles for quick reference.

## Implementation Plan

Phased plan with concrete steps. Include:

- What to build in each phase
- Code snippets or pseudocode where helpful
- Feature flag / rollout strategy if applicable

## Estimated Effort

Rough sizing (time, lines of code, number of files).

## Open Questions

Decisions that need human input before proceeding.
```

**Filename rules:**

- Human-readable title matching the `# Title` heading
- Remove `/\:*?"<>|`, collapse whitespace
- If a note already exists at the path, ask the user before overwriting

### 5. Confirm With User

After writing, tell the user:

- The wikilink to the new note: `[[atlas/notes/<Title>]]`
- A brief summary of what was captured
- Any open questions that need resolution

## Guardrails

- Do not modify existing vault notes unless the user explicitly asks.
- Do not create entity definitions or modify `entity-schemas.json` — the `resource` entity already exists.
- Keep `subject:` values short and descriptive (2-5 terms). Do not over-tag.
- Always use today's date for the `date:` field unless the user specifies otherwise.
- If the investigation is still in progress and findings are partial, note this clearly in the document.
