---
description: Canonical `todo` tool status, claim, and blocking conventions for the planner, implement, and code-review workflows.
disable-model-invocation: true
---

# todo-tracker

This document defines the shared conventions for pi's built-in file-based `todo` tool.
The planner uses it to create tickets; `implement` and `code-review` use it to read and
work them. There is no per-repo tracker configuration.

---

## Identity

Issues = todos. Every issue is a todo identified by `TODO-<hex>` (e.g. `TODO-f1c46ba1`).

**Tool actions:**

| Action | What it does |
|---|---|
| `create` | Open a new issue |
| `get` | Fetch a single issue by id |
| `update` | Replace the body (full rewrite) |
| `append` | Add to the body (comments, notes, answers) |
| `delete` | Remove an issue |
| `list` | List unclosed todos; filter status and tags from the returned entries |
| `list-all` | List all todos, including closed ones |
| `claim` | Assign the issue to the current session |
| `release` | Unassign (release for another session) |

---

## Category → tags

| Concept | Tag value |
|---|---|
| Bug | `bug` |
| Enhancement / feature | `enhancement` |

Pass tags as an array: `tags: ["bug"]`.

---

## State → `status` field

State is a free string in the `status` field. The canonical vocabulary:

| Status | Meaning |
|---|---|
| `draft` | Ticket being authored; blockers may not be wired yet |
| `needs-triage` | Not yet evaluated by a maintainer |
| `needs-info` | Waiting on the reporter for more information |
| `ready-for-agent` | Fully specified; an autonomous agent can work it |
| `ready-for-human` | Requires human implementation or decision |
| `wontfix` | Will not be actioned |
| `done` | Completed; closed |

**State-machine transitions:**

```
(new)  →  draft | needs-triage
draft  →  ready-for-agent | ready-for-human
needs-triage  →  needs-info | ready-for-agent | ready-for-human | wontfix
needs-info  →  needs-triage | wontfix
ready-for-agent  →  done | needs-info
ready-for-human  →  done | needs-info
```

Use `status: "ready-for-agent"` for worker tickets and `status: "done"` when a ticket is complete.

---

## Comments → `append`

Notes and resolution details append to the todo body. Use `append` so existing
content is preserved:

```js
todo({ action: "append", id: "TODO-aabbccdd", body: "\n## Resolution\nVerified by the integration test." })
```

Never use `update` for comments — `update` is a full body replacement and destroys history.

---

## Claim / Assign → `claim` / `release`

Before starting work on a todo, claim it to prevent another session from picking it up
concurrently:

```js
todo({ action: "claim", id: "TODO-xxxx" })
// ... do the work ...
todo({ action: "release", id: "TODO-xxxx" })   // only if handing back without closing
```

An issue with `assigned_to_session` set is claimed. Do not work a claimed issue belonging to
another session unless you pass `force: true` and have confirmed the other session is dead.

---

## Blocking edges → `Blocked by:` body convention

There is no native dependency field. Encode blockers as a line in the todo body:

```
Blocked by: TODO-aabbccdd, TODO-11223344
```

Rules:
- The line can appear anywhere in the body; conventionally near the top.
- List all direct blockers, comma-separated.
- A todo is **unblocked** when every `TODO-xxxx` listed on that line has `status: "done"`.
- Remove or update the line when blockers resolve.

---

## Frontier algorithm

The **frontier** is the set of open, unblocked, unclaimed todos — the work an agent should pick
up next.

**Steps an agent follows:**

1. **List todos, then filter by status and assignment:**
   ```js
   todo({ action: "list" })
   // Keep only entries with status: "ready-for-agent" and no assigned_to_session.
   ```
   The `list` action does not filter on its optional `status` argument. Draft,
   human-owned, and needs-info tickets must be excluded explicitly.

2. **Fetch each candidate's body:** `list` returns only front matter, not the `Blocked by:` line.
   ```js
   todo({ action: "get", id: "TODO-bbbbbbbb" }) // candidate id from list
   ```
   If a candidate cannot be fetched, do not claim it.

3. **Check the candidate's `Blocked by:` line:**
   - If absent, the candidate is unblocked.
   - If `Blocked by: TODO-xxxx, ...` is present, fetch each blocker:
     ```js
     todo({ action: "get", id: "TODO-aaaaaaaa" }) // blocker id from the candidate's body
     ```
     If **all** blockers have `status: "done"`, the candidate is unblocked.
     If any blocker is missing or not `done`, skip this candidate.

4. **Remaining todos are on the frontier.** Order by creation date ascending (oldest first) as
   a default priority unless the project specifies otherwise.

5. **Claim and work the first frontier item:**
   ```js
   todo({ action: "claim", id: "TODO-yyyy" })
   ```

### Worked example

Suppose you have three todos:

```
TODO-aaaa  status: done         title: "Set up DB schema"
TODO-bbbb  status: ready-for-agent  body: "Blocked by: TODO-aaaa"  (unclaimed)
TODO-cccc  status: ready-for-agent  body: "Blocked by: TODO-bbbb"  (unclaimed)
```

**Step 1** — list, keep unclaimed `ready-for-agent` entries:
```js
todo({ action: "list" })
// Candidates: TODO-bbbb, TODO-cccc (both ready and unclaimed).
```

**Step 2** — fetch each candidate's body to discover its blockers:
```js
todo({ action: "get", id: "TODO-bbbb" }) // body: Blocked by: TODO-aaaa
todo({ action: "get", id: "TODO-cccc" }) // body: Blocked by: TODO-bbbb
```

**Step 3** — check each blocker:
```js
todo({ action: "get", id: "TODO-aaaa" }) // done: TODO-bbbb is unblocked
todo({ action: "get", id: "TODO-bbbb" }) // ready: TODO-cccc remains blocked
```

**Step 4** — frontier = `[TODO-bbbb]`. (`TODO-cccc` is blocked.)

**Step 5** — claim and work it:
```js
todo({ action: "claim", id: "TODO-bbbb" })
```
