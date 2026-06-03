---
name: adversarial-review-change
description: Change-mode review procedure for the adversarial-reviewer agent. Fires when the target is a code diff, GitHub PR URL, or working-tree diff. Runs pipeline S1 → S2 → S4 → S7 → S8 (S3 steelman is opt-in).
---

# Adversarial Review — Change Mode

You were dispatched here by the agent's turn-1 mode dispatch because the target is a code diff, PR URL, or working-tree. This skill defines the full pipeline. Execute it without deviation.

**Vocabulary, constants, evidence labels, verdict scale, and pushback protocol are defined in `~/.pi/agent/agents/adversarial-reviewer.md`. Do not redefine them here — use them exactly as specified there.**

Sections 4 (Citation Shepardizing) and 7 (ACH — Competing Hypotheses) are **research-mode-only** — change-mode artifacts omit them entirely.

---

## Input Acquisition (Execute Before S1)

Determine what diff to work from. Exactly one of these applies:

| Target type | How to acquire |
|-------------|---------------|
| Working-tree diff vs. base ref | `git diff <base>...HEAD` (default base: `main`); if no base supplied, use `git diff main...HEAD` |
| GitHub PR URL | `gh pr diff <PR-URL>` — fetches the full unified diff |
| Explicit `.diff` / `.patch` file path | `read` the file directly |

After acquiring the diff, also read `--context <path>...` files if the flag was supplied. These are non-diff files (e.g., related modules, interface definitions, docs) provided for grounding.

**Context starvation rule (critical):** Diffs strip surrounding functions. Objecting against stripped context is the #1 false-positive source in change-mode. If `--context` files were NOT supplied, **read the full surrounding functions for every changed hunk before proceeding to S2 and S4**. Use `read` with `offset`/`limit` targeting the relevant file and line range visible in the diff headers.

---

## Pipeline: S1 → S2 → [S3 optional] → S4 → S7 → S8

### S1 — Restate the Change

**What it produces:** A plain-language summary of the change in the reviewer's own words — not a paraphrase of the commit message.

**How to execute:**
- State: what files are touched, what the change does functionally, what the apparent intent is
- Note what is NOT touched that you expected to be (missing migrations, missing tests, absent callers, etc.)
- Do not evaluate yet — this step is purely descriptive

**Output format:**
```
## Change Summary (S1)
<2–4 sentences: what changed, which files, apparent intent, notable omissions>
```

S1 informs the Bottom Line (Section 2 of the artifact) — it is not a standalone artifact section.

---

### S3 — Steelman (opt-in, `--steelman` flag only)

**Insert between S1 and S2 only when `--steelman` is passed.**

**What it produces:** The strongest defensible version of this change — the argument for why it is correct, safe, and necessary.

**How to execute:**
- Articulate the best case for the change: what problem it solves, why this approach is reasonable, what constraints it operates under
- Do not hedge the steelman — state it confidently. This is the strongest form of the argument you're about to attack.

**Output format:**
```
## Steelman (S3)
<3–6 sentences: the best version of the argument for this change>
```

Steelman is not an artifact section in the final output — it is a working step that sharpens subsequent objections. Include it in the working notes but not in the final composed artifact sections.

---

### S2 — Key Assumptions Check

**What it produces:** Surfaced implicit assumptions the change makes about surrounding code, callers, data shapes, user behavior, concurrency, and environment.

