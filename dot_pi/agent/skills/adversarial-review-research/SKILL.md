---
name: adversarial-review-research
description: Research-mode review procedure for adversarial-reviewer. Fires when the target is a `.md`/`.txt` file, URL, or raw claim text. Invoked by the agent's turn-1 dispatch.
---

# Adversarial Review — Research Mode

**This is a procedure file, not a standalone skill.** It is loaded by the `adversarial-reviewer` agent after turn-1 dispatch resolves the target as research mode.

**Vocabulary authority:** Evidence labels (`[FETCHED]`, `[CODEBASE]`, `[TRAINING]`, `[REASONING]`, `[ABSENT]`), tunable constants (`TIER_1_CONFIDENCE_FLOOR`, `TIER_2_CONFIDENCE_FLOOR`, `TIER_1_HARD_CAP`, `TRAINING_LABEL_CONFIDENCE_CAP`, `FETCHED_QUOTE_MAX_CHARS`, `WITHDRAWAL_CONFIDENCE_FLOOR`), and the 4-tier verdict scale are defined in `~/.pi/agent/agents/adversarial-reviewer.md`. **Do not redefine any of these here.**

---

## Pipeline Execution Order

```
S1 → S2 → [S3 opt-in] → S6 → S4 → S5 → S7 → S8
```

Execute all steps before writing the output artifact. Do not interleave composition with execution — complete all steps, then assemble D6 sections.

---

## S1 — Restate the Claim

**Purpose:** Confirm the target before attacking it. Produces a crisp restatement in the reviewer's own words that locks in what is being reviewed.

**How:**
1. Read the full target (file, URL content, or free-form text).
2. Write 2–4 sentences restating the central claim(s) as you understand them.
3. Note the scope: what the work claims to establish (not what it does establish).

**Output:** Internal working note only — not surfaced as a numbered section. Feeds Bottom Line (S8 → Section 2). If the restatement reveals the claim is ambiguous or unspecified, surface that ambiguity as an objection in S7.

---

## S2 — Key Assumptions Check

**Purpose:** Enumerate every load-bearing implicit assumption the work makes and rate each by confidence × impact.

**How:**
1. List every assumption the central claim depends on — include hidden premises.
2. For each assumption:
   - **Confidence rating** (0–100%) — how confident are you the assumption is actually true?
   - **Impact if false** (High / Medium / Low) — would the claim collapse, weaken, or survive?
3. High-impact, low-confidence assumptions are likely to surface as Tier-1 objections in S7 — flag them for promotion.

**Output format:** Table for Section 5.

```markdown
| # | Assumption | Confidence | Impact if False | Notes |
|---|-----------|-----------|-----------------|-------|
| A1 | ... | 40% | High | flagged for S7 |
```

**Output composition:** → Section 5 (Key Assumptions Surfaced)

---

## S3 — Steelman (Opt-In)

> **Only execute if `--steelman` flag was passed.**

**Purpose:** Articulate the strongest possible version of the claim before attacking it. Prevents attacking a straw man.

**How:**
1. Restate the claim in its most defensible form — fill obvious gaps, assume best-faith readings.
2. Identify the 2–3 strongest pieces of evidence or arguments in its favor.
3. Note what would need to be true for the claim to fully survive scrutiny.

**Position:** Execute after S2, before S6. Doubles output size — only enable when the claim is vaguely stated or the author is not present to defend.

**Output composition:** → Not a numbered D6 section. Used internally to calibrate S7 objection thresholds. Optionally append as a labeled sub-section under Section 2 (Bottom Line) with header `### Steelman (requested)`.

---

## S6 — Citation Shepardize

**Purpose:** Verify that every cited source actually says what the author claims it says.

**How:** **Invoke the `adversarial-shepardize` skill.** Do not reimplement the procedure here — load and follow `~/.pi/agent/skills/adversarial-shepardize/SKILL.md`.

The shepardize skill produces a completed Section 4 table (Citation Shepardizing). Fold that table directly into the artifact.

### Cross-Section Escalation (CRITICAL)

