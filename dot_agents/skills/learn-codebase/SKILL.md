---
name: learn-codebase
description: Discover project conventions and surface security concerns. Use when starting work in a new or unfamiliar project, when asked to "learn the codebase" or "what are the conventions", or to check for "anything shady in this codebase".
---

# Learn Codebase Conventions

Scan the current project for agent instruction files from various tools, summarize the conventions, and optionally register discovered skills in `.pi/settings.json`.

## Step 1: Scan for Convention Files

Search the project root for these files and directories:

```bash
# Agent instruction files (root-level)
for f in CLAUDE.md AGENTS.md COPILOT.md .cursorrules .clinerules; do
  [ -f "$f" ] && echo "FOUND: $f"
done

# Agent config directories
for d in .claude .cursor .github .pi; do
  [ -d "$d" ] && echo "FOUND DIR: $d/"
done

# Deeper convention files
[ -f ".github/copilot-instructions.md" ] && echo "FOUND: .github/copilot-instructions.md"

# Claude Code rules, skills, and commands
[ -d ".claude/rules" ] && echo "FOUND: .claude/rules/"
[ -d ".claude/skills" ] && echo "FOUND: .claude/skills/"
[ -d ".claude/commands" ] && echo "FOUND: .claude/commands/"

# Cursor rules
[ -d ".cursor/rules" ] && echo "FOUND: .cursor/rules/"

# Pi project skills
[ -d ".pi/skills" ] && echo "FOUND: .pi/skills/"
```

## Step 2: Read and Summarize

For each discovered file, read its contents and extract key conventions:

1. **Root instruction files** (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`, etc.) — read fully, these are the primary project rules
2. **Rule directories** (`.claude/rules/`, `.cursor/rules/`) — read each rule file
3. **Commands** (`.claude/commands/`) — read each command file. These are reusable prompt workflows from Claude Code (e.g., PR creation, release scripts, review checklists). Summarize what each command does.
4. **Skills directories** (`.claude/skills/`, `.cursor/skills/`) — list available skills and read their descriptions
5. **Settings files** (`.claude/settings.json`) — note permissions and configuration

Present a structured summary to the user:

```
## Project Conventions Summary

### Build & Run
- Package manager: [npm/pnpm/yarn/bun]
- Dev command: [command]
- Test command: [command]

### Code Style
- [Key style rules]

### Architecture
- [Key patterns, structure]

### Agent-Specific Rules
- [Any rules targeted at AI agents]

### Available Commands (from .claude/commands/)
- [command-name] — [what it does]

### Available Skills (from other tools)
- [List skills found in .claude/skills, .cursor/skills]
```

Focus on actionable information. Skip boilerplate and obvious conventions.

## Step 3: Register External Skills

If `.claude/skills/` or other skill directories exist, suggest registering them in `.pi/settings.json` so pi can use them too:

```json
{
  "skills": ["../.claude/skills"]
}
```

Ask the user if they want to create or update `.pi/settings.json` with the discovered skill paths. Only do this if skills were actually found.

## Step 4: Note What to Remember

After summarizing, highlight the **top 3-5 things to keep in mind** while working in this project. These are the conventions most likely to be violated if forgotten — things like:
- Specific commit message formats
- Required co-author lines
- Mandatory test patterns
- Forbidden patterns or anti-patterns
- Package manager preferences (don't use npm when pnpm is required)

## Step 5: Security & Smell Sweep

When the user wants a security/smell sweep ("anything shady", "check for issues", "security scan"), load [`references/security-sweep.md`](references/security-sweep.md) and follow it. It contains the full rg/git command blocks, the "Do NOT flag" list, the severity guide, and the report template.

A conventions-only run (Steps 1–4) can skip this step entirely.
