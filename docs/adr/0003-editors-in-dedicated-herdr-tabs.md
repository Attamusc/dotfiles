# ADR-0003: Editors run in dedicated herdr tabs — embedded agent panes retired

**Status:** Accepted
**Date:** 2026-07-08
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-0001 (additive framing), ADR-0005 (switch bar, clock-start precondition),
`.pi/plans/bbq-2026-07-06/grill/2026-07-06-cmux-herdr-lazyvim-helix.md` (D16, AR-1 O7)

## Context

The current LazyVim setup embeds a pi agent pane directly inside the editor
via two plugins:

- `folke/sidekick.nvim` — opens a named pi CLI window inside a Neovim split.
- `carderne/pi-nvim` — integrates the pi CLI into the editor session.

Together they provide an embedded-agent-pane workflow: pi lives in a
Neovim pane, receives cursor context automatically, and can edit in-place.

The herdr migration changes the terminal architecture: pi now runs in a
dedicated herdr tab alongside (not inside) the editor. Under this model,
both editors (LazyVim interim, Helix evaluation) run in their own herdr
tabs, and pi runs in adjacent herdr tabs. There is no editor-embedded pi
under the herdr stack.

This ADR records that decision and enumerates the specific capabilities
being retired, so the retirement is auditable (AR-1 O7).

**Note on rationale framing (AR-1 O7):** This ADR retires embedded-agent
panes on symmetry grounds — Neovim under herdr also drops them. It is
**not** a per-feature capability audit of sidekick.nvim or pi-nvim. The
rationale is that both editors are treated uniformly; one of them
(Neovim) not having embedded pi is enough to ensure the switch-bar
comparison is like-for-like (see ADR-0005, clock-start precondition).
Treating Neovim and Helix asymmetrically would invalidate the evaluation.

## Decision

**Under the herdr workflow stack, both editors (LazyVim interim and Helix
evaluation) run in dedicated herdr tabs. Pi runs in adjacent herdr tabs.
No editor-embedded pi panes are used under the herdr stack, regardless of
which editor is active.**

The `sidekick.nvim` and `pi-nvim` embedded-agent-pane workflow is retired
the moment daily driving moves into herdr.

### Retired capabilities

The following specific capabilities provided by sidekick.nvim and pi-nvim
are retired and have no replacement under the herdr workflow:

1. **edit-selection-in-editor** — sending a visual-mode selection directly
   to pi, which could then edit that exact region in-place in the Neovim
   buffer. Under herdr, the user copies/pastes manually between the editor
   tab and the adjacent pi tab.

2. **cursor-context handoff** — sidekick.nvim / pi-nvim automatically
   injected current file path, cursor position, and active selection into
   the pi context on session open. Under herdr, context is provided
   manually (paste the relevant code into the pi conversation).

These two capabilities are the enumerated surface of the retirement.
Neither has an equivalent in a terminal-adjacent-tab workflow.

### Clock-start precondition

This ADR is load-bearing for ADR-0005's switch-bar clock-start
precondition: **the switch-bar evaluation clock cannot start until
sidekick.nvim / pi-nvim are disabled in LazyVim AND both editors run in
dedicated herdr tabs.** See ADR-0005 §Clock-start precondition.

## Consequences

**Positive:**
- The Helix vs. LazyVim evaluation is like-for-like: neither editor has
  embedded pi. The switch bar measures editor capability, not plugin
  ecosystem asymmetry.
- Removes coupling between the editor session and the pi process — the
  agent tab survives a `:q` in the editor tab.
- Simpler mental model: one tool per tab, no embedded process management.

**Negative:**
- `edit-selection-in-editor` and `cursor-context handoff` are genuine
  capability losses. Copy-paste is slower than the embedded workflow for
  tight edit loops.
- The regret point is dateable: this ADR, 2026-07-08. If the adjacent-tab
  workflow proves insufficient after the switch-bar evaluation (ADR-0005),
  a future plan can revisit embedding (e.g. via Steel, if the Helix Steel
  branch matures — see ADR-0005 §Steel deferral).

**Neutral:**
- sidekick.nvim and pi-nvim remain installed in the LazyVim config but are
  disabled (not removed). They can be re-enabled for a non-herdr LazyVim
  session without any code change. Removal is a separate, future decision.

## Alternatives considered

- **Retain sidekick.nvim in LazyVim-under-herdr, drop only for Helix.**
  Rejected: asymmetry invalidates the switch-bar comparison. LazyVim with
  embedded pi vs. Helix without it measures "LazyVim + pi-nvim" vs. "Helix
  alone", not editor quality.

- **Build a Helix-equivalent embedded-agent pane via Steel.**
  Out of scope for this pass (ADR-0005 §Steel deferral, D18). If Steel
  matures and the switch bar is being considered for reset due to
  plugin-absence reasons, this is the legitimate activation path.

## References

- Grill artifact: `.pi/plans/bbq-2026-07-06/grill/2026-07-06-cmux-herdr-lazyvim-helix.md`
  (D16, AR-1 O7)
- Gap assessment: `.pi/plans/bbq-2026-07-06/helix-gap-assessment.md` §1
- AR-1 re-review:
  `~/.pi/agent/reviews/bbq-cmux-herdr-helix-decisions-re-review-2026-07-07T00-15-00Z.md`
