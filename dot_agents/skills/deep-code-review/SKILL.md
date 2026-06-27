---
name: deep-code-review
description: Run an extremely strict maintainability review for abstraction quality, giant files, and spaghetti-condition growth. Use for a "deep code review", "strict maintainability review", or "review this branch harshly".
model: opus
---

# Deep Code Review

Use this skill for an unusually strict review focused on implementation quality, maintainability, abstraction quality, and codebase health.

The leading word is **code judo**: a restructuring that preserves behavior while making the implementation dramatically simpler, smaller, more direct, and more elegant. Every smell below is a missed code-judo opportunity. Do not merely find cleanup opportunities — actively hunt for the move that deletes whole categories of complexity rather than rearranging them. Prefer the solution that makes the implementation feel inevitable in hindsight.

## Core Prompt

Start from this baseline:

> Perform a deep code quality audit of the current branch's changes.
> Rethink how to structure / implement the changes to meaningfully improve code quality without impacting behavior.
> Work to improve abstractions, modularity, reduce spaghetti code, improve succinctness and legibility.
> Be ambitious — if there is a clear path to improving the implementation that involves restructuring some of the codebase, go for it.
> Be extremely thorough and rigorous. Measure twice, cut once.

## Smell Catalogue

For each smell: (a) what it is, (b) why it harms maintainability, (c) the code-judo remedy.

---

### 1. Incidental Complexity
**Smell:** The implementation carries unnecessary moving parts — branches, helpers, modes, or layers — where a reframing would delete whole categories of logic. Refactors that move complexity around without reducing it qualify here too.

**Harm:** Every concept a reader must hold in their head multiplies the cognitive cost of every future change. Complexity that was only ever incidental becomes permanent debt.

**Code judo:** Reframe the state model so conditionals disappear instead of getting centralized. Change the ownership boundary so the feature becomes a natural extension of an existing abstraction. Delete a whole layer of indirection rather than polishing it. If there is a plausible path to a much simpler idea, do not settle for a merely cleaner version of the messy one.

---

### 2. File-Size Explosion
**Smell:** The PR pushes a file from under 1,000 lines to over 1,000 lines.

**Harm:** Giant files make scanning, navigating, and reviewing expensive. The longer a file grows, the harder it is to split later — each growth increment lowers the threshold for the next.

**Code judo:** Ask whether the code should be decomposed before the diff lands. Extract helpers, subcomponents, or modules. Split a large file into smaller focused modules. Only waive if there is a compelling structural reason and the resulting file is still clearly organized.

---

### 3. Spaghetti Branching
**Smell:** Ad-hoc conditionals, one-off booleans, nullable modes, or "temporary" branches bolted onto unrelated flows. Narrow edge-case handling dropped into the middle of an already-busy function.

**Harm:** Each special case makes the surrounding flow harder to reason about. Branches multiply — "temporary" debt rarely leaves, and every new branch makes the next one cheaper to justify.

**Code judo:** Push the logic into a dedicated abstraction, helper, state machine, policy object, or separate module. Turn special-case logic into a simpler default flow with fewer exceptions. Collapse duplicate branches into a single clearer flow.

---

### 4. Hacky or Magic Abstractions
**Smell:** Thin wrappers, identity abstractions, or generic mechanisms that hide simple data-shape assumptions and add indirection without buying clarity. Brittle, ad-hoc, or "magic" behavior.

**Harm:** Readers must understand both the abstraction and what it hides, paying double cognitive cost for no structural gain. Magic is especially expensive when it breaks — the failure mode is invisible.

**Code judo:** Delete wrappers that do not meaningfully clarify the API. Replace the generic mechanism with the direct, boring flow it was hiding. Prefer explicit, maintainable code over clever code. Ask whether the abstraction is earning its keep or just adding a layer.

---

### 5. Type and Boundary Muddiness
**Smell:** Unnecessary casts, `any`, `unknown`, or optional params that obscure real invariants. Silent fallbacks papering over an unclear contract. Ad-hoc object shapes where a typed model could exist.

