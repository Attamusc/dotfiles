---
name: code-review
description: Review the changes since a fixed point (commit, branch, tag, or merge-base) along two axes — Standards (does the code follow this repo's documented coding standards?) and Spec (does the code match what the originating issue/PRD asked for?). Runs both reviews in parallel sub-agents and reports them side by side. Use when the user wants to review a branch, a PR, work-in-progress changes, or asks to "review since X".
---

Two-axis review of the diff between `HEAD` and a fixed point the user supplies:

- **Standards** — does the code conform to this repo's documented coding standards?
- **Spec** — does the code faithfully implement the originating issue / PRD / spec?

Both axes run as **parallel sub-agents** so they don't pollute each other's context, then this skill aggregates their findings.

The spec source is resolved via `../todo-tracker.md` (see step 2 below).

## Process

### 1. Pin the fixed point

Whatever the user said is the fixed point — a commit SHA, branch name, tag, `main`, `HEAD~5`, etc. If they didn't specify one, ask for it.

Confirm the fixed point resolves with `git rev-parse <fixed-point>`, then find the merge base with `git merge-base <fixed-point> HEAD`. Capture `git diff <merge-base>` so the review includes tracked working-tree changes as well as committed ones. Also capture `git status --short` (identify relevant untracked files explicitly) and `git log <merge-base>..HEAD --oneline`.

Before spawning reviewers, confirm the selected diff or explicitly scoped untracked files contain changes and match the user's request. Save the diff, status, and any relevant untracked file contents as bounded, readable evidence files outside the repository. Split an oversized diff by path rather than silently truncating it. The reviewers receive those exact files; they do not run Git commands.

### 2. Identify the spec source

Look for the originating spec, in this order:

1. **Todo body** — check commit messages for `TODO-xxxx` references. Fetch the todo via:
   ```js
   todo({ action: "get", id: "TODO-xxxx" })
   ```
   The todo body is the spec / acceptance criteria. See `../todo-tracker.md` for the full tracker mapping.
2. A path the user passed as an argument.
3. A PRD/spec file under `docs/`, `specs/`, or `.scratch/` matching the branch name or feature.
4. If nothing is found, ask the user where the spec is. If they say there isn't one, the **Spec** sub-agent will skip and report "no spec available".

### 3. Identify the standards sources

Anything in the repo that documents how code should be written, such as `CODING_STANDARDS.md` or `CONTRIBUTING.md`.

On top of whatever the repo documents, the Standards axis always carries the **smell baseline** below — a fixed set of Fowler code smells (_Refactoring_, ch.3) that applies even when a repo documents nothing. Two rules bind it:

- **The repo overrides.** A documented repo standard always wins; where it endorses something the baseline would flag, suppress the smell.
- **Always a judgement call.** Each smell is a labelled heuristic ("possible Feature Envy"), never a hard violation — and, like any standard here, skip anything tooling already enforces.

Each smell reads *what it is* → *how to fix*; match it against the diff:

- **Mysterious Name** — a function, variable, or type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design's murky.
- **Duplicated Code** — the same logic shape appears in more than one hunk or file in the change. → extract the shared shape, call it from both.
- **Feature Envy** — a method that reaches into another object's data more than its own. → move the method onto the data it envies.
- **Data Clumps** — the same few fields or params keep travelling together (a type wanting to be born). → bundle them into one type, pass that.
- **Primitive Obsession** — a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
- **Repeated Switches** — the same `switch`/`if`-cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
- **Shotgun Surgery** — one logical change forces scattered edits across many files in the diff. → gather what changes together into one module.
- **Divergent Change** — one file or module is edited for several unrelated reasons. → split so each module changes for one reason.
- **Speculative Generality** — abstraction, parameters, or hooks added for needs the spec doesn't have. → delete it; inline back until a real need shows.
- **Message Chains** — long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- **Middle Man** — a class or function that mostly just delegates onward. → cut it, call the real target direct.
- **Refused Bequest** — a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

### 4. Spawn both sub-agents in parallel

The orchestrator collects all evidence before delegating. If the spec is a todo, fetch it and include its full body in a readable evidence file. Include the captured diff, relevant untracked files, commit list, standards sources, and any test results in the bundle. Reviewers in this workflow receive **only `read`**, as required by repositories with a read-only reviewer policy. Their task must explicitly say **evidence-only review** so they return findings inline rather than trying to run commands or write reports.

Start two independent `subagent` calls without waiting between them:

```js
subagent({
  name: "Standards Review",
  agent: "reviewer",
  tools: "read",
  interactive: false,
  task: "Evidence-only review. Read the supplied diff, status, validation, and standards files. Read the smell baseline in ~/.pi/agent/skills/code-review/SKILL.md. Report documented-standard violations and possible baseline smells separately, with file/hunk evidence. Return findings inline, under 400 words."
})
subagent({
  name: "Spec Review",
  agent: "reviewer",
  tools: "read",
  interactive: false,
  task: "Evidence-only review. Read the supplied diff, status, validation, and spec files. Report missing or partial requirements, scope creep, and incorrect implementations. Quote the spec for each finding. Return findings inline, under 400 words."
})
```

Replace "supplied" with the **absolute paths** to the prepared evidence files in each task; the reviewers cannot access the orchestrator's transcript. If no spec exists, skip the Spec sub-agent and state that the Spec axis was not reviewed. If an evidence file is truncated, narrow or split it before reviewing.

### 5. Aggregate

Present the two reports under `## Standards` and `## Spec` headings, verbatim or lightly cleaned. Write the aggregated report to a file:

```js
write({ path: ".scratch/code-review-<timestamp>.md", content: "..." })
```

Do **not** merge or rerank findings — the two axes are deliberately separate (see _Why two axes_).

End with a one-line summary: total findings per axis, and the worst issue _within each axis_ (if any). Don't pick a single winner across axes — that's the reranking the separation exists to prevent.

## Why two axes

A change can pass one axis and fail the other:

- Code that follows every standard but implements the wrong thing → **Standards pass, Spec fail.**
- Code that does exactly what the issue asked but breaks the project's conventions → **Spec pass, Standards fail.**

Reporting them separately stops one axis from masking the other.
