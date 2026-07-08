# ADR-0005: Helix switch bar — criterion, clock, and Steel deferral

**Status:** Accepted
**Date:** 2026-07-08
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-0003 (editors in herdr tabs, clock-start precondition),
ADR-0004 (qmk deferral, editing exemption),
`.pi/plans/bbq-2026-07-06/grill/2026-07-06-cmux-herdr-lazyvim-helix.md` (D15, D18, AR-1 C2)

## Context

The LazyVim → Helix track is a **serious evaluation** (grill D14): build the
Helix config, live in it, and either switch or archive with a decision.
A serious evaluation requires a pre-declared switch criterion — without one,
the question "should I cut over to Helix?" has no falsifiable answer and
degenerates into indefinite deferral or gut-feel.

Adversarial review AR-1 (caveat C2) hardened the "escape" and "project week"
definitions against three identified ambiguity edges. This ADR records the
hardened definitions verbatim.

**User decision recorded 2026-07-07:** Editing a `keymap.c` file in LazyVim
during the Helix evaluation is an accepted exemption (does not reset the
clock). This replaces the original temporary "qmk-formatter-not-yet-finished
window" carve-out from the grill, which was contingent on SG5 completing.
Since qmk formatting is permanently deferred from Helix (ADR-0004), the
exemption is permanent.

## Decision

### Switch criterion

**Four consecutive project weeks of daily driving Helix without ever
reaching for LazyVim to escape a task.** One "escape to LazyVim" resets
the clock.

If the criterion is met, the decision to delete LazyVim is earned. If the
criterion is never met, the evaluation is archived with a record of which
escapes occurred.

### Clock-start precondition

**The clock cannot begin until BOTH of the following hold:**

1. `sidekick.nvim` / `pi-nvim` embedded-agent panes are disabled in LazyVim
   (per ADR-0003), AND
2. Both editors (LazyVim and Helix) are being driven inside dedicated herdr
   tabs with pi in adjacent tabs (per ADR-0003).

Until both conditions are met, the evaluation pits Helix-in-a-plain-terminal
against LazyVim-with-embedded-pi — measuring plugin ecosystem asymmetry, not
editor quality. The switch bar compares like-for-like: LazyVim-in-herdr-tab
(no sidekick) vs. Helix-in-herdr-tab.

### Definitions

**"Escape to LazyVim"** — opening LazyVim to *perform any edit* you tried,
failed, or declined to do in Helix. The test is edit-intent, not
intent-to-escape: if you type into a buffer and save it in LazyVim, it counts
— including a muscle-memory `nvim <path>` that you then actually edit in
(that relapse is exactly what the switch bar measures, so it is not carved
out). Resets the clock.

**Explicitly NOT an escape:**
- Opening LazyVim to *view only* — read a file, a colleague's config — with
  no edit.
- **Editing a `keymap.c` file in LazyVim.** This is an **accepted exemption**
  (user decision, 2026-07-07): qmk keymap formatting legitimately lives in
  LazyVim for this pass (ADR-0004). Reaching for it is not a Helix failure
  and does not reset the clock.

The one bright line: **did you edit-and-save in LazyVim (outside the
`keymap.c` exemption)? → escape.**

**"Project week"** — five weekdays containing real coding work. Weekends do
not count for or against. A week with zero coding (travel, illness, PTO)
**pauses** the clock — it neither advances nor resets. The clock measures
*consecutive coding weeks*, not calendar weeks.

### Why four weeks

Duration raised from two to **four** project weeks during the grill (D15,
raised per AR-1 O4). Two was chosen without justification and is short
against the standard 4–6 week muscle-memory-replacement window for
developer-tooling migrations. Four is the low end of that range and long
enough to hit real edge cases: large cross-buffer refactors, obscure file
formats, the muscle-memory relapse curve.

## Steel deferral (D18)

Steel scripting for Helix (`mattwparas/helix`, branch `steel-event-system`,
commit `0522d51`, verified via `git ls-remote` 2026-07-06) is **deferred —
not in this plan.**

No spike work, no build-from-source, no Steel config files in this pass.

**Legitimate future path:** If, after living in native Helix, the user hits a
specific limitation attributable to plugin absence (candidate: closing
residual LazyVim/Helix gaps that matter at the switch-bar decision point), a
fresh plan covers the `mattwparas/helix steel-event-system` fork, forge /
Steel-LSP setup, and any port work (e.g. qmk on-enter hook via Steel). Steel
is not vaporware — the branch and `STEEL.md` exist and return HTTP 200.
Its motivation activates only if the base native-Helix parity work falls
short.

## Consequences

**Positive:**
- The switch-bar question has a pre-declared, falsifiable answer. "Should I
  cut over to Helix?" resolves to: "have I reached four consecutive coding
  weeks without an escape?"
- The clock-start precondition ensures the comparison is fair. The evaluation
  cannot be distorted by plugin asymmetry.
- The `keymap.c` exemption is explicit and permanent (not contingent on SG5
  completing), reflecting the actual scoping decision in ADR-0004.

**Negative:**
- Four coding weeks is a real commitment. The evaluation takes time.
- The escape definition requires honest self-reporting — there is no
  automated tracking.

**Neutral:**
- If the switch bar is never cleared, the evaluation produces a durable
  record (this ADR + gap assessment) explaining why. That record is the
  "archive with a decision" outcome.

## References

- Grill artifact: `.pi/plans/bbq-2026-07-06/grill/2026-07-06-cmux-herdr-lazyvim-helix.md`
  (D15, D18, AR-1 C2, AR-1 O3, AR-1 O4)
- ADR-0003 (editors in dedicated herdr tabs — clock-start dependency)
- ADR-0004 (qmk deferral — source of the keymap.c exemption)
- Gap assessment: `.pi/plans/bbq-2026-07-06/helix-gap-assessment.md`
- AR-1 re-review (SURVIVES WITH CAVEATS):
  `~/.pi/agent/reviews/bbq-cmux-herdr-helix-decisions-re-review-2026-07-07T00-15-00Z.md`
