# Verification Workflow for Agent Orchestration

**Date:** 2026-05-24
**Status:** Draft
**Directory:** /Users/attamusc/.local/share/chezmoi

## Intent
Prevent hallucinated integration contracts from surviving the planner → worker → reviewer pipeline. The planner is the root cause fix (grounding claims against actual source code). A new validator agent provides independent verification after implementation. Workers and grill sessions get lightweight reinforcement.

## User Story
As a user of the agent orchestration system, I want integration contracts in plans to be grounded in actual source code, so that workers don't implement against fictional APIs and reviewers don't rubber-stamp mismatches.

## Scope

### In Scope
- Planner: new hard rule for grounded claims, plan template integration contracts section, test strategy note
- Worker: contradiction reporting when reality diverges from plan
- Validator: new thin adversarial agent using verify-integration skill
- AGENTS.md: validator in agent table, delegation guidance, skill trigger
- Verification skill: methodology for checking declared contracts
- Grill-with-docs: integration contract surfacing during sessions

### Out of Scope
- Undeclared integration surface discovery (v2)
- Orchestrator enforcement of validator spawning (stays judgment-based)
- Dedicated testing skill or mock-vs-real conventions
- Changes to reviewer.md
- Changes to scout or researcher agents

## Effort & Quality
- **Level:** MVP
- **Tests:** none (prose/config edits)
- **Docs:** inline (files are self-documenting)

## Constraints
- Planner is 459 lines — additions must be surgical (principle-based, not checklist-based)
- Worker stays lean — reports contradictions, does not verify
- All edits to chezmoi source files under `/Users/attamusc/.local/share/chezmoi/`, not target files
- Encode mindset and criteria, not prescriptive checklists
- Validator agent is thin — adversarial framing only, skill carries methodology

## Ideal State Criteria

### Core Functionality
- [ ] ISC-1: Planner hard rules include a grounded-claims rule (principle-based, ~3 sentences)
- [ ] ISC-2: Plan template includes an "Integration Contracts" section
- [ ] ISC-3: Phase 4 test strategy guidance mentions integration surface verification
- [ ] ISC-4: Worker "Read Before You Edit" section includes contradiction-reporting behavior
- [ ] ISC-5: Validator agent definition exists at `dot_pi/agent/agents/validator.md`
- [ ] ISC-6: Validator uses a different model family than reviewer (not claude-opus-4.6)
- [ ] ISC-7: Validator loads the verify-integration skill
- [ ] ISC-8: AGENTS.md agent table includes validator with purpose and model
- [ ] ISC-9: AGENTS.md "When to Delegate" includes validator spawning guidance
- [ ] ISC-10: AGENTS.md skill triggers table includes verify-integration
- [ ] ISC-11: Verification skill exists at `dot_agents/skills/verify-integration/SKILL.md`
- [ ] ISC-12: Grill-with-docs "During the session" includes integration contract surfacing

### Anti-Criteria
- [ ] ISC-A-1: No prescriptive checklists in the planner rule — principle only
- [ ] ISC-A-2: Worker does NOT become a verifier — only reports contradictions
- [ ] ISC-A-3: Validator does NOT hunt for undeclared integration surfaces (v2)
- [ ] ISC-A-4: Reviewer is NOT modified

## Prior Decisions
- **Grill artifact:** `.pi/plans/grill/2025-05-24-verification-workflow.md`
- **Scout context:** `.pi/plans/2025-05-24-verification-workflow/scout-context.md`
- Two distinct principles: "grounded claims" (planner discipline) and "independent verification" (validator role)
- Planner is primary intervention point; downstream is lightweight reinforcement
- Workers report contradictions, they don't verify
- Validator is a new agent, not a reviewer extension — different model family, adversarial framing
- Plans declare integration contracts as forcing function
- Grill sessions surface integration contracts before planning begins
- Orchestrator stays minimal — judgment-based validator spawning

## Approach

Surgical edits to 4 existing files + 2 new files. Each change is small and independently verifiable.

### Key Decisions
- Validator model: `google/gemini-2.5-pro` — different family from reviewer's `claude-opus-4.6`, strong at literal comparison
- Validator is thin (~40-60 lines) — adversarial framing in agent, methodology in skill
- Planner rule follows existing rule style: short, imperative, with a "if you catch yourself" trigger
- Worker addition is 3-4 lines appended to "Read Before You Edit" section

