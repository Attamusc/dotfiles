# Second `/formal-review` slice: Jujutsu bookmark fields

Run `lean Model.lean` here (Lean 4.34.1 via elan). Run the real tests with `cd dot_pi/agent && node --test test/status-footer.test.mjs` from the repository root.

## Boundary and correspondence

`status-footer` calls `jj log` with `JJ_REVSET` and `JJ_TEMPLATE` in `dot_pi/agent/extensions/status-footer/state.ts`. The template emits a `current` record, zero or more `step` records, and optionally a bookmarked `base`. `parseJjState` reads the current ID, bookmarks, diff counts and conflict count; a base's first bookmark determines `nearestBookmark` and its distance counts steps plus the base. No asynchronous footer refresh, Git parsing, invalid template output, merges, or user-interface rendering is modeled.

| Meaning | Implementation | Lean |
|---|---|---|
| Old comma-separated bookmark field | old `JJ_TEMPLATE`, old `parseJjState` | `oldBookmarks` |
| Jujutsu bookmark field encoded as JSON | `JJ_TEMPLATE`'s `json(local_bookmarks.map(...))` | `jsonBookmarks` |
| Decoding JSON names | `parseJjState`'s `JSON.parse` | `parseBookmarks` |
| Current/base metadata and ahead distance | `parseJjState` | `Snapshot`, `parseSnapshot` |

A valid Jujutsu bookmark may contain a comma (created by `jj bookmark create '"alpha,beta"'`). Before the fix, real `jj log` produced `current\t...\t"alpha,beta"\t...`; `parseJjState` split this **one** bookmark into `['"alpha', 'beta"']`. After the fix, real `jj log` on that same repository produced `current\t...\t["alpha,beta"]\t...`, and `parseJjState` returned `['alpha,beta']`. A second scratch repository showed a bookmarked base named `main,release` parsed as one `nearestBookmark`, with `ahead: 1`. These same captures parsed correctly with macOS Jujutsu 0.45.1 and the 0.44.0 version pinned for Fedora (invoked through `mise exec jj@0.44.0` on macOS). Fedora itself was not run.

`old_comma_witness` and `json_comma_witness` use `native_decide` on **concrete strings** because Lean's string split and JSON parser do not reduce with ordinary `decide`. `no_base_no_distance`, `distance_from_base`, and `bookmarks_preserved` prove the semantic mapping for structurally valid snapshots. The finite JSON examples do **not** prove a generic round-trip theorem for every string. An attempted `parseBookmarks (jsonBookmarks names) = some names` with `simp` remains **PROOF_INCOMPLETE**; the Lean JSON library's parse/serialize correspondence was not established here. Node fixtures and real Jujutsu executions, not that incomplete proof, establish the tested implementation cases.