**How to execute:**
1. **If no `--context` files were supplied:** read the full surrounding functions for every changed hunk now (if you haven't already). Use `read` with file path and line range from the diff headers.
2. Identify assumptions the change makes that are not validated in the diff:
   - What does the changed code assume about its callers? (argument types, call frequency, concurrency)
   - What does it assume about data shapes? (null safety, array bounds, field presence)
   - What does it assume about environment? (env vars, file system state, external services)
   - What does it assume about user behavior? (ordering, retry logic, idempotency expectations)
3. Assign each assumption a confidence that the assumption is actually true given what you can read in the codebase. This becomes the `impact-if-false` column.

**Output format (→ Section 5, Key Assumptions Surfaced):**
```markdown
| Assumption | Confidence it holds | Impact if false |
|------------|---------------------|-----------------|
| <what the change assumes> | <% range> | <what breaks> |
```

---

### S4 — Pre-mortem: Production Incident Opener

**What it produces:** An unfiltered list of speculative failure modes. This is the highest-value step in change mode.

**Epistemics:** Pre-mortem items are **hypotheses, not claims-of-fact**. They do NOT require `[FETCHED]`/`[CODEBASE]` evidence labels. Inclusion criterion is **looser than objections**: "plausible enough to be worth defending against" — not the `TIER_2_CONFIDENCE_FLOOR` floor that governs objections.

**Framing prompt for this step:**
> Assume this change shipped to production and caused an incident. Why? Generate the unfiltered list of plausible mechanisms.

**Failure mode categories to sweep (do not skip):**
- Null/empty/zero inputs hitting the changed code path
- Off-by-one errors in loops, indexes, ranges, pagination
- Race conditions, missing locks, double-writes, TOCTOU
- Error handling gaps — exceptions swallowed, partial failures silently succeeding
- Security holes: injection vectors (SQL, command, template), auth bypass, secret leakage, SSRF
- Performance cliffs: N+1 queries, unbounded loops, missing indexes on new queries, large payload assumptions
- Breaking API changes: callers that weren't updated, wire format changes, serialization assumptions
- Missing tests: what invariant is now unverifiable in CI?
- Dependency-introduced behavior: what does the library actually do at edge cases the author may not have checked?

**Format each item as:**
```
**PM<N>: <hypothetical incident title>**
Mechanism: <1–2 sentences — what code path fails, under what condition>
Prevention: <what code or check would have caught this>
```

**Hard rule:** Do NOT promote pre-mortem items to Tier-1 objections unless they independently meet the objection evidence + confidence bar (`TIER_1_CONFIDENCE_FLOOR`). Pre-mortem and Objections have different epistemic weight — gaming the system by cross-promoting defeats the purpose of keeping them separate.

**Output format (→ Section 6, Pre-mortem Failure Modes):**
```markdown
## Pre-mortem Failure Modes (S4)

> Assume this change caused a production incident. Speculative — distinct from evidenced objections.

**PM1: <title>**
Mechanism: ...
Prevention: ...

**PM2: <title>**
...
```

---

### S7 — Structured Objection List

**What it produces:** Tiered, evidenced objections per D8 intensity calibration.

**How to execute:**
1. For each potential objection, assign an evidence label from the taxonomy in the agent file (`[CODEBASE]`, `[FETCHED]`, `[REASONING]`, `[ABSENT]`, `[TRAINING]`). In change mode, `[CODEBASE]` dominates — include `file.ts:42` plus verbatim code excerpt (within `FETCHED_QUOTE_MAX_CHARS`).
2. Assign a confidence range.
3. Tier the objection:
   - Confidence ≥ `TIER_1_CONFIDENCE_FLOOR` → **Tier 1** (load-bearing; drives verdict)
   - Confidence `TIER_2_CONFIDENCE_FLOOR`–`TIER_1_CONFIDENCE_FLOOR` → **Tier 2** (secondary)
   - Below `TIER_2_CONFIDENCE_FLOOR` → dropped; count only in footer
4. Apply the Cluster Rule: if 3+ Tier-2 objections point at the same assumption, escalate to a synthetic Tier-1.
5. Apply `TIER_1_HARD_CAP`: collapse by theme if you would exceed the cap.

**`[FETCHED]` usage in change mode:** Use when challenging library or framework behavior the change relies on (e.g., "this assumes `Promise.all` short-circuits on rejection — per MDN [FETCHED quote] it does not"). Always include verbatim quote ≤ `FETCHED_QUOTE_MAX_CHARS`. No quote → downgrade to `[TRAINING]` with confidence cap.

**Output format (→ Section 3 Tier-1 + Tier-2, Section 8 Unfalsifiable):**
```markdown
## Tier-1 Objections (Load-Bearing)

**O1: <title>**
[CODEBASE] `src/foo.ts:42` — `<verbatim code excerpt>`
Confidence: <X%–Y%>
Consequence if true: <what breaks in production>
Detail: <reasoning>

**O2: <title>**
...

## Tier-2 Objections (Secondary Concerns)

**O<N>: <title>**
[REASONING] <explicit logic>
Confidence: <X%–Y%>
Consequence if true: ...
Detail: ...

---
*<N> sub-threshold concerns considered and dropped.*
```

Unfalsifiable items → Section 8 (Unfalsifiable / Out of Scope):
```markdown
**Declined: <item>** — unfalsifiable value claim; out of scope
```

---

### S8 — Forced Verdict

**What it produces:** The verdict, Bottom Line, and mandatory What Would Change the Verdict section.

**How to execute:**
1. Count Tier-1 objections. Apply the four-tier verdict scale from the agent file. Pick exactly one. No hedging.
2. Write the Bottom Line: 2–3 sentences referencing only Tier-1 objections. Do not mention Tier-2 here.
3. Write What Would Change the Verdict: explicit — what evidence, fix, or test would move this verdict one tier up. This section is mandatory.

**Output format:**
```markdown
# Verdict: <SURVIVES | SURVIVES WITH CAVEATS | WOUNDED | DOES NOT SURVIVE>

**Target:** <diff source / PR URL>
**Mode:** change
**Scope:** <scope string or "entire diff">
**Timestamp:** <ISO 8601>

## Bottom Line (S8)

<2–3 sentences. Reference O<N> IDs only from Tier-1. State why the verdict is what it is.>

...

## What Would Change the Verdict (S8)

- Adding <X> would move this from <current verdict> to <next-tier verdict>: <reasoning>
- Demonstrating <Y> would withdraw O<N>: <what evidence is needed>
```

---

## Output Composition

The final artifact assembles sections in this order:

| Section | Content | Produced by |
|---------|---------|-------------|
| 1 — Header | Verdict (first line), target, mode, scope, timestamp, reviewer model | S8 |
| 2 — Bottom Line | 2–3 sentence rationale, Tier-1 refs only | S8 |
| 3 — Objections | Tier-1 + Tier-2 numbered blocks | S7 |
| 4 — Citation Shepardizing | **OMITTED in change mode** | — |
| 5 — Key Assumptions Surfaced | Assumption table | S2 |
| 6 — Pre-mortem Failure Modes | PM<N> items | S4 |
| 7 — ACH Matrix | **OMITTED in change mode** | — |
| 8 — Unfalsifiable / Out of Scope | Declined items | S7 |
| 9 — What Would Change the Verdict | Explicit upgrade conditions | S8 |

Write the artifact to: `~/.pi/agent/reviews/<slug>-<timestamp>.md`

Print the artifact path at the end of the session.

If `--emit-json` flag is set OR the agent was spawned by another agent, also write a sidecar JSON at the same path with `.json` extension.
