# Grill Session: jungle-book Skill Design

**Date:** 2026-05-15
**Status:** Resolved

## Decisions

### 1. Scope — Analysis Only
**Question:** Does jungle-book analyze, recommend, and implement, or just analyze and recommend?
**Decision:** Analysis and recommendations only. No implementation.
**Rationale:** Implementation is a separate concern with different failure modes. The artifact is the handoff to planners, workers, or humans. Keeping the skill sharp on *seeing clearly* is the priority.

### 2. Three-Bucket Triage Framework
**Question:** What is the organizing principle for findings?
**Decision:** Every finding is classified into one of three buckets: **Positive** (what's working well), **Negative** (what's causing friction or will cause rot), **Inbetween** (ambiguous patterns that could go either way). The goal is to articulate findings clearly enough that everything lands in a bucket, then define migration paths to move everything toward positive.
**Rationale:** The inbetween bucket is where the real value is — most analysis tools miss it entirely. What's good is what we don't want to lose. What's bad is often clearly bad. The things that are neither can go in either direction, and catching them early is the differentiator.

### 3. Own Glossary
**Question:** Does jungle-book adopt the reference skill's Ousterhout-derived vocabulary or build its own?
**Decision:** Build its own. Six terms:
- **Pattern** — the unit of analysis. Any recurring shape in the codebase: naming convention, abstraction, error handling approach, file layout, data flow. If it happens more than once, it's a pattern. If it happens once but should happen more, that's also a pattern.
- **Friction** — resistance the codebase creates against change. You want to do something simple and the code fights you.
- **Creep** — a gap that isn't hurting today but has a direction toward decay. Missing test coverage on a critical path. An implicit contract between two modules. Creep has momentum — it gets worse on its own without anyone making a mistake.
- **Signal** — how clearly a pattern communicates its intent. Good signal means a new reader (human or AI) can understand what the code does, why it's shaped this way, and where to make changes.
- **Drift** — when two things that should be the same pattern have quietly diverged. Copy-pasted error handling that evolved differently in three places. Two modules that do the same thing with different names.
- **Grain** — the natural direction of change in the codebase. Code has grain like wood — easy to work with it, hard to work against it. Good patterns align with the grain.
**Rationale:** The reference skill's vocabulary serves architecture analysis but not naming rot, implementation feel, or language clarity. A skill with borrowed language will always feel uncertain about its own identity — ironic given language clarity is one of the three pillars.

### 4. Unit of Analysis
**Question:** What does jungle-book look at — one type of unit or multiple?
**Decision:** One unit: **Pattern**. The three buckets handle classification. No separate categories for structure vs. convention vs. naming.
**Rationale:** The three buckets are already the classification system. Splitting inputs into multiple categories on top of that creates a matrix. Keep the unit simple; the buckets do the sorting work.

### 5. Pattern Entry Fields
**Question:** What information does each pattern entry contain?
**Decision:** Shared fields across all buckets:
- **Name** — short, memorable label
- **Where** — specific file paths and line ranges
- **What** — plain description of the pattern as it exists
- **Signal** — how clearly the pattern communicates intent (strong/weak/ambiguous)
- **Grain** — whether the pattern works with or against the codebase's natural direction of change
- **Drift** — where this pattern has diverged from itself or related patterns (if relevant)

Bucket-specific fields:
- **Positive → Leverage** — why this pattern earns its keep in *this specific codebase*. Must reference a concrete change scenario ("because of this pattern, doing X requires only Y"). No abstract virtues.
- **Negative & Inbetween → Risk** — a label (**Active** / **Creeping** / **Dormant**) plus a one-sentence scenario describing when and how it will hurt.
- **Negative & Inbetween → Migration Path** — what moving this toward positive looks like, referencing a specific positive pattern as the target.
**Rationale:** Leverage is the anchor that migration paths point at. Risk labels enable triage without reading every detail; scenarios make findings actionable. Every negative/inbetween pattern points at a positive pattern as its north star — no abstract recommendations.

### 6. Risk Labels
**Question:** How is risk expressed?
**Decision:** Three labels aligned with the glossary:
- **Active** — causing friction now
- **Creeping** — not hurting yet, trending negative (invokes the glossary term directly)
- **Dormant** — static, could go either way

Each label is paired with a one-sentence scenario for context.
**Rationale:** Labels enable machine-sortable triage. Scenarios provide human-readable justification. "Creeping" directly invokes the glossary term rather than introducing parallel vocabulary.