When the shepardize subroutine returns any row with verdict `MISREPRESENTED` or `CHERRY-PICKED`, **this skill — not the subroutine — owns the promotion to Section 3 (Objections):**

1. For each `MISREPRESENTED` / `CHERRY-PICKED` row (citation ID `C<N>`):
   - Create a top-level objection `O<N>` in Section 3.
   - **Tier: always Tier-1.** Shepardize findings bypass all intensity thresholds (per `adversarial-reviewer.md` D8 — "Citation shepardizing findings (S6): bypass thresholds — any misrepresented citation is auto-Tier-1 regardless of confidence").
   - Objection block:
     ```
     **O<N> — Misrepresented citation: <source short name>** [FETCHED]
     Tier: 1 (auto — shepardize finding)
     Confidence: [use confidence from the shepardize row, or 80% if not stated]
     Consequence if true: The claim's evidentiary basis is weaker than presented; readers following the citation will not find support for the stated conclusion.
     See C<N> in Citation Shepardizing table (Section 4).
     ```
   - Do NOT duplicate the full table row. The cross-reference is sufficient.

2. These `O<N>` IDs are reserved first. Regular S7 objections are numbered after them.

**Output composition:**
- Section 4 (Citation Shepardizing table) ← table produced by `adversarial-shepardize`
- Section 3 (Objections) ← MISREPRESENTED / CHERRY-PICKED rows promoted as auto-Tier-1 `O<N>`

---

## S4 — Pre-Mortem

**Purpose:** Generate a list of plausible failure modes by assuming the claim has already been disproved. Unfiltered — inclusion criterion is "plausible enough to be worth defending against."

**How:**
1. Start with: *"Assume this claim has been conclusively disproved. List every reason why."*
2. Generate an unfiltered list — do not apply confidence thresholds yet.
3. For each failure mode, ask: "Can I label this with evidence?" If yes, it's a candidate for S7. If it's speculation only, it may still be worth surfacing if plausible.

### S4 in Research Mode — Resolution

The D6 artifact has a Pre-mortem Failure Modes section (Section 6) **only in change mode**. In research mode, Section 6 does not appear. This is intentional: the research artifact emphasizes citation integrity (S6) and competing hypotheses (S5) over speculative pre-mortem.

**Resolution:** S4 pre-mortem findings in research mode are NOT written to a standalone section. Instead:
- If a finding meets the S7 threshold (confidence ≥ `TIER_2_CONFIDENCE_FLOOR`) AND can carry an evidence label → promote it to S7 as a regular objection.
- If a finding is below threshold or is pure speculation → dropped. Count it in the S7 dropped-count footer.

**Output composition:** → No dedicated section in research mode. Qualifying findings feed into Section 3 (Objections) via S7. Below-threshold findings feed the dropped-count footer.

---

## S5 — Analysis of Competing Hypotheses (ACH)

**Purpose:** Enumerate alternative explanations or hypotheses that would equally or better account for the same evidence. Forces acknowledgment of alternatives the work ignores.

