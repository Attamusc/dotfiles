# todo-tracker

This document encodes the canonical tracker → `todo` tool mapping used by all pivoted
mattpocock/skills in this pi configuration. Every skill that would reference
`docs/agents/issue-tracker.md` or `setup-matt-pocock-skills` references this file instead.

The tracker backend is pi's built-in file-based `todo` tool. There is no per-repo tracker
configuration — the mapping is globally fixed.

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
| `list` | List issues matching filters (status, tags) |
| `list-all` | List all issues regardless of status |
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
| `needs-triage` | Not yet evaluated by a maintainer |
| `needs-info` | Waiting on the reporter for more information |
| `ready-for-agent` | Fully specified; an autonomous agent can work it |
| `ready-for-human` | Requires human implementation or decision |
| `wontfix` | Will not be actioned |
| `done` | Completed; closed |

**State-machine transitions:**

```
(new)  →  needs-triage
needs-triage  →  needs-info | ready-for-agent | ready-for-human | wontfix
needs-info  →  needs-triage | wontfix
ready-for-agent  →  done | needs-info
ready-for-human  →  done | needs-info
```

When a skill says "apply the AFK-ready triage label", set `status: "ready-for-agent"`.  
When a skill says "close the issue", set `status: "done"`.

---

## Comments → `append`

Triage notes, agent briefs, and resolution comments all append to the todo body. Use the
`append` action so history accumulates rather than overwrites:

```js
todo({ action: "append", id: "TODO-xxxx", body: "**Triage note (2026-07-09):** Reproduced on macOS 14. Ready for agent." })
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

## Parent / child → `parent:TODO-xxxx` tag

Wayfinder map → ticket relationships use a tag:

- The **map** todo carries the tag `wayfinder:map`.
- Each **child** todo carries `parent:<map-id>` (e.g. `parent:TODO-f1c46ba1`).

To find all children of a map: `list-all` and filter tags for `parent:<map-id>`.

---

## Frontier algorithm

The **frontier** is the set of open, unblocked, unclaimed todos — the work an agent should pick
up next.

**Steps an agent follows:**

1. **List open todos:**
   ```js
   todo({ action: "list" })
   // Returns todos where status is not "done", "wontfix"
   ```

2. **For each returned todo, check for a `Blocked by:` line** in its body.  
   - If no `Blocked by:` line → candidate is unblocked.  
   - If `Blocked by: TODO-xxxx, ...` present → for each listed id, call:
     ```js
     todo({ action: "get", id: "TODO-xxxx" })
     ```
     If **all** blockers have `status: "done"` → candidate is unblocked.  
     If **any** blocker is not `done` → skip this candidate.

3. **Filter out claimed todos:** skip any todo where `assigned_to_session` is set.

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

**Step 1** — list open todos:
```js
todo({ action: "list" })
// Returns: TODO-bbbb, TODO-cccc
```

**Step 2** — check blockers:

For `TODO-bbbb`:
```js
todo({ action: "get", id: "TODO-aaaa" })
// → status: "done"  ✓ unblocked
```

For `TODO-cccc`:
```js
todo({ action: "get", id: "TODO-bbbb" })
// → status: "ready-for-agent"  ✗ not done → blocked
```

**Step 3** — neither is claimed.

**Step 4** — frontier = `[TODO-bbbb]`. (`TODO-cccc` is blocked.)

**Step 5** — claim and work it:
```js
todo({ action: "claim", id: "TODO-bbbb" })
```

---

## Map artifact (wayfinder)

A **wayfinder map** is a todo that functions as the root of an effort tree.

- Tag: `wayfinder:map`
- Body: Notes, decisions, fog-of-war context for the effort
- Children: separate todos each tagged `parent:<map-id>`

**Create a map:**
```js
todo({
  action: "create",
  title: "Effort: refactor auth module",
  tags: ["wayfinder:map"],
  body: "## Notes\n\n## Decisions\n\n## Fog\n"
})
// Returns: TODO-mapid
```

**Create a child ticket:**
```js
todo({
  action: "create",
  title: "Research: OAuth token storage options",
  tags: ["parent:TODO-mapid", "enhancement"],
  status: "ready-for-agent",
  body: "Blocked by: TODO-prerequisiteid\n\nInvestigate storage strategies for refresh tokens."
})
```

**Find all children of a map:**
```js
todo({ action: "list-all" })
// Filter results: tags.includes("parent:TODO-mapid")
```

When a child resolves, append its answer/outcome to the map body so the map stays as a
running decisions log:
```js
todo({
  action: "append",
  id: "TODO-mapid",
  body: "\n### TODO-childid resolved\n\nDecision: use OS keychain. Rationale: ...\n"
})
```