**Harm:** Unclear types push invariant reasoning into the reader's head rather than the compiler's. Silent fallbacks make bugs invisible at the boundary and expensive to trace later.

**Code judo:** Make the boundary explicit so the control flow gets simpler. Prefer explicit typed models or shared contracts over loosely-shaped ad-hoc objects. Question every optional — if the caller always provides it, make it required; if it varies, make the branches explicit.

---

### 6. Layer and Canonical Violations
**Smell:** Feature logic leaking into shared or general-purpose paths. Logic placed in the wrong layer or package. Bespoke helpers duplicating canonical utilities. Copy-pasted logic that should be extracted.

**Harm:** Logic in the wrong place must be found, understood, and updated in unexpected locations. Duplication creates silent divergence — two copies of the same logic rarely stay in sync.

**Code judo:** Move the logic to the package, module, or layer that already owns the concept. Reuse the existing canonical helper instead of introducing a near-duplicate. Separate orchestration from business logic. Isolate feature-specific logic behind a dedicated abstraction rather than scattering feature checks across shared code.

---

### 7. Orchestration Debt
**Smell:** Independent work serialized for no good reason. Related updates structured so partial state is possible when a more atomic flow exists.

**Harm:** Unnecessary sequencing makes the flow slower and more brittle — a failure mid-sequence can leave state inconsistent. It also misleads readers into thinking ordering is meaningful when it isn't.

**Code judo:** Parallelize independent work when that also simplifies the orchestration. Restructure related updates into a more atomic flow when partial state would be harder to reason about. Do not over-index on micro-optimizations, but do flag avoidable orchestration complexity.

---

## Review Tone

Be direct, serious, and demanding about quality. Do not soften major maintainability issues into mild suggestions. If the code is making the codebase messier, say so clearly. If the implementation missed an opportunity for a dramatic simplification, say that clearly too.

Good phrases:

- `this pushes the file past 1k lines. can we decompose this first?`
- `this adds another special-case branch into an already busy flow. can we move this behind its own abstraction?`
- `this works, but it makes the surrounding code more spaghetti. let's keep the behavior and restructure the implementation.`
- `this feels like feature logic leaking into a shared path. can we isolate it?`
- `this abstraction seems unnecessary. can we just keep the direct flow?`
- `why does this need a cast / optional here? can we make the boundary more explicit instead?`
- `this looks like a bespoke helper for something we already have elsewhere. can we reuse the canonical one?`
- `i think there's a code-judo move here that makes this much simpler. can we reframe this so these branches disappear?`
- `this refactor moves complexity around, but doesn't really delete it. is there a way to make the model itself simpler?`

## Output Expectations

Prioritize findings in this order:

1. Structural code-quality regressions
2. Missed opportunities for dramatic simplification / code-judo restructuring
3. Spaghetti / branching complexity increases
4. Boundary / abstraction / type-contract problems that make the code harder to reason about
5. File-size and decomposition concerns
6. Modularity and abstraction issues
7. Legibility and maintainability concerns

Do not flood the review with low-value nits if there are larger structural issues. Prefer a smaller number of high-conviction comments over a long list of cosmetic notes.

## Approval Bar

Do not approve merely because behavior seems correct. The bar is: no unresolved smell from the catalogue above without a clear justification.

Treat these as presumptive blockers unless the author can justify them clearly:

- the PR preserves a lot of incidental complexity when there is a plausible code-judo move that would delete it
- the PR pushes a file from below 1,000 lines to above 1,000 lines
- the PR adds ad-hoc branching that makes an existing flow more tangled
- the PR solves a local problem by scattering feature checks across shared code
- the PR adds an unnecessary abstraction, wrapper, or cast-heavy contract that makes the design more indirect
- the PR duplicates an existing helper or puts logic in the wrong layer when there is a clear canonical home

If those conditions are not met, leave explicit, actionable feedback and push for a cleaner decomposition.

---

_Adapted from cursor team-kit's thermo-nuclear-code-quality-review._
