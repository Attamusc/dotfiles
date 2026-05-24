---
description: Grill decisions until clear, then plan and execute
argument-hint: "<what to explore>"
---

# BBQ — Grill → Plan → Execute

You are running the **BBQ workflow** — a grill-with-docs session that keeps asking until decisions are clear enough to hand off to the full planning loop.

**Announce at start:** "🔥 Starting BBQ — I'll grill this topic until we have clear decisions, then we'll roll straight into planning and execution."

---

## The Flow

```
Phase 1: Quick Assessment (main session — 30s orientation)
    ↓
Phase 2: Scout (autonomous — codebase context for the grill)
    ↓
Phase 3: Grill Session (interactive — resolve all decisions)
    ↓
Phase 4: Transition to /plan (with grill artifact as input)
```

---

## Phase 1: Quick Assessment

Quick orientation — tech stack, domain docs, existing grill artifacts:

```bash
ls -la
ls CONTEXT.md CONTEXT-MAP.md docs/adr/ 2>/dev/null
find . -path "*/grill/*.md" -not -path "*/node_modules/*" 2>/dev/null
```

Understand the project shape and whether domain documentation already exists.

---

## Phase 2: Scout

Spawn a scout to gather context for the grill session:

```typescript
subagent({
  name: "🔍 Scout",
  agent: "scout",
  task: `Analyze the codebase for: $@

Map file structure, key modules, patterns, conventions, and existing code related to this area. Also check for:
- CONTEXT.md / CONTEXT-MAP.md (domain language)
- docs/adr/ (prior decisions)
- Any grill artifacts in grill/ directories

Focus on what someone would need to understand before making design decisions about this topic.

Save your findings to: .pi/plans/bbq-scout-context.md`,
});
```

Wait for the scout to finish. Read the scout context — you'll pass it to the grill session.

---

## Phase 3: Grill Session

Spawn an interactive grill-with-docs session. The key difference from a normal grill: **this session must keep going until it produces a document clear enough that a planner can act on it without guessing.**

```typescript
subagent({
  name: "🔥 BBQ: $@",
  agent: "planner",
  interactive: true,
  task: `You are running a GRILL SESSION, not a planning session. Do NOT plan, do NOT create todos, do NOT write a plan.md. Your ONLY job is to interview the user relentlessly until every decision is resolved.

Load the grill-with-docs skill and follow its process exactly.

## Topic
$@

## Scout Context
[paste scout findings here]

## Your Mission

Interview the user about this topic. Walk down every branch of the decision tree. For each question, provide your recommended answer.

Ask questions ONE AT A TIME, waiting for feedback before continuing.

If a question can be answered by exploring the codebase, explore it yourself instead of asking.

### Completion Criteria

Keep grilling until ALL of these are true:
1. Every design decision has been explicitly resolved (no "TBD" or "we'll figure it out later")
2. Domain terminology is sharp — every key term has a clear definition (update CONTEXT.md inline)
3. Scope is crisp — what's in, what's out, what's deferred
4. Edge cases and failure modes have been discussed
5. You could write a document that a stranger could use to plan the implementation without asking any questions

### When You're Done

When all branches are resolved, write a decisions artifact using write_artifact:

write_artifact(name: "grill/<date>-<topic>.md", content: "...")

Use this format:
- Decisions (each with question, decision, rationale)
- Domain Updates (CONTEXT.md terms added/modified, ADRs created)
- Scope (in/out/deferred)
- Key Constraints Surfaced
- Open Questions (only if truly unresolvable now)

Then tell the user: "Grill complete. Exit this session (Ctrl+D) to start the planning phase."`,
});
```

**The user works with the grill agent.** When the grill session closes, read the grill artifact.

---

## Phase 4: Transition to Plan

Once the grill session closes and produces its artifact:

1. Read the grill artifact
2. Invoke `/plan` with the topic and a reference to the grill artifact:

```
/plan $@ — Grill decisions resolved at [grill artifact path]. Build on those decisions.
```

This hands off to the standard planning workflow (scout → planner → workers → reviewer), with the grill artifact as input context.

---

## Topic

$@
