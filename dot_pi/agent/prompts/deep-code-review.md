---
description: Run a strict structural / maintainability review on the current branch
argument-hint: "[focus area or scope]"
---

# Deep Code Review

Load the `deep-code-review` skill and run a strict structural / maintainability review of the current branch.

**This is a second-stage pass.** Assume correctness, security, and basic bug-finding have already been handled (e.g. by the normal reviewer agent). Focus exclusively on what that pass intentionally doesn't cover:

- Structural regressions and missed "code judo" simplifications
- Spaghetti / branching complexity growth
- Boundary, abstraction, and type-contract problems
- File-size and decomposition concerns
- Logic landing in the wrong layer / duplicating canonical helpers

## Scope

$@

If no scope was given, default to: **the diff of the current branch against its base** (use `git merge-base` to find the base, then `git diff <base>...HEAD`).

## Process

1. Load the `deep-code-review` skill — follow its rubric exactly.
2. Identify the diff to review (scope above).
3. Read the changed files in full — not just the diff — so you can spot structural issues the diff hides (file growth, scattered conditionals, layer leaks).
4. Apply the skill's review standards aggressively. Be ambitious about restructurings.
5. Produce findings using the priority order from the skill:
   1. Structural code-quality regressions
   2. Missed simplification / code-judo opportunities
   3. Spaghetti / branching complexity
   4. Boundary / abstraction / type-contract problems
   5. File-size & decomposition
   6. Modularity & abstraction
   7. Legibility & maintainability

## Output

Write findings directly to the chat. Format:

```markdown
# Deep Review — <branch or scope>

**Verdict:** APPROVED / NEEDS RESTRUCTURING

## High-Conviction Findings
### [structural] <short title>
**Where:** `path/to/file.ts:123-180`
**Problem:** <what's wrong structurally>
**Proposed reframing:** <the code-judo move, not just a polish>

## Lower-Conviction Notes
- <smaller structural observations, if any>

## What's Good Structurally
- <genuine positive structural observations>
```

Prefer a **small number of high-conviction findings** over a long list of nits. If the branch is structurally clean, say so — short reviews are the right answer when warranted.

Do **not** modify code. This is a review pass only.
