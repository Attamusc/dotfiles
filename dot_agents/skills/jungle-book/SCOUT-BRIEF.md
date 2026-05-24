# Scout Brief

This is the template for scout subagent tasks. Jungle-book fills in the `{scope}` and `{context}` sections before dispatching.

## Instructions for Scouts

Explore your assigned area of the codebase and report every recurring pattern you observe. **Describe what you see — do not evaluate, classify, or judge.** You are collecting raw material. Someone else will decide what's good, bad, or ambiguous.

### What to look for

Walk your assigned scope organically. Don't follow a rigid checklist — explore and note where you experience something notable:

- Naming conventions — how are files, functions, variables, types named? Is it consistent?
- Abstractions — what patterns exist for organizing code? Are they repeated faithfully or unevenly?
- Error handling — how do errors propagate? Is there a convention or is it ad-hoc?
- File and directory layout — how is code organized? What's the logic behind the structure?
- Data flow — how does data move through the system? Are transformations explicit or hidden?
- Testing patterns — how is code tested? What's covered and what isn't?
- Configuration — how are settings, env vars, and feature flags managed?
- Dependencies — how are external libraries used? Any patterns in how they're wrapped or imported?
- Documentation — what's documented, what isn't, what's stale?
- Conventions — any implicit rules the code follows that aren't written down?

### How to report

For each pattern you notice, report:

- **Pattern name** — a short, memorable label (e.g. "result-type error handling", "barrel-file re-exports", "implicit user context threading")
- **Where** — specific file paths and line ranges. Be precise. Multiple locations if the pattern recurs.
- **Description** — what the pattern is, in plain language. What does the code actually do and how is it shaped?
- **Frequency** — `once` / `several` / `pervasive`
- **Tension** — anything you noticed that felt inconsistent, unclear, or notably clean about this pattern. Not a judgment — just what you noticed. If a naming convention breaks in one file, note it. If an abstraction is used smoothly everywhere, note that too. If nothing stands out, say "None."

### What NOT to do

- Do not say whether a pattern is good or bad
- Do not suggest fixes or improvements
- Do not classify patterns into categories
- Do not prioritize or rank findings
- Do not skip patterns because they seem minor — report everything you notice
- Do not invent patterns that aren't there — if an area is unremarkable, say so

### Output format

Return your observations as a markdown list. One section per pattern:

```markdown
## Observations

### {Pattern Name}
- **Where:** `src/handlers/auth.ts:15-40`, `src/handlers/billing.ts:12-38`, `src/handlers/users.ts:10-35`
- **Description:** Every handler function follows the same shape: validate input, call service, map response, handle errors with a try/catch that logs and returns a generic 500.
- **Frequency:** pervasive
- **Tension:** The error handling in `billing.ts` catches specific Stripe errors and returns meaningful codes. The others don't — they all return generic 500s regardless of error type.

### {Pattern Name}
...
```

Keep descriptions factual and concise. If you're writing more than 3 sentences for a description, you're editorializing.
