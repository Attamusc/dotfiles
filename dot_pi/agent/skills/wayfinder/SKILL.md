---
name: wayfinder
description: Plan a huge chunk of work — more than one agent session can hold — as a shared map of investigation tickets, and resolve them one at a time until the way to the destination is clear.
disable-model-invocation: true
---

A loose idea has arrived — too big for one agent session, and wrapped in fog: the way from here to the **destination** isn't visible yet. Wayfinding is about finding that way, not charging at the destination. This skill charts the way as a **shared map** of todos, then works its tickets one at a time until the route is clear.

The destination varies per effort, and naming it is the first act of charting — it shapes every ticket. It might be a spec to hand off and iterate on, a decision to lock before planning starts, or a change made in place like a data-structure migration. The map is domain-agnostic — engineering work, course content, whatever fits the shape.

**Where todos, blocking, and frontier queries live:** the pi `todo` tool. See `../todo-tracker.md` for the canonical mapping — identity, states, `Blocked by:` convention, `parent:<map-id>` tags, and the frontier algorithm. This skill uses those definitions without restating them.

## Plan, don't do

Wayfinder is **planning** by default: each ticket resolves a decision, and the map is done when the way is clear — nothing left to decide before someone goes and does the thing. The pull to just do the work is usually the signal you've reached the edge of the map and it's time to hand off. An effort can override this in its **Notes** — carrying execution into the map itself — but absent that, produce decisions, not deliverables.

## Refer by name

Every map and ticket has a **title**. In everything the human reads — narration, the map's Decisions-so-far — refer to it by that title, never by a bare id. A wall of `TODO-aabb, TODO-ccdd` is illegible; names read at a glance. The id doesn't vanish — a name wraps its reference — but ids ride *inside* the name, never stand in for it.

## The Map

The map is a single todo tagged `wayfinder:map` — the canonical artifact. Its child tickets are separate todos each carrying a `parent:<map-id>` tag (see `../todo-tracker.md`).

The map is an **index**, not a store. It lists the decisions made and points at the tickets that hold their detail; a decision lives in exactly one place — its ticket — so the map never restates it, only gists it and links.

### The map body

The whole map at low resolution, loaded once per session. Open tickets are **not** listed in the body — they are open child todos, found by querying with `todo({ action: "list-all" })` and filtering for `parent:<map-id>`.

```markdown
## Destination

<what reaching the end of this map looks like — the spec, decision, or change this effort is finding its way to. One or two lines; every session orients to it before choosing a ticket.>

## Notes

<domain; skills every session should consult; standing preferences for this effort>

## Decisions so far

<!-- the index — one line per closed ticket: enough to judge relevance, then zoom the reference for the detail the ticket holds -->

- **<closed ticket title>** (TODO-xxxx) — <one-line gist of the answer>

## Not yet specified

<!-- see "Fog of war": in-scope fog you can't ticket yet; graduates as the frontier advances -->

## Out of scope

<!-- see "Out of scope": work ruled beyond the destination; closed, never graduates -->
```

**Create the map:**

```js
todo({
  action: "create",
  title: "Effort: <destination name>",
  tags: ["wayfinder:map"],
  body: "## Destination\n\n<...>\n\n## Notes\n\n<...>\n\n## Decisions so far\n\n## Not yet specified\n\n## Out of scope\n"
})
// Returns: TODO-mapid
```

### Tickets

