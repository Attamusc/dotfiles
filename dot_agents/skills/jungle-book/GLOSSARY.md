# Glossary

Shared vocabulary for every finding jungle-book produces. Use these terms exactly — don't substitute synonyms, don't introduce parallel vocabulary. If a term can't be defined in one sentence, it doesn't earn its place here.

## Terms

**Pattern**
Any recurring shape in the codebase: a naming convention, an abstraction strategy, an error handling approach, a file layout, a data flow. If it happens more than once, it's a pattern. If it happens once but *should* happen more (an emerging convention), that's also a pattern.

**Friction**
Resistance the codebase creates against change. You want to do something simple and the code fights you. Friction is the symptom — the pattern causing it is what gets classified. Friction shows up as: excessive files to touch for a simple change, unclear ownership, having to understand unrelated code to make a local edit.

**Creep**
A gap that isn't hurting today but has a direction toward decay. Missing test coverage on a critical path. An implicit contract between two modules that nobody documented. A TODO that's load-bearing. Creep has momentum — it gets worse on its own without anyone making a mistake. The risk labels **Active**, **Creeping**, and **Dormant** describe urgency; creep as a glossary term describes the *mechanism* of slow directional rot.

**Signal**
How clearly a pattern communicates its intent. Good signal means a new reader — human or AI — can understand what the code does, why it's shaped this way, and where to make changes. Poor signal means you have to hold context in your head that the code doesn't give you. Signal degrades when names are vague, when structure contradicts intent, or when conventions exist only in tribal knowledge.

**Drift**
When two things that should be the same pattern have quietly diverged. Copy-pasted error handling that evolved differently in three places. Two modules that do the same thing but use different names for it. Drift is the primary factory for "inbetween" findings — the original pattern was probably positive, but the copies have wandered far enough that some are still good and others aren't.

**Grain**
The natural direction of change in the codebase. Code has grain like wood — easy to work with it, hard to work against it. Good patterns align with the grain. Bad patterns cut across it. Inbetween patterns are where the grain is ambiguous or the codebase is pulling in two directions. Grain is shaped by the framework, the domain, the team's conventions, and the history of how the code evolved.

## Risk Labels

Used on negative and inbetween entries. Each label is paired with a one-sentence scenario.

**Active** — causing friction *right now*. Someone working in this area today will hit this.

**Creeping** — not hurting yet, trending negative. Will become active if left unattended. This label directly invokes the glossary term — every creeping risk is a creep finding by definition.

**Dormant** — static, could go either way. Not moving toward decay on its own, but won't self-correct either. A decision or a change in the codebase's direction could push it positive or negative.
