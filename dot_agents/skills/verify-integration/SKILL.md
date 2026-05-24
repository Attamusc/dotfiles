---
name: verify-integration
description: "Verify implementation against declared integration contracts. Use when checking that code matches API schemas, DB schemas, event formats, or other contract surfaces. Triggers: 'verify integration', 'check contracts', 'validate against schema', 'does this match the API', 'contract verification'."
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
- **Undeclared surface discovery** — you check what's declared, not what's missing
- **Fix the code** — you report, you don't fix
