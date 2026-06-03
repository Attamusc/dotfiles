---
name: adversarial-shepardize
description: Verify that cited sources actually say what the document claims. Use when asked to "shepardize", "verify citations", "check sources", "citation integrity check", "do the sources support this", "check source fidelity", or before delivering research output. Reusable by adversarial-reviewer, researcher, and planner agents. Called as subroutine S6 by adversarial-review-research.
---

# Adversarial Shepardize

Subroutine for citation integrity verification. Verifies that each source cited in a document actually says what the author claims it says. Highest-signal finding type in research review — misrepresented citations are auto-Tier-1 findings (see `adversarial-reviewer.md` D8).

**Vocabulary:** Evidence labels, constants (`FETCHED_QUOTE_MAX_CHARS`, `TRAINING_LABEL_CONFIDENCE_CAP`), and the evidence label taxonomy are defined in `~/.pi/agent/agents/adversarial-reviewer.md`. Do not redefine them here — use them exactly as specified there.

---

## Procedure

### Step 1 — Enumerate cited sources

Scan the target document and extract every citation. For each, record:

```
citation_id       # C1, C2, ... (assign sequentially)
author_claim      # exact phrase or sentence the author makes about this source
source_locator    # URL, DOI, file path, or full bibliographic citation string
```

Include inline citations, footnotes, and reference lists. If a claim has no citation, skip it (out of scope for this subroutine — flag it as an unsupported assumption in the main review pipeline instead).

### Step 2 — Attempt retrieval for each source

Try retrieval in this order:

1. **URL present** → use `mcp` (WebFetch) to fetch the page
2. **Local file path** → use `read`
3. **DOI or bibliographic citation without URL** → use `mcp` (WebSearch) to locate the source; if found, fetch it
4. **Cannot locate** → record retrieval failure; verdict will be `UNVERIFIABLE`

If retrieval partially succeeds (e.g., abstract only, paywalled body), note what was accessible.

### Step 3 — Extract the relevant passage

From the retrieved content, find the passage the author is citing. The passage must:

- Be from the portion of the source that plausibly supports the author's claim
- Be verbatim (no paraphrase)
- Be ≤ `FETCHED_QUOTE_MAX_CHARS` characters (200 chars per the agent file)

**Do not quote an unrelated passage to fill the cell.** If no relevant passage can be identified, the evidence label is `[ABSENT]` or the verdict is `UNVERIFIABLE`.

Label the retrieved passage with the appropriate evidence label from the agent file taxonomy (`[FETCHED]`, `[CODEBASE]`, `[ABSENT]`, etc.).

### Step 4 — Compare and assign verdict

Compare the author's claim to what the source actually says. Assign exactly one verdict:

| Verdict | Meaning |
|---------|---------|
| `CONFIRMED` | The source says what the author claims. No material difference. |
| `MISREPRESENTED` | The source says something materially different from the author's claim. **Auto-Tier-1 finding — bypasses intensity thresholds.** |
| `CHERRY-PICKED` | The source contains the quoted material, but surrounding context inverts or substantially qualifies the claim. **Auto-Tier-1 finding — bypasses intensity thresholds.** |
| `UNVERIFIABLE` | Source could not be retrieved or no relevant passage could be extracted. **State the reason explicitly** (paywalled, dead link, no relevant passage found, etc.). |
| `IRRELEVANT` | Source was retrieved but does not address the author's claim at all — decorative citation. |

**No additional verdicts.** These five are exhaustive.

### Step 5 — Write the row

Add one row to the shepardizing table (see Output Format below).

Repeat Steps 2–5 for each citation enumerated in Step 1.

---

## Output Format

Produce a table matching D6 Section 4 of the spec:

```markdown
| # | Source | Author's claim | What source actually says | Verdict |
|---|--------|---------------|--------------------------|---------|
| C1 | Smith 2023 https://example.com/paper | "X causes Y in 90% of cases" | [FETCHED] "X is associated with Y in some cases; causal mechanism unestablished. Effect size was 0.3 in the 2021 cohort." | MISREPRESENTED |
| C2 | Jones et al. 2022 (no URL) | "Widely adopted by major practitioners" | [UNVERIFIABLE] Source not findable via web search. DOI 10.xxxx/yyyy returns 404. | UNVERIFIABLE |
| C3 | NIST SP 800-53 https://csrc.nist.gov/... | "Mandates annual key rotation" | [FETCHED] "Organizations should establish key rotation periods based on risk assessment." No mandate for annual. | MISREPRESENTED |
```

**Column rules:**
- `#` — citation ID (C1, C2, ...)
- `Source` — author name + year + URL or DOI if available
- `Author's claim` — the specific claim the author makes attributed to this source (verbatim or close paraphrase)
- `What source actually says` — evidence label + verbatim quote ≤ `FETCHED_QUOTE_MAX_CHARS`; or `[UNVERIFIABLE]` + reason
- `Verdict` — one of the five verdicts above

**Hard rules (from agent file):**
- Every cell in "What source actually says" MUST carry an evidence label
- `[FETCHED]` requires verbatim quote ≤ `FETCHED_QUOTE_MAX_CHARS`; if no quote can be produced, downgrade to `[TRAINING]` with confidence cap per the agent file
- `UNVERIFIABLE` MUST state the retrieval failure reason
- `MISREPRESENTED` and `CHERRY-PICKED` are auto-Tier-1 findings; they are escalated to the main Objections section of the parent review with their own `O<N>` ID

---

## Invocation Contexts

### Called by `adversarial-review-research` (S6 subroutine)

The shepardizing table is produced and folded into **Section 4 (Citation Shepardizing)** of the parent review artifact at `~/.pi/agent/reviews/<slug>-<timestamp>.md`. The parent skill handles the composition — this subroutine delivers the completed table rows.

`MISREPRESENTED` and `CHERRY-PICKED` findings must ALSO be escalated into Section 3 (Objections) as top-level `O<N>` entries by the parent skill. Include a cross-reference: `"See C<N> in Citation Shepardizing table."` Do not duplicate the full table row — just the objection block.

### Called standalone (by `researcher`, `planner`, or direct invocation)

Produce a standalone artifact:

**Location:** `~/.pi/agent/reviews/shepardize-<source-slug>-<timestamp>.md`

**Format:**
```markdown
# Citation Integrity Check

**Target:** <document path or description>
**Timestamp:** <ISO 8601>
**Invoker:** <agent name or "direct">

## Shepardizing Table

| # | Source | Author's claim | What source actually says | Verdict |
|---|--------|---------------|--------------------------|---------|
...

## Summary

- <N> citations checked
- <N> CONFIRMED, <N> MISREPRESENTED, <N> CHERRY-PICKED, <N> UNVERIFIABLE, <N> IRRELEVANT
- Auto-Tier-1 findings: <list C<N> IDs that are MISREPRESENTED or CHERRY-PICKED, or "none">
```

Print the output file path at the end of the session.

---

## Scope Boundary

This subroutine covers **cited sources only**. Unsupported claims (assertions with no citation) are out of scope here — they belong in the main review pipeline as unsupported assumptions (S2/S7). Flag them if noticed, but do not include them in the shepardizing table.
