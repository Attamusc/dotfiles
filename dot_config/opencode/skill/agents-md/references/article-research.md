# Research Background for AGENTS.md Methodology

Distilled findings from academic research and Addy Osmani's synthesis
(https://addyosmani.com/blog/agents-md/).

## Key Studies

### Lulla et al. -- ICSE JAWs 2026

**Finding:** AI agents given only a README and source code frequently
"fix" intentional patterns (removing platform-specific workarounds, simplifying
deliberate deep merges, violating module boundaries). The failures cluster
around *non-discoverable context* -- information that exists in the developer's
head but not in any file the agent reads.

**Implication:** AGENTS.md must focus exclusively on this non-discoverable
context. Repeating information from config files, READMEs, or source code
wastes tokens and doesn't prevent the failure modes.

### ETH Zurich -- arxiv 2602.11988

**Finding:** Concise, hierarchically-scoped instructions outperform long
monolithic instruction files. Agents given directory-scoped files made fewer
boundary violations than those given a single large root file. The effect
was strongest when each scoped file was self-contained (did not require
reading the root file for local decisions).

**Implication:** Use hierarchical AGENTS.md files. Root file handles
repo-wide concerns and routes to scoped files. Scoped files are
self-contained for their directory.

## The Diagnostic Mindset

From Osmani's synthesis: treat each AGENTS.md entry as a *diagnostic signal*.
If a line is in AGENTS.md, it means the codebase has a spot where an agent
(or new developer) would likely make the wrong choice without warning.

This reframes AGENTS.md from "documentation" to "diagnostic instrument."
When you find yourself adding many entries for one area, that area may need
refactoring to make the right choice obvious from the code itself.

## What the Research Says NOT to Include

All three sources converge on what wastes tokens without preventing errors:

- Project structure trees (agents explore directories effectively)
- Technology stack descriptions (agents read package.json/Cargo.toml/etc.)
- Coding style rules (agents read linter/formatter configs)
- API documentation (agents read types and source)
- Setup instructions (agents read Makefiles/Dockerfiles/CI configs)

These categories are consistently discovered by agents on their own.
Including them displaces the genuinely non-discoverable information that
prevents the high-cost mistakes.
