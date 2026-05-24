# Grill Session: Preventing Hallucinated Contracts in Agent Workflows

**Date:** 2025-05-24
**Status:** Resolved

## Decisions

### Primary intervention point is the planner
**Question:** Which layer is load-bearing — should we fix the planner, add defense in depth everywhere, or both?
**Decision:** Planner is the primary fix, with lightweight reinforcement downstream. The planner is where the fiction originates — fix grounding there, and downstream stages execute correctly. Downstream agents get minimal additions: workers report contradictions they encounter, the new validator agent provides independent verification.
**Rationale:** Avoids turning every agent into a full verifier while catching the root cause. Planner already has scout delegation for factual gaps — this extends that instinct to contract claims.

### Two distinct principles: grounded claims and independent verification
**Question:** What vocabulary do we use for the failure mode?
**Decision:** Two concepts, two names. "Grounded claims" is the planner discipline — a claim about an existing system is grounded only if verified against actual source code. "Independent verification" is the validation discipline — verification must include at least one check whose source of truth is not the plan itself.
**Rationale:** These need different interventions at different stages. Conflating them muddies both.

### Grounded claims goes in the planner's hard rules
**Question:** Where in the planner definition does the grounding principle live?
**Decision:** New hard rule, three sentences, principle-based not prescriptive. Encodes the mindset ("if you haven't read it, you don't know it") rather than a specific checklist.
**Rationale:** Hard rules are non-negotiable behavioral principles. Grounding claims is non-negotiable — it applies any time the planner describes how an existing system behaves, not just during one phase.

### Workers report contradictions, they don't verify
**Question:** Should workers independently verify plan claims or trust the plan?
**Decision:** Workers keep their "trust the plan, execute with quality" philosophy. One addition: if what the worker reads in the actual code contradicts what the plan describes, stop and report the discrepancy instead of silently adapting.
**Rationale:** Asking workers to verify makes them mini-planners. But suppressing the signal when reality and plan disagree is how fiction survives into production. The worker already reads before editing — this just says "don't ignore what you read."

### Independent verification is a new validator agent, not a reviewer extension
**Question:** Should the reviewer carry independent verification, or does this warrant a new agent?
**Decision:** New `validator` agent. The reviewer stays focused on code quality and security. The validator is adversarial and skeptical — its job is to compare the implementation against the source of truth, not the plan.
**Rationale:** A skill can teach technique but can't overcome an agent's inherent bias to confirm its own direction. The validator arrives with no prior investment in the outcome. Separate agent also enables picking a different model family optimized for literal comparison rather than creative reasoning.

### Validator agent shape
**Question:** What does the validator produce and how does it work?
**Decision:** Thin agent wrapping a verification skill. Reads the implementation and the declared source of truth. Produces a pass/fail validation report listing specific discrepancies and what was verified. Starts with declared contracts from the plan only — doesn't hunt for undeclared integration surfaces (that's v2).
**Rationale:** Keep scope bounded. If the planner's grounded claims principle is working, contracts are declared in the plan. The validator checking for undeclared surfaces is closer to what the reviewer already does.

### Plans declare integration contracts
**Question:** How does the validator know what source of truth to check against?
**Decision:** The planner declares integration contracts in the plan — what system, where the contract is defined in the codebase. This flows naturally from grounded claims: the planner verified its claims against source code, so it knows where the source of truth is.
**Rationale:** Creates a forcing function. If the planner can't name the source of truth, the claims aren't grounded. Also gives the validator an unambiguous starting point.

### Grill sessions surface integration contracts
**Question:** Should identifying the source of truth be part of grilling?
**Decision:** Yes. When a grill session touches an integration surface, the griller asks where the source of truth lives and captures it in the decisions artifact. The planner then uses this when grounding its claims.
**Rationale:** The grill session is where human and agent reach shared understanding about what the system does — "the contract is the Zod schemas, not the REST paths" is exactly the kind of domain insight grilling surfaces.

### Test strategy accounts for integration surfaces
**Question:** Do we need a testing skill or convention for mock-vs-real decisions?
**Decision:** No dedicated testing skill. The planner already chooses test strategy — sharpen its criteria: when the feature integrates with an existing contract, test strategy must include verification that doesn't mock that contract.
**Rationale:** "Smoke tests with mocked boundaries" is sufficient for isolated logic. It's insufficient when the feature's purpose is integration. The planner deciding test strategy is the right place for this judgment.

### Orchestrator stays minimal
**Question:** Should the orchestrator enforce validator spawning or leave it to judgment?
**Decision:** Minimal. Add the validator to the agent table and "When to Delegate" section. The orchestrator uses judgment — if the plan declares integration contracts, spawn the validator after the worker finishes.
**Rationale:** The orchestrator is the user's session. Rigid enforcement adds process to something that should stay fluid. The plan's declared contracts are the signal.

## Domain Updates
- No CONTEXT.md or ADRs created — these changes are to agent infrastructure (`~/.pi/agent/`), not a domain-specific codebase.

## Open Questions
- What model family for the validator agent (agreed it should differ from reviewer, specific choice deferred to implementation)
- Whether the validator should eventually discover undeclared integration surfaces (v2 concern)

## Key Constraints Surfaced
- Planner is already 500+ lines — additions must be surgical, principle-based, not checklist-based
- Workers must stay lean — they execute, they don't re-plan
- Skills encode technique; agents encode role and mindset — independent verification is a role (adversarial, skeptical) that can't be reduced to technique loaded by a biased agent
- The grill-with-docs skill is the natural place to surface integration contracts before planning begins

## Implementation Targets
- `~/.pi/agent/agents/planner.md` — new hard rule, plan template addition, test strategy note
- `~/.pi/agent/agents/worker.md` — extend "read before edit" for contradiction reporting
- `~/.pi/agent/agents/validator.md` — new thin agent definition
- `~/.pi/agent/AGENTS.md` — add validator to agent table and delegation guidance
- `~/.agents/skills/verify-integration/SKILL.md` — new skill with verification methodology
- `~/.agents/skills/grill-with-docs/SKILL.md` — add integration contract surfacing