### File Changes

#### 1. `dot_pi/agent/agents/planner.md` (3 surgical edits)

**Edit A — New Hard Rule 6: Ground Your Claims**
Insert after Rule 5 (delegate factual gaps), before "## The Flow". Three sentences, principle-based.

Content shape:
```markdown
### Rule 6: Ground your claims

Every claim you make about an existing system must be verified against actual source code — not recalled from training data, not inferred from naming conventions, not assumed from prior experience. If you haven't read it, you don't know it. Spawn a scout if you need to, but never describe how an API, schema, or contract works without having seen the code that defines it.

**If you catch yourself writing "the API accepts...", "the schema has...", or "the existing system does..." without a file reference — STOP. Read the code first, or spawn a scout.**
```

**Edit B — Integration Contracts in Plan Template**
Add a new section to the plan template, after "Prior Decisions" and before "## Approach":

```markdown
## Integration Contracts
[List every integration surface this feature touches — APIs consumed, schemas conformed to, contracts depended on. For each, name the source of truth file. If you can't name it, the claim isn't grounded.]

| Surface | Source of Truth | Verified |
|---------|----------------|----------|
| [API endpoint / schema / contract] | [file path in codebase] | [yes — read it / no — needs scout] |

[Omit this section for features with no integration surfaces.]
```

**Edit C — Test Strategy Note for Integration**
In Phase 4a (effort level section), after the Tests/Docs lines, add:

```markdown
**If the feature integrates with an existing contract** (API, schema, event format), the test strategy must include at least one verification that doesn't mock that contract. Smoke tests with mocked boundaries are sufficient for isolated logic — they're insufficient when the feature's purpose is integration.
```

#### 2. `dot_pi/agent/agents/worker.md` (1 edit)

Extend "Read Before You Edit" (currently 2 lines) to include contradiction reporting:

```markdown
### Read Before You Edit
Never modify code you haven't read. Understand existing patterns and conventions first.

If what you read in the code contradicts what the plan describes — a field name is different, an API accepts different parameters, a schema has different columns — **stop and report the discrepancy**. Do not silently adapt. The plan may be wrong, or your reading may be wrong, but the mismatch must be surfaced.
```

#### 3. `dot_pi/agent/agents/validator.md` (new file)

Thin adversarial agent. ~50 lines. Shape:

```markdown
---
name: validator
description: Adversarial verification agent — checks implementation against declared integration contracts
tools: read, bash
model: google/gemini-2.5-pro
thinking: medium
spawning: false
auto-exit: true
skills: verify-integration
system-prompt: append
---

# Validator Agent

You are an **adversary, not an ally**. You were spawned to find where the implementation
diverges from the source of truth. You have no investment in the plan succeeding — your
job is to catch what everyone else missed.

You do NOT review code quality (that's the reviewer's job). You verify **contract
compliance** — does the implementation actually match the integration surfaces it claims
to integrate with?

---

## Your Mindset

- **Skeptical by default.** The plan says the API accepts X? Don't trust the plan — read
  the actual API code.
- **Literal, not generous.** If the field is `estimateMinutes` in the source and
  `estimate_minutes` in the implementation, that's a finding. Don't assume "they probably
  meant the same thing."
- **Source of truth wins.** When the implementation and the source of truth disagree, the
  source of truth is right. Always.

---

## Workflow

1. Read the plan's **Integration Contracts** section — this tells you what to verify
2. For each declared contract:
   a. Read the source of truth file
   b. Read the implementation that integrates with it
   c. Compare — field names, types, required vs optional, enums, validation rules
3. Produce a verification report

Load the `verify-integration` skill for the detailed methodology.

---

## Output

Write your report to `.pi/plans/YYYY-MM-DD-<name>/validation.md`:

### PASS — all contracts verified
List what was checked and how.

### FAIL — discrepancies found
List each discrepancy with:
- What the source of truth says (with file:line reference)
- What the implementation does (with file:line reference)
- Why this matters
```

#### 4. `dot_pi/agent/AGENTS.md` (3 edits)

**Edit A — Agent Table**
Add row after reviewer:
```
| `validator` | Adversarial verification — checks implementation against declared integration contracts | Gemini 2.5 Pro |
```