**How:**
1. Identify the central hypothesis (H1 = the work's claim).
2. Generate at least 2 alternative hypotheses (H2, H3, ...) that could explain the same evidence.
3. Build an evidence × hypothesis matrix:
   - Rows: pieces of evidence cited in the work
   - Columns: each hypothesis (H1 through H<N>)
   - Cells: `consistent (+)`, `inconsistent (−)`, `neutral (~)`, or `unknown (?)`
4. Score each hypothesis: count `−` marks (inconsistencies). Fewer inconsistencies = more viable.
5. Note which hypotheses the work fails to consider.

**Output format:**

```markdown
### Hypotheses

- **H1** (author's claim): <statement>
- **H2**: <alternative>
- **H3**: <alternative>

### Evidence × Hypothesis Matrix

| Evidence | H1 | H2 | H3 |
|----------|----|----|-----|
| E1: ...  | +  | +  | −   |
| E2: ...  | +  | ~  | +   |
| ...      |    |    |     |

**Inconsistency count:** H1: 0, H2: 1, H3: 1
**Conclusion:** <1-2 sentences on which alternatives are viable and whether H1 is uniquely supported>
```

**Output composition:** → Section 7 (Competing Hypotheses / ACH matrix)

---

## S7 — Structured Objection List

**Purpose:** Produce the tiered objection list that drives the verdict.

**How:**
1. **Reserve O-numbers** for S6 shepardize promotions (auto-Tier-1). These are already filed.
2. Collect all remaining objection candidates from S2 (flagged assumptions), S4 (promoted pre-mortem findings), S5 (unaddressed alternatives), and any direct analysis.
3. For each candidate, assign:
   - Evidence label (from agent file taxonomy — mandatory)
   - Confidence (0–100%)
   - Tier: Tier-1 if confidence ≥ `TIER_1_CONFIDENCE_FLOOR`; Tier-2 if ≥ `TIER_2_CONFIDENCE_FLOOR`; dropped otherwise
4. Apply **Cluster Rule** (from D8): 3+ Tier-2 objections converging on the same assumption → synthesize into a Tier-1 cluster objection.
5. Apply **Hard Cap**: maximum `TIER_1_HARD_CAP` Tier-1 objections total (including S6 promotions). If exceeded, collapse by theme and surface strongest representatives.
6. Drop sub-threshold findings; count them for the footer.

**Objection block format:**

```markdown
**O<N> — <Short title>** [LABEL]
Tier: <1 or 2>
Confidence: <range or value>%
Consequence if true: <1 sentence — what breaks if this objection holds>
<Detail paragraph with evidence>
```

**Footer (after all objections):**
```
N sub-threshold concerns considered and dropped (confidence < TIER_2_CONFIDENCE_FLOOR%).
```

**Output composition:**
- Section 3 (Objections) — Tier-1 followed by Tier-2, each labeled by tier
- Section 8 (Unfalsifiable / Out of Scope) — items declined, with reason

---

## S8 — Forced Verdict

**Purpose:** Produce the final verdict. Forced — pick exactly one tier. No hedging.

**How:**
1. Review all Tier-1 objections (including auto-Tier-1 shepardize findings).
2. Apply the 4-tier verdict scale from `adversarial-reviewer.md`:
   - No material Tier-1 objections → `SURVIVES`
   - Tier-1 objections present but none falsify the central claim → `SURVIVES WITH CAVEATS`
   - At least one load-bearing Tier-1 objection; central claim weakened → `WOUNDED`
   - Central claim falsified or wholly unsupported → `DOES NOT SURVIVE`
3. Write the Bottom Line: 2–3 sentences, references only Tier-1 objections, no hedge.
4. Write "What Would Change the Verdict" — mandatory: explicit conditions under which the verdict would move up or down a tier.

**Anti-weasel check:** Read the verdict sentence. If it contains "it depends", "further analysis needed", or any hedge — rewrite it.

**Output composition:**
- Section 1 (Header) — verdict as first line, plus: target ref, mode (`research`), scope, timestamp, reviewer model
- Section 2 (Bottom Line) — verdict rationale, Tier-1 refs only
- Section 9 (What Would Change the Verdict) — mandatory

---

## Output Artifact Composition

After all pipeline steps complete, assemble the artifact at:

`~/.pi/agent/reviews/<slug>-<timestamp>.md`

Sections in order (per D6, research-mode subset):

| Section | Name | Written by |
|---------|------|------------|
| 1 | Header (verdict, target, mode, scope, timestamp) | S8 |
| 2 | Bottom Line | S8 |
| 3 | Objections (Tier-1 then Tier-2) | S6 promotions + S7 |
| 4 | Citation Shepardizing table | S6 (`adversarial-shepardize` output) |
| 5 | Key Assumptions Surfaced | S2 |
| 6 | *(Pre-mortem — change mode only; omit in research mode)* | — |
| 7 | Competing Hypotheses / ACH matrix | S5 |
| 8 | Unfalsifiable / Out of Scope | S7 |
| 9 | What Would Change the Verdict | S8 |

**Print the output file path at the end of every session.**

