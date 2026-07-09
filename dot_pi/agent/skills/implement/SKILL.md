---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Work the **todo frontier** defined in `../todo-tracker.md`. Pick the next unblocked `ready-for-agent` todo, work it to completion, then repeat — one ticket at a time, clearing context between.

## Process

### 1. Find the next todo

Follow the frontier algorithm in `../todo-tracker.md`:

1. `todo({ action: "list" })` — list open todos.
2. For each, check the `Blocked by:` line in the body; verify all listed blockers have `status: "done"`.
3. Skip claimed todos (`assigned_to_session` set).
4. Claim the oldest unblocked, unclaimed item: `todo({ action: "claim", id: "TODO-xxxx" })`.

### 2. Read the spec

The todo body **is** the spec. Read it in full before writing any code.

### 3. Implement

Use `/tdd` at pre-agreed seams (interfaces, service boundaries, pure functions). During implementation:

- Run typechecking regularly.
- Run single test files regularly as you build.

Once all acceptance criteria are satisfied, run the **full test suite** once.

### 4. Review

Run `/code-review` on the finished work.

### 5. Commit

Read and follow the **`commit`** skill at `~/.pi/agent/skills/commit` — it is mandatory for every commit. Use Conventional Commits format with a polished, descriptive message.

### 6. Close the todo

```js
todo({ action: "update", id: "TODO-xxxx", status: "done" })
```

### 7. Loop

Return to step 1. If there are no more unblocked todos on the frontier, stop and report.
