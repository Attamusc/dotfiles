---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Work the **todo frontier** defined in `../todo-tracker.md`. Pick the next unblocked `ready-for-agent` todo, work it to completion, then repeat — one ticket at a time, clearing context between.

## Process

### 1. Find the next todo

Follow the frontier algorithm in `../todo-tracker.md`:

1. `todo({ action: "list" })` — keep only unclaimed entries whose status is `ready-for-agent`. The tool does not apply its optional `status` argument to `list`.
2. `todo({ action: "get", id: "TODO-bbbbbbbb" })` — fetch each candidate's body; `list` returns only front matter. Check its `Blocked by:` line and fetch each blocker with `get`. A missing candidate or blocker, or a blocker not `done`, is not ready.
3. Claim the oldest unblocked candidate: `todo({ action: "claim", id: "TODO-bbbbbbbb" })`.

### 2. Read the spec

The todo body **is** the spec. Read it in full before writing any code.

### 3. Implement

For pre-agreed test-first seams (interfaces, service boundaries, pure functions), read `~/.agents/skills/tdd/SKILL.md` and follow it. During implementation:

- Run typechecking regularly.
- Run single test files regularly as you build.

Once all acceptance criteria are satisfied, run the **full test suite** once.

### 4. Review

Check the finished change against the todo's acceptance criteria. When a two-axis review is needed, read `~/.pi/agent/skills/code-review/SKILL.md` and follow it using the revision from before this ticket as the fixed point.

### 5. Commit

Read and follow the **`commit`** skill at `~/.pi/agent/skills/commit` — it is mandatory for every commit. Use Conventional Commits format with a polished, descriptive message.

### 6. Close the todo

```js
todo({ action: "update", id: "TODO-xxxx", status: "done" })
```

### 7. Loop

Return to step 1. If there are no more unblocked todos on the frontier, stop and report.
