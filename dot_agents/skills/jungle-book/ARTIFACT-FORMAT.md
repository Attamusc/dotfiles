# Artifact Format

Every jungle-book run produces exactly one artifact in `.jungle-book/`. The artifact is self-contained — a reader with no other context can understand it.

## Template

```markdown
# Jungle-Book: {scope or "Full Codebase"}

**Date:** YYYY-MM-DD
**Scope:** Full codebase | {description of scope}
**Prior run:** {path to most recent prior run, or "None"}

## Glossary

- **Pattern** — any recurring shape in the codebase (naming, abstraction, error handling, layout, data flow)
- **Friction** — resistance the codebase creates against change
- **Creep** — a gap that isn't hurting today but trends toward decay
- **Signal** — how clearly a pattern communicates its intent to a new reader
- **Drift** — when things that should be the same pattern have quietly diverged
- **Grain** — the natural direction of change in the codebase

## Summary

**Patterns found:** {N positive} positive · {N negative} negative · {N inbetween} inbetween

**Grain:** {1-2 sentences on the codebase's natural direction of change — what kind of changes are easy, what kind fight the structure}

**Top 3 priorities:**
1. {Pattern name} ({bucket}) — {one-line reason} → see [{entry anchor}]
2. {Pattern name} ({bucket}) — {one-line reason} → see [{entry anchor}]
3. {Pattern name} ({bucket}) — {one-line reason} → see [{entry anchor}]

---

## Positive

Patterns earning their keep. These are the standard — migration paths point here.

### {Pattern Name}

- **Where:** {file paths and line ranges}
- **What:** {plain description of the pattern as it exists}
- **Signal:** {strong / weak / ambiguous} — {brief rationale}
- **Grain:** {with / against / ambiguous} — {brief rationale}
- **Drift:** {where this pattern has diverged, or "None observed"}
- **Leverage:** {concrete change scenario — "because of this pattern, doing X requires only Y"}

---

## Negative

Patterns causing friction or trending toward decay. Each points at a positive pattern as its migration target.

### {Pattern Name}

- **Where:** {file paths and line ranges}
- **What:** {plain description of the pattern as it exists}
- **Signal:** {strong / weak / ambiguous} — {brief rationale}
- **Grain:** {with / against / ambiguous} — {brief rationale}
- **Drift:** {where this pattern has diverged, or "None observed"}
- **Risk:** `{Active | Creeping | Dormant}` — {one-sentence scenario: when and how this hurts}
- **Migration path:** {what moving toward positive looks like, referencing a specific positive pattern by name. If no positive pattern exists to target, state that explicitly.}

---

## Inbetween

Patterns that could go either way. The most valuable section — these are the ones that need a decision before they drift negative.

### {Pattern Name}

- **Where:** {file paths and line ranges}
- **What:** {plain description of the pattern as it exists}
- **Signal:** {strong / weak / ambiguous} — {brief rationale}
- **Grain:** {with / against / ambiguous} — {brief rationale}
- **Drift:** {where this pattern has diverged, or "None observed"}
- **Risk:** `{Active | Creeping | Dormant}` — {one-sentence scenario: when and how this hurts}
- **Migration path:** {what moving toward positive looks like, referencing a specific positive pattern by name. If no positive pattern exists to target, state that explicitly.}
```

## Guidelines

- **Pattern count is unconstrained.** Report what's there. Don't pad to look thorough; don't trim to look tidy.
- **Every negative and inbetween entry must have a migration path.** If no positive pattern exists to reference, say: "No positive exemplar found in this codebase. Migration requires establishing a new convention." That's a finding, not a gap in the artifact.
- **Leverage must be concrete.** "Good separation of concerns" is not leverage. "Adding a new payment provider requires one new file in `providers/` and a line in `registry.ts`" is leverage.
- **Risk scenarios must be specific.** "This could cause problems" is not a scenario. "The next time someone adds an API endpoint, they'll have to manually wire up auth, logging, and validation because there's no shared middleware pattern" is a scenario.
- **Signal and grain assessments are per-pattern, not global.** The global grain assessment lives in the summary only.
- **Drift is optional per entry.** Only include when divergence is actually observed. "None observed" is fine.
- **Top 3 priorities can span buckets.** A creeping inbetween pattern might outrank an active negative one if the scenario is worse.
