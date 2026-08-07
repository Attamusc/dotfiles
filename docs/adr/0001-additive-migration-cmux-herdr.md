# ADR-0001: Additive migration at the mux/binary layer, strict-superset swap at the subagent-extension slot

**Status:** Superseded
**Date:** 2026-07-06
**Supersedes:** —
**Superseded by:** ADR-0006 (Herdr is the sole supported multiplexer)
**Related:** ADR-0002 (fork strategy), ADR-0003 (editors in herdr tabs),
`.pi/plans/bbq-2026-07-06/grill/2026-07-06-cmux-herdr-lazyvim-helix.md` (D8, C1)

## Context

This repo has been the home of a cmux-based pi multi-agent workflow:

- `/Applications/cmux.app` provides terminal + multiplexer + agent-awareness
  (sidebar pills, progress bars, log feed, notify) in one process.
- `Attamusc/pi-cmux` reports pi session state to cmux via its Unix-socket
  API, using `describeToolActivity()` + `SUBAGENT_TOOLS`.
- `HazAT/pi-interactive-subagents` provides the `subagent` tool and spawns
  interactive children in cmux workspaces (backend selected via
  `PI_SUBAGENT_MUX` detection).

We want to add a second stack — Ghostty.app (standalone) + herdr (rust,
cross-platform, ssh-survivable) + a new `pi-herdr` state reporter — for
daily-driving pi in a mux that also works over ssh and detaches cleanly.

The naive framing is "additive migration": nothing removed, herdr lands
alongside cmux, both work. This is *almost* true but hides a real
substitution: two subagent extensions cannot coexist because they would both
register the `subagent` tool. Exactly one extension owns that namespace at a
time. That means adding herdr subagent-spawning capability *requires*
replacing the HazAT install line in `.data/pi/agent/settings.json` with a
fork that covers both mux backends.

Adversarial review (AR-1, objection O1) named this correctly: the migration
is additive at the mux/binary layer but a **swap** at the subagent-extension
slot, and the cmux workflow's survival across the swap is contingent on the
fork being a genuine strict superset of HazAT — not preserved by
construction.

A separate wrinkle (AR-1 caveat C1): `settings.json` is strict JSON. There
is no comment mechanism. A "commented-out rollback lane" is not
representable. Rollback must be version-control-based.

## Decision

**This repo's mux-layer migration is bounded by two rules that apply to this
plan and to any future work touching the mux layer:**

1. **Additive at the mux/binary layer.** cmux, pi-cmux, and Ghostty (whether
   bundled inside cmux.app or standalone in `/Applications/Ghostty.app`)
   remain installed. New tools (herdr, pi-herdr) land alongside them via
   pure additions to `.chezmoiscripts/run_once_after_10-install-homebrew-deps.sh.tmpl`
   and `.data/pi/agent/settings.json`. No entry is removed.

2. **Strict-superset swap at the subagent-extension slot.** The single
   `.data/pi/agent/settings.json` line
   `"git:github.com/HazAT/pi-interactive-subagents"` is replaced by the
   local-path install of an `Attamusc/pi-interactive-subagents` fork that
   is a **strict superset** of HazAT: the fork retains HazAT's cmux backend
   byte-for-byte from a user-observable standpoint, and adds a herdr
   backend gated by `PI_SUBAGENT_MUX` detection (order:
   `herdr → cmux → tmux → zellij → wezterm`).

The strict-superset invariant is a load-bearing contract, not an
aspiration. It is codified as ADR-0002 and verified by spike gate SG4
before the swap lands.

**Rollback lane (version-control-based, not inline-comment-based).**
Because `settings.json` is strict JSON:

- The prior HazAT git-install line is preserved in `jj` / `git` history.
- The verbatim restore snippet lives in ADR-0002 (§Rollback), so reverting
  is a one-line paste, not a from-memory reconstruction.
- Two subagent extensions cannot be installed simultaneously (tool-namespace
  collision), so the rollback is a substitution back, not a parallel entry.
- Rollback triggers: SG4's "patch grows unexpectedly" branch fires, or a
  cmux-backend regression surfaces during parallel run.

**What this ADR does NOT decide:**

- Removal of cmux, pi-cmux, or Ghostty.app. That is a separate, future,
  out-of-scope decision requiring its own cutover criteria.
- Any timeline for a "real" cutover. There is no cutover; there is a
  daily-driving posture.
- The Part 2 (editor) migration. That is bounded by ADR-0003 and ADR-0005.

## Consequences

**Positive:**
- The cmux workflow keeps working through the migration. If pi-herdr / the
  fork / herdr itself disappoint, the fallback is a single-line revert.
- The scope is honest: one substitution, named as such, on a load-bearing
  path — not hidden behind "additive."
- Future work touching the mux layer inherits a clear rule: additions are
  free; removals require a new ADR that supersedes this one.

**Negative:**
- Cmux-workflow continuity is *contingent*, not structural. It depends on
  the fork behaving as a strict superset (ADR-0002 / SG4). If the fork
  regresses cmux behaviour and the regression is not caught by SG4 or the
  Phase 4 coexistence smoke, users of the cmux workflow see the regression
  before rollback can fire.
- We carry two subagent-mux code paths in the fork indefinitely — the cmux
  backend cannot be deleted without abandoning the fallback lane defined
  here.

**Neutral:**
- Removal of cmux/pi-cmux/HazAT becomes a deliberate, dateable decision
  behind a fresh ADR — not a drift.

## Implementation notes

- Phase 0 SPIKE.md must resolve SG1–SG5 before any file governed by this
  ADR is edited.
- ADR-0002 owns the fork-strategy detail (edxeth diff evidence, existing
  fork continuity, verbatim rollback snippet).
- ADR-0003 owns the editor-workflow shift under herdr (retiring
  sidekick.nvim / pi-nvim embedded panes).

## Alternatives considered

- **"Truly additive" — install both subagent extensions in parallel.**
  Infeasible: they collide on the `subagent` tool namespace. Rejected in
  D2/D4 during grill.
- **Skip the fork; use headless subagents when launched under herdr.**
  Eliminates the swap, but forfeits the visible parallel-subagent workflow
  (watching agent panes in tabs) which is the stated reason for the
  migration. Rejected in D2 (H3).
- **Inline-commented rollback entry in settings.json.** Not representable
  in strict JSON (AR-1 C1). Rejected. Rollback via version control
  instead.

## References

- Grill artifact: `.pi/plans/bbq-2026-07-06/grill/2026-07-06-cmux-herdr-lazyvim-helix.md`
  (D8, D2, D4, C1)
- AR-1 objection O1 and caveat C1:
  `~/.pi/agent/reviews/bbq-cmux-herdr-helix-decisions-2026-07-06T23-34-14Z.md`
- AR-1 re-review (SURVIVES WITH CAVEATS):
  `~/.pi/agent/reviews/bbq-cmux-herdr-helix-decisions-re-review-2026-07-07T00-15-00Z.md`