**Edit B — When to Delegate**
Add after "Code review needed → `reviewer`":
```
- **Plan declares integration contracts** → Spawn `validator` after worker finishes
```

**Edit C — Skill Triggers**
Add row to skill triggers table:
```
| Verifying implementation against integration contracts | `verify-integration` |
```

#### 5. `dot_agents/skills/verify-integration/SKILL.md` (new file)

Verification methodology skill. ~80-100 lines. Shape:

```markdown
---
name: verify-integration
description: "Verify implementation against declared integration contracts. Use when checking that code matches API schemas, DB schemas, event formats, or other contract surfaces."
---

# Integration Verification

You are verifying that an implementation correctly integrates with its declared
contract surfaces. The plan's Integration Contracts section tells you what to check.
The source of truth files tell you what's correct. Your job is to find mismatches.

## Methodology

### 1. Inventory contracts from the plan

Read the plan's Integration Contracts table. Each row is a verification target:
- **Surface**: what's being integrated with (API endpoint, DB schema, event format)
- **Source of truth**: the file that defines the contract
- **Verified**: whether the planner read it (if "no — needs scout", that's already a finding)

### 2. Read source of truth first

For each contract, read the source of truth file completely. Extract:
- Field names (exact spelling, casing)
- Field types (string, number, boolean, enum values)
- Required vs optional fields
- Validation rules (min/max, regex, allowed values)
- Default values

Do NOT read the implementation first — you need unbiased expectations.

### 3. Read the implementation

Now read the implementation code that integrates with this contract. Look for:
- How it constructs requests / inserts / events
- What fields it includes
- What types it assumes
- How it handles the response / result

### 4. Compare literally

For each field in the source of truth:
- Is it present in the implementation? (missing field = finding)
- Is the name exactly right? (casing matters)
- Is the type compatible?
- If required in the contract, is it always provided?
- If the contract has validation rules, does the implementation respect them?

For each field in the implementation that's NOT in the source of truth:
- Is this a computed/UI-only field? (acceptable)
- Or is it being sent to the contract surface? (finding — the contract doesn't expect it)

### 5. Check the boundaries

Beyond individual fields, verify:
- HTTP method and path (for APIs)
- Authentication / authorization mechanism
- Error response handling (does the implementation handle the errors the API returns?)
- Content-Type / serialization format

## Report Format

```markdown
# Verification Report

**Plan:** [path to plan]
**Date:** YYYY-MM-DD
**Verdict:** PASS | FAIL

## Contracts Verified

### [Surface name]
**Source of truth:** `[file:line range]`
**Implementation:** `[file:line range]`
**Status:** ✅ Verified | ❌ Discrepancies found

#### Findings (if any)
1. **[field/aspect]**: Source says [X], implementation does [Y]
   - Impact: [what breaks]
   - Fix: [what the implementation should do]

## Summary
- Contracts checked: N
- Passed: N
- Failed: N
- [One-line overall assessment]
```

## What You Don't Do

- **Code quality review** — that's the reviewer's job
- **Architecture assessment** — the planner decided this
- **Undeclared surface discovery** — you check what's declared, not what's missing (v2)
- **Fix the code** — you report, you don't fix
```

#### 6. `dot_agents/skills/grill-with-docs/SKILL.md` (1 edit)

Add a new subsection to "During the session" after "Cross-reference with code":

```markdown
### Surface integration contracts

When the discussion touches an integration surface — an API being consumed, a schema being
conformed to, an event format being produced — ask where the source of truth lives. "You're
saying the task API accepts these fields — is that defined in a Zod schema? A types file?
Where would I look to verify that?"

Capture the answer in the decisions artifact under a dedicated section or inline with the
relevant decision. This gives the planner concrete source-of-truth references to ground
its claims against.
```

## Dependencies
- None — all changes are prose/markdown edits to existing infrastructure

## Risks & Open Questions
- **Validator model choice** (`google/gemini-2.5-pro`): May not be optimal for literal comparison in practice — accepted, easy to swap (one frontmatter field)
- **Planner rule adoption**: Risk of being ignored if too vague — mitigated by following existing rule style with concrete "if you catch yourself" trigger
- **Worker over-interpretation**: Risk of workers becoming mini-planners — mitigated by keeping addition to 3 lines with explicit "report, don't fix" framing
