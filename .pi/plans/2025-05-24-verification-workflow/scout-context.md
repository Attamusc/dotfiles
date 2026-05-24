# Scout Context: Verification Workflow Changes

## Project Structure

This is a **chezmoi-managed dotfiles repo** at `/Users/attamusc/.local/share/chezmoi/`. Files here are templates that chezmoi applies to the home directory. The `dot_` prefix maps to `.` in the target path.

### Key path mappings

| Chezmoi source | Target path |
|---|---|
| `dot_pi/agent/agents/planner.md` | `~/.pi/agent/agents/planner.md` |
| `dot_pi/agent/agents/worker.md` | `~/.pi/agent/agents/worker.md` |
| `dot_pi/agent/agents/reviewer.md` | `~/.pi/agent/agents/reviewer.md` |
| `dot_pi/agent/agents/scout.md` | `~/.pi/agent/agents/scout.md` |
| `dot_pi/agent/AGENTS.md` | `~/.pi/agent/AGENTS.md` |
| `dot_agents/skills/grill-with-docs/SKILL.md` | `~/.agents/skills/grill-with-docs/SKILL.md` |
| `dot_agents/skills/` (new dirs) | `~/.agents/skills/` |

**All edits must be made to chezmoi source files under `/Users/attamusc/.local/share/chezmoi/`, not to the target files directly.**

---

## Files to Modify

### 1. Planner (`dot_pi/agent/agents/planner.md`) — ~500 lines

**Hard Rules section (lines ~30-80):** Currently has 5 rules:
- Rule 1: You are INTERACTIVE
- Rule 2: No skipping phases
- Rule 3: You NEVER implement the feature
- Rule 4: Keep requirements engineering LIGHTWEIGHT
- Rule 5: Delegate when you hit a factual gap

**New Rule 6 goes here.** Pattern: bold title, short explanation, behavioral principle.

**Phase 4 (Effort & Ideal State):** Contains test strategy choices: "Tests: none / smoke / thorough / comprehensive". The test strategy note about integration contracts fits here naturally.

**Phase 8 (Write Plan):** Contains the plan template with sections: Intent, User Story, Behavior, Scope, Effort & Quality, Constraints, ISC, Prior Decisions, Approach, Dependencies, Risks. Integration contracts declaration fits in Dependencies or Constraints.

### 2. Worker (`dot_pi/agent/agents/worker.md`) — ~100 lines

**Engineering Standards section:** Has "You Own What You Ship", "Keep It Simple", "Read Before You Edit", "Investigate Don't Guess", "Evidence Before Assertions".

**Workflow section 2 (Verify Todo Has Examples):** Has a checklist and a "STOP and report back" pattern when context is missing. The contradiction-reporting addition fits as an extension of "Read Before You Edit" in Engineering Standards, or as part of step 4 (Implement).

### 3. Reviewer (`dot_pi/agent/agents/reviewer.md`) — ~120 lines

**NOT being modified.** Reference only — the new validator borrows its output format patterns (priority levels, structured findings).

### 4. AGENTS.md (`dot_pi/agent/AGENTS.md`) — ~200 lines

**Agent table:** Lists planner, scout, worker, reviewer with purpose and model. Validator needs to be added.

**"When to Delegate" section:** Has bullets for different situations → agent mappings. Needs validator entry.

**Skill Triggers table:** Lists when-to-load mappings. May want an entry for the verification skill.

### 5. Grill-with-docs (`dot_agents/skills/grill-with-docs/SKILL.md`)

**"During the session" section:** Has subsections: Challenge against glossary, Sharpen fuzzy language, Discuss concrete scenarios, Cross-reference with code, Update CONTEXT.md inline, Offer ADRs sparingly, Write decisions artifact. Integration contract surfacing fits as a new subsection here.

---

## New Files to Create

### 1. Validator agent: `dot_pi/agent/agents/validator.md`

New file. Should follow the frontmatter pattern of existing agents:
```yaml
---
name: validator
description: ...
tools: read, bash
model: [TBD - different family from reviewer]
thinking: [TBD]
spawning: false
auto-exit: true
system-prompt: append
---
```

### 2. Verification skill: `dot_agents/skills/verify-integration/SKILL.md`

New directory + file. Should follow the skill format pattern:
```yaml
---
name: verify-integration
description: ...
---
```

No existing `verify-integration` directory exists.

---

## Skill format conventions (from existing skills)

Skills use YAML frontmatter with `name` and `description`. The description includes trigger phrases. Body is markdown with the methodology/instructions. Skills reference supporting files with relative paths (e.g., `[CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md)`).
