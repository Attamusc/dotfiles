---
description: Grill decisions until clear, then plan and execute
argument-hint: "<what to explore>"
---

# BBQ — Grill → Plan → Execute

You are running the **BBQ workflow** — a grill-with-docs session that keeps asking until decisions are clear enough to hand off to the full planning loop.

**Announce at start:** "🔥 Starting BBQ — I'll grill this topic until we have clear decisions, run an adversarial review on those decisions, then roll into planning and execution (pausing if the decisions don't survive review)."

---

## The Flow

```
Phase 1: Quick Assessment (main session — 30s orientation)
    ↓
Phase 2: Scout (autonomous — codebase context for the grill)
    ↓
Phase 3: Grill Session (interactive — resolve all decisions)
    ↓
Phase 3.5: Adversarial Review of Decisions  ← NEW
    ↓
    SURVIVES / WITH CAVEATS → continue
    WOUNDED / DOES NOT SURVIVE → ⏸️ PAUSE
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

## Phase 3.5: Adversarial Review of Decisions

Decisions are too consequential to silently propagate into planning. AR-1 catches unsupported assumptions, logical gaps, and missing alternatives before they corrupt the plan — when they're cheapest to fix. This phase runs autonomously after the grill session closes and before handing off to `/plan`. Spec: D9 of `~/.pi/agent/grill/2026-06-03-adversarial-reviewer.md`.

1. **Note the grill artifact path** from the Phase 3 output (e.g. `grill/<date>-<topic>.md`).

2. **Spawn the adversarial reviewer** in research mode, scoped to the decisions:

```typescript
subagent({
  name: "AR-1: BBQ $@",
  agent: "adversarial-reviewer",
  interactive: false,
  task: `Mode: research
Target: <grill-artifact-path>
Scope: decisions
Flags: steelman=false emit_json=false`,
});
```

3. **Wait for AR-1 to finish.** It writes its review artifact to `~/.pi/agent/reviews/<slug>-<timestamp>.md` and prints the path.

4. **Read the verdict** from the artifact header (first line under the title).

5. **Branch on verdict:**

   - **`SURVIVES`** → Proceed to Phase 4 with no interruption. Print:
     ```
     ✅ Decisions survived adversarial review. Proceeding to /plan.
     ```

   - **`SURVIVES WITH CAVEATS`** → Append the AR-1 caveats to the grill artifact as a "Known Constraints (from AR-1)" section, then proceed to Phase 4 automatically. Print:
     ```
     ⚠️ Decisions survived with caveats. Caveats folded into <grill-artifact-path>. Proceeding to /plan.
     ```

   - **`WOUNDED`** or **`DOES NOT SURVIVE`** → **PAUSE. Do NOT transition to /plan.** Print:
     ```
     ⏸️ BBQ PAUSED — Decisions did not survive adversarial review.

     Verdict: <WOUNDED|DOES NOT SURVIVE>
     Review artifact: <path>
     Grill artifact: <grill-artifact-path>

     Next steps:
     1. Read the review at <path>
     2. Address Tier-1 objections by updating <grill-artifact-path>
     3. Re-run AR-1 manually: `/review <grill-artifact-path> --scope decisions`
     4. When the verdict is SURVIVES or SURVIVES WITH CAVEATS, manually invoke /plan with the updated grill artifact
     ```

---

## Phase 4: Transition to Plan

Once Phase 3.5 has returned SURVIVES or SURVIVES WITH CAVEATS and produces its artifact:

1. Read the grill artifact
2. Invoke `/plan` with the topic and a reference to the grill artifact:

```
/plan $@ — Grill decisions resolved at [grill artifact path]. Build on those decisions.
```

This hands off to the standard planning workflow (scout → planner → workers → reviewer), with the grill artifact as input context.

---

## Topic

$@
