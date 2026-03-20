---
name: agents-md
description: "Create and maintain AGENTS.md files that give AI coding agents the non-discoverable context they need to work effectively in a codebase. Use when initializing a new project for AI agents, creating AGENTS.md files, auditing existing AGENTS.md files, or when the user runs /init. Triggers: 'create agents.md', 'init agents', 'set up for AI agents', 'what should go in agents.md', 'audit agents.md', '/init'."
---

# AGENTS.md Methodology

Create AGENTS.md files that contain *only* information an AI agent cannot
discover by reading the code. Every line must pass the discoverability filter.

## The Discoverability Filter

Before writing any line, ask: **"Can the agent discover this by reading the
code, running the build, or listing the directory?"** If yes, do not write it.

**Belongs in AGENTS.md:**
- Tooling gotchas (e.g., types-only packages, non-obvious build targets)
- Platform constraints that aren't evident from code (e.g., desktop-only, no mobile)
- Architectural decisions that *look wrong* but are intentional
- Module boundaries that must not be violated (and why)
- Things that break silently (deep merge vs spread, PATH not inherited)
- Test environment traps (mocks, aliases, re-implemented private logic)
- CI/deployment constraints not captured in config files

**Does NOT belong:**
- Project structure trees (agent runs `ls`)
- Tech stack descriptions (agent reads `package.json`)
- Naming conventions, import ordering, lint rules (agent reads config)
- API documentation (agent reads source + types)
- Anything already enforced by linters, formatters, or CI checks

## Investigation Process

### Phase 1: Explore

Use parallel subagent tasks to investigate the codebase across these dimensions:

1. **Landmines** -- Things that would break silently or waste significant time.
   Search for: type-only packages, external markers in build config, mocked
   modules, undocumented adapter casts, environment-dependent behavior, deep
   merges, initialization order dependencies.

2. **Architecture** -- Intentional patterns that look wrong to an outsider.
   Search for: dependency inversion, zero-dependency modules, deliberate
   coupling, interface-driven designs, barrel file conventions.

3. **Scoped file assessment** -- Determine which directories are complex enough
   to warrant their own AGENTS.md. Criteria: 3+ landmines, non-obvious module
   boundary, test environment that differs from the rest of the project.

### Phase 2: Filter

For each finding, apply the discoverability filter. Discard anything the agent
would learn from its first `ls`, `cat package.json`, or build attempt.

### Phase 3: Write

1. **Root AGENTS.md** -- Repo-wide landmines + routing to scoped files.
   Keep under 80 lines. Use sections like: Tooling, Platform Constraints,
   Module Boundaries, Test Environment. Do NOT repeat information from
   scoped files.

2. **Scoped AGENTS.md files** -- One per complex subsystem directory. Each
   should be self-contained (no need to read root file for local context).
   Keep under 40 lines each.

3. **Tone** -- Direct, imperative. "Do not X" rather than "We prefer not to X."
   Each line is a warning label, not documentation.

### Phase 4: Verify

Run the project's build and test suite. Confirm the AGENTS.md content is
accurate and nothing was missed that caused a failure.

## File Structure Guidance

```
project/
  AGENTS.md              # Root: repo-wide landmines + routing
  src/
    views/AGENTS.md      # Scoped: view-layer specifics
    services/AGENTS.md   # Scoped: service-layer specifics
```

**When to create scoped files:** A directory warrants its own AGENTS.md when it
has 3+ non-discoverable landmines, a distinct test environment, or module
boundaries that an agent would likely violate.

**When NOT to create scoped files:** Small directories, directories where all
context fits in 2-3 lines in the root file, directories without landmines.

## Update Mode

When updating existing AGENTS.md files (e.g., `/init update`):

1. Read all existing AGENTS.md files in the project
2. Re-run the investigation process
3. Remove lines that are no longer accurate (code changed)
4. Remove lines that fail the discoverability filter on review
5. Add new findings
6. Verify build + tests still pass

## Research Background

For academic research supporting this methodology (Lulla et al. ICSE 2026,
ETH Zurich study), see `references/article-research.md`.