### 7. Codebase Scope
**Question:** Whole codebase or targeted scope?
**Decision:** Whole-codebase is the default. Optional scoping is supported. Scoped runs reference the positive catalog from prior whole-codebase runs if one exists.
**Rationale:** The real value is the positive bucket — establishing what "good" looks like across the whole codebase. Scoping too tightly risks missing the best positive patterns, leaving migration paths with nothing to point at.

### 8. Context File Relationship
**Question:** How does jungle-book relate to AGENTS.md, CONTEXT.md, ADRs, etc.?
**Decision:** Reads everything available, depends on nothing, produces only its own artifact. If the analysis reveals that context files need updating, those become findings in the buckets — not inline side effects.
**Rationale:** Keeps the skill's output surface to exactly one artifact. Downstream skills can consume the artifact to produce AGENTS.md files, ADRs, plans, etc. The analysis never gets tangled with the actions it produces.

### 9. Artifact Location and Format
**Question:** Where does the output live?
**Decision:** `.jungle-book/` directory at project root. Dated files: `.jungle-book/2026-05-15-full.md`, `.jungle-book/2026-05-15-auth-scope.md`. Directory is `.gitignore`-able per team preference.
**Rationale:** History enables tracking whether the codebase is trending positive across runs. Dotfile prefix because it's tooling output, not project documentation. Downstream skills produce the project docs.

### 10. Artifact Structure
**Question:** How is the artifact organized?
**Decision:** Always three sections (positive, negative, inbetween) regardless of codebase size. Preceded by a summary with:
- Pattern counts per bucket
- Overall grain assessment (one or two sentences on the codebase's natural direction of change)
- Top 3 migration priorities (highest-risk findings with references to full entries)

Glossary included at the top of every artifact (six terms, one sentence each).
**Rationale:** Three sections means predictable structure. Summary is the front door — the first thing a human reads and the first thing a planner agent parses. Glossary ensures true portability; no external dependencies to understand the artifact.

### 11. Exploration Strategy
**Question:** How does jungle-book walk the codebase?
**Decision:** Scout-based exploration. Jungle-book does a fast preliminary scan (file tree, README, AGENTS.md, context files) and assigns up to 3 scouts based on what it finds. Division is intelligent — by feature area, layer, or whatever makes sense for the specific codebase. Hard cap of 3 scouts, not configurable.
**Rationale:** Whole-codebase analysis exceeds single-agent context on anything non-trivial. Preliminary scan enables balanced, overlap-minimized division. 3 is the max — more scouts means more coordination overhead than value.

### 12. Scout Output Format
**Question:** What do scouts report back?
**Decision:** Scouts describe, they don't evaluate. Each observation contains:
- **Pattern name** — short label
- **Where** — file paths and line ranges
- **Description** — what the pattern is, plainly stated
- **Frequency** — once / several / pervasive
- **Tension** — anything that felt inconsistent, unclear, or notably clean. Not a judgment — just what they noticed.

Jungle-book does all classification, cross-referencing, and migration path work.
**Rationale:** Clean separation between observation and judgment. Scouts collect raw material; jungle-book synthesizes. Prevents conflicting classifications from different scouts.

### 13. Autonomy
**Question:** Interactive or autonomous?
**Decision:** Fully autonomous. Scouts run, jungle-book synthesizes, artifact gets written. No user input during the process.
**Rationale:** The artifact is the skill's opinion. That's the point — relentless, direct assessment, not a negotiation. If the user disagrees with a classification, that's a conversation for after the artifact exists.

### 14. Voice
**Question:** What tone does the skill use?
**Decision:** Opinionated and blunt. The skill has a voice — it says "this is sloppy" or "this is elegant" when warranted. Not mean, but not diplomatic. Reads like a senior engineer who respects your time too much to soften things.
**Rationale:** Neutral voice undermines the "relentless and direct" intent. The personality is in the economy, not the flourish. Says what it sees, doesn't pad it, moves on.

## Open Questions
- None. All branches resolved.

## Key Constraints Surfaced
- **Artifact is the only output** — no side effects on context files, ADRs, or other project docs. Downstream skills consume the artifact.
- **3 scout hard cap** — not configurable, not a guideline. The skill decides division strategy, not the user.
- **Leverage must be concrete** — every positive pattern's leverage field must reference a specific change scenario. No abstract praise survives.
- **Migration paths must reference positive patterns** — no abstract recommendations. "Make it look like this thing you already have."
- **Glossary terms are the only architectural vocabulary** — Pattern, Friction, Creep, Signal, Drift, Grain. Don't introduce synonyms or parallel terms.
