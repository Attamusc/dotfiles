---
name: grill-me
description: Interview the user relentlessly about a plan or design until reaching shared understanding, resolving each branch of the decision tree. Use when user wants to stress-test a plan, get grilled on their design, or mentions "grill me".
---

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time.

If a question can be answered by exploring the codebase, explore the codebase instead.

## Wrapping up

When the user signals they're done (or all branches are resolved), write a decisions artifact using `write_artifact`:

```
write_artifact(name: "grill/YYYY-MM-DD-<topic>.md", content: "...")
```

### Artifact format

```markdown
# Grill Session: {Topic}

**Date:** YYYY-MM-DD
**Status:** Resolved | Partially resolved

## Decisions

### {Decision 1 title}
**Question:** {The question that was explored}
**Decision:** {What was decided}
**Rationale:** {Why — in one or two sentences}

### {Decision 2 title}
...

## Open Questions
- {Anything deferred or left unresolved}

## Key Constraints Surfaced
- {Non-obvious constraints discovered during grilling}
```

Keep it tight — one section per decision, no filler. This document is the handoff to whoever acts on the decisions (spec agent, planner, or the user themselves).