Each ticket is a child todo of the map, tagged `parent:<map-id>` plus a `wayfinder:<type>` tag (one of `research`, `prototype`, `grilling`, `task` — see [Ticket Types](#ticket-types)):

```js
todo({
  action: "create",
  title: "<Ticket title>",
  tags: ["parent:TODO-mapid", "wayfinder:research"],
  status: "ready-for-agent",
  body: "Blocked by: TODO-prerequisiteid\n\n## Question\n\n<the decision or investigation this ticket resolves>"
})
```

The ticket body is the question, sized to one 100K token agent session. The answer is **not** part of the original body — it's appended on resolution.

**Blocking:** encode with the `Blocked by: TODO-xxxx` body convention defined in `../todo-tracker.md`. A ticket is unblocked when every listed blocker has `status: "done"`.

**Frontier:** open + all blockers done + unclaimed. Follow the exact algorithm in `../todo-tracker.md`'s "Frontier algorithm" section.

**Claim:** before any work, claim the ticket:

```js
todo({ action: "claim", id: "TODO-xxxx" })
```

One ticket per session — never resolve more than one. An open, unclaimed ticket is available; a claimed ticket belongs to another session — skip it.

## Ticket Types

Every ticket is either **HITL** — human in the loop, worked *with* a human who speaks for themselves — or **AFK**, driven by the agent alone. A HITL ticket only resolves through that live exchange; the agent never stands in for the human's side of it (a grilling agent that answers its own questions has broken this).

- **Research** (AFK): Reading documentation, third-party APIs, or local resources like knowledge bases. Creates a markdown summary as a linked asset. Use when knowledge outside the current working directory is required. Invoke the local `researcher` skill.
- **Prototype** (HITL): Raise the fidelity of the discussion by making a cheap, rough, concrete artifact to react to — an outline, a rough take, a stub, or UI/logic code via the `/prototype` skill. Links the prototype as an asset. Use when "how should it look" or "how should it behave" is the key question.
- **Grilling** (HITL): Conversation via the `/grill-me` and `/domain-modeling` skills, one question at a time. The default case.
- **Task** (HITL or AFK): Manual work that must happen before a *decision* can be made — nothing to decide, prototype, or research, but the discussion is blocked until it's done. Signing up for a service so its API can be judged, provisioning access, moving data so its shape can be seen. This is the one type that *does* rather than decides — and it earns its place by unblocking a decision, not by delivering the destination. The agent drives it alone where it can (AFK); otherwise it hands the human a precise checklist (HITL). Resolved when the work is done; the answer records what was done and any resulting facts (credentials location, new URLs, row counts) later tickets depend on.

## Fog of war

The map is _deliberately_ incomplete: don't chart what you can't yet see. Beyond the live tickets lies the **fog of war** — the dim view of decisions and investigations you can tell are coming but can't yet pin down, because they hang on questions still open. Resolving a ticket clears the fog ahead of it, graduating whatever's now specifiable into fresh tickets — one at a time, until the way to the destination is clear and no tickets remain.

The map's **Not yet specified** section is where that dim view is written down: the suspected question, the area to revisit later. It's the undiscovered frontier _toward_ the destination — everything here is in scope, just not sharp enough to ticket. Write as loosely or as fully as the view allows; it doubles as a signpost for collaborators reading where the effort is headed.

**Fog or ticket?** The test is whether you can state the question precisely now — _not_ whether you can answer it now.

- **Ticket when** the question is already sharp — even if it's blocked and you can't act on it yet.
- **Not yet specified when** you can't yet phrase it that sharply. Don't pre-slice the fog into ticket-sized pieces: it's coarser than a ticket, and one patch may graduate into several tickets, or none, once the frontier reaches it.

**Not yet specified** excludes what's already decided (Decisions so far), what's already a live ticket, and what's out of scope (the next section).

## Out of scope

Fog only ever gathers _toward_ the destination. The destination fixes the scope, so work beyond it is **out of scope** — it isn't fog, and it doesn't belong in **Not yet specified**. It gets its own **Out of scope** section on the map: work you've consciously ruled out of _this_ effort. Scope, not sharpness, lands it here.

Out-of-scope work never graduates — the frontier stops at the destination — so it returns only if the destination is redrawn, and then as a fresh effort, not a resumption.

Ruling something out of scope is a scoping act, not a step on the route. When a ticket that already exists turns out to sit past the destination — mis-scoped in while charting, or exposed by a resolution — set its `status: "done"` (a closed ticket is unambiguously off the frontier) and leave one line in the **Out of scope** section: the gist plus why it's out of scope, referencing the closed ticket. It stays out of **Decisions so far**, which records the route actually walked — a scope boundary isn't a step on it.

## Invocation

Two modes. Either way, **never resolve more than one ticket per session.**

### Chart the map

User invokes with a loose idea.

1. **Name the destination.** Run a `/grill-me` and `/domain-modeling` session to pin down what this map is finding its way to — the spec, decision, or change. The destination fixes the scope, so it's settled first.
2. **Map the frontier.** Grill again, **breadth-first** this time: fan out across the whole space rather than deep on any one thread, surfacing the open decisions and the first steps takeable now. **If this surfaces no fog** — the way to the destination is already clear, the whole journey small enough for one session — you don't need a map. Stop and ask the user how they'd like to proceed.
3. **Create the map** (tagged `wayfinder:map`): Destination and Notes filled in, Decisions-so-far empty, the fog sketched into **Not yet specified**.
4. **Create the tickets you can specify now** as child todos of the map — then wire blocking edges in a **second pass** (todos need ids before they can reference each other). Wiring sorts them into the frontier and the blocked; everything you can't yet specify stays in the fog — the **Not yet specified** section.
5. Stop — charting the map is one session's work; do not also resolve tickets.

### Work through the map

User invokes with a map id (e.g. `TODO-mapid`). A ticket is **optional** — without one, you pick the next decision, not the user.

1. Load the **map** — fetch it with `todo({ action: "get", id: "TODO-mapid" })` for the low-res view, not every ticket body.
2. Choose the ticket. If the user named one, use it. Otherwise compute the frontier per `../todo-tracker.md` scoped to children of the map (filter `parent:<map-id>`), then take the first frontier ticket. **Claim it** before any work:
   ```js
   todo({ action: "claim", id: "TODO-ticketid" })
   ```
3. Resolve it — zoom as needed: fetch the full body of any related or closed ticket on demand with `todo({ action: "get", ... })`; invoke the skills the map's **Notes** block names. If in doubt, use `/grill-me` and `/domain-modeling`.
4. Record the resolution:
   - Append the answer to the ticket:
     ```js
     todo({ action: "append", id: "TODO-ticketid", body: "\n## Answer\n\n<resolution>" })
     ```
   - Close the ticket:
     ```js
     todo({ action: "update", id: "TODO-ticketid", status: "done" })
     ```
   - Append a one-line gist to the map's Decisions-so-far:
     ```js
     todo({ action: "append", id: "TODO-mapid", body: "\n- **<ticket title>** (TODO-ticketid) — <one-line gist>" })
     ```
5. Add newly-surfaced tickets (create-then-wire); graduate any fog the answer has made specifiable, clearing each graduated patch from **Not yet specified** so it lives only as its new ticket. If the answer reveals a ticket — this one or another — sits beyond the destination, **rule it out of scope** rather than resolving it on the route. If the decision invalidates other parts of the map, update or close those tickets.

The user may run unblocked tickets in parallel, so expect other sessions to be editing todos concurrently — the `claim` step is the guard.
