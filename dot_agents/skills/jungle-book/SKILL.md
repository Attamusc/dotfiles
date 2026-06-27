---
name: jungle-book
description: "Relentless codebase analysis that classifies every recurring pattern into three buckets — positive (reinforce), negative (fix), inbetween (decide) — and produces a portable artifact with migration paths. Use when asked to run 'jungle-book', 'analyze the codebase', 'assess codebase health', or 'find friction' — any honest, opinionated evaluation of codebase patterns and conventions. Works on whole codebases by default; accepts an optional scope."
---

# Jungle-Book

*Accentuate the positive, eliminate the negative, and look out for Mr. Inbetween.*

Relentless, opinionated codebase analysis. Find every recurring pattern, classify it honestly, and produce a portable artifact that tells whoever picks it up: here's what's good, here's what's bad, and here's what could go either way — with a migration path to move everything toward positive.

## Voice

Be blunt. Say "this is sloppy" when it's sloppy and "this is elegant" when it's elegant. Don't pad, don't hedge, don't soften. Respect the reader's time. The personality is in the economy, not the flourish.

## Glossary

Six terms. Use these exactly — don't substitute synonyms or introduce parallel vocabulary. Full definitions in [GLOSSARY.md](GLOSSARY.md).

- **Pattern** — any recurring shape in the codebase (naming convention, abstraction, error handling, file layout, data flow)
- **Friction** — resistance the codebase creates against change
- **Creep** — a gap that isn't hurting today but trends toward decay
- **Signal** — how clearly a pattern communicates its intent to a new reader
- **Drift** — when things that should be the same pattern have quietly diverged
- **Grain** — the natural direction of change in the codebase

## Process

### 1. Read Context

Read whatever exists — depend on nothing. Check for and read if present:

- `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.clinerules`
- `CONTEXT.md`, `CONTEXT-MAP.md`
- `docs/adr/` or equivalent
- `README.md`
- `.jungle-book/` — prior runs (especially the positive catalog from the most recent full run)

This informs what's settled, what the project's language is, and what has already been analyzed. If nothing exists, that's fine — the skill works cold.

### 2. Preliminary Scan

Fast pass over the codebase to understand shape and decide scout division:

```bash
# File tree structure (depth-limited)
find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/vendor/*' -not -path '*/dist/*' -not -path '*/__pycache__/*' | head -500

# Directory structure
find . -type d -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/vendor/*' -maxdepth 3

# Language/framework signals
ls package.json Cargo.toml go.mod pyproject.toml Gemfile *.sln 2>/dev/null
```

Use this to determine:
- How to divide work across scouts (by feature area, layer, or domain — whatever fits *this* codebase)
- Whether this is a scoped or full run
- What the codebase's likely grain is (initial hypothesis to be refined later)

### 3. Scout Exploration

Spawn up to **3 scouts maximum**. This is a hard cap — not configurable, not negotiable. For small codebases, 1-2 scouts may suffice.

Each scout gets a focused slice of the codebase and the scout brief from [SCOUT-BRIEF.md](SCOUT-BRIEF.md). Scouts **describe** — they do not evaluate or classify. That's jungle-book's job.

Division strategy is intelligent, not mechanical:
- Don't split by top-level directory blindly (produces uneven work)
- Don't split by concern type (scouts would read the same files)
- Split based on what the preliminary scan revealed — balanced load, minimal overlap

```
subagent(agent: "scout", name: "Scout: <area>", task: "<scout brief + assigned scope>")
```

Wait for all scouts to return before proceeding.

### 4. Synthesize

This is where jungle-book earns its keep. Take all scout observations and:

1. **Deduplicate** — scouts exploring adjacent areas will report the same patterns. Merge them.
2. **Classify** — place every pattern into a bucket:
   - **Positive** — working well, reinforces the codebase's strengths
   - **Negative** — causing friction or trending toward decay
   - **Inbetween** — ambiguous, could go either way, needs a decision
3. **Cross-reference** — every negative and inbetween entry must reference a specific positive pattern as its migration target. If no positive pattern exists to point at, say so explicitly — that's a finding in itself.
4. **Assess grain** — synthesize a 1-2 sentence grain assessment for the whole codebase.
5. **Rank** — identify top 3 migration priorities from negative and inbetween entries.

### 5. Write Artifact

Write the artifact to `.jungle-book/`. See [ARTIFACT-FORMAT.md](ARTIFACT-FORMAT.md) for the full template.

```bash
mkdir -p .jungle-book
```

File naming:
- Full run: `.jungle-book/YYYY-MM-DD-full.md`
- Scoped run: `.jungle-book/YYYY-MM-DD-<scope>.md`

The artifact is **self-contained** — glossary included, no external dependencies to understand it.

### Scoped Runs

When given a scope (module, feature area, set of files):

- Skip scout spawning if scope is small enough for a single pass
- Still produce all three buckets — even a small scope has positive patterns worth naming
- Reference the positive catalog from the most recent `.jungle-book/*-full.md` if one exists — scoped migration paths can point at positive patterns found in prior full runs
- If no prior full run exists, note this in the summary: "No prior full-run catalog available. Migration paths reference only patterns found within scope."

## Constraints

- **One artifact per run.** No side effects on CONTEXT.md, AGENTS.md, ADRs, or other project files. If those need updating, it's a finding in the artifact.
