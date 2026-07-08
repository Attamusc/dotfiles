# ADR-0004: qmk keymap formatting — deferred, not ported to Helix

**Status:** Accepted (deferral)
**Date:** 2026-07-08
**Supersedes:** D17 (grill decision — shared CLI formatter, now superseded)
**Superseded by:** —
**Related:** ADR-0005 (switch bar, qmk editing exemption),
`.pi/plans/bbq-2026-07-06/grill/2026-07-06-cmux-herdr-lazyvim-helix.md` (D17, SG5),
`.pi/plans/bbq-2026-07-06/SPIKE.md` (SG5)

## Context

The LazyVim setup uses `codethread/qmk.nvim` for automatic keymap ascii-art
formatting. It triggers on `BufEnter` for 9 keyboard layout path patterns
(iris, piantor, 3w6, swoop, sweeq, corne, totem, urchin, toucan) and formats
the layout using tree-sitter to parse the keymap structure.

The original grill decision D17 planned to extract qmk.nvim's Lua formatting
logic into a standalone CLI script, register it in Helix `languages.toml` as
an external formatter, and migrate LazyVim to invoke the same CLI via
`conform.nvim` — retiring the qmk.nvim plugin dependency from both editors.

SG5 (spike investigation) found that plan is not viable in this pass.

## Decision

**qmk keymap formatting is NOT ported to Helix in this parity pass. D17
(shared CLI formatter) is superseded and marked as a deferral.**

LazyVim retains `qmk.nvim` operating exactly as it does today:
on-BufEnter formatting for the 9 keyboard layout patterns, unchanged.

Helix has no qmk keymap formatting. Editing `keymap.c` files during the
Helix evaluation is an accepted exemption per ADR-0005 (does not reset the
switch-bar clock).

## Evidence from SG5

SG5 (`[CODEBASE]` investigation, 2026-07-06) established three facts that
make D17 non-viable as scoped:

1. **qmk.nvim is tree-sitter-dependent.** Its formatting logic uses the
   tree-sitter `qmk` grammar to parse the keymap C structure before
   applying layout alignment. This is not a simple text-manipulation
   script — it requires a working TS environment.

2. **The only byte-identical extraction path is a headless nvim wrapper.**
   A shell script that invokes `nvim --headless` + qmk.nvim's format
   function can produce byte-identical output. But this path keeps qmk.nvim
   installed in Neovim to power the wrapper — which defeats the stated goal
   of "retiring the qmk.nvim plugin dependency."

3. **A full tree-sitter rewrite is ~400–600 lines and not justified here.**
   Implementing the qmk layout formatter from scratch in another language
   (Node.js, Python, Rust, etc.) requires reimplementing the TS grammar
   parsing and layout alignment. That is a non-trivial project with no
   justification for an exploratory editor evaluation pass.

## Consequence

**LazyVim:** `qmk.nvim` stays installed. on-BufEnter formatting continues
for all 9 keyboard layout patterns. No `conform.nvim` migration. No plugin
retirement.

**Helix:** No qmk keymap formatting. Editing `keymap.c` files uses Helix
as a plain text editor. The formatted layout is whatever was last written
by LazyVim/qmk.nvim — manual re-opening in LazyVim is the formatting path.

**Switch-bar exemption (from ADR-0005):** Editing a `keymap.c` file in
LazyVim during the Helix evaluation is an **accepted exemption** — it does
NOT reset the switch-bar clock. qmk keymap formatting legitimately lives in
LazyVim for this pass; reaching for it is not a Helix failure.

## Candidate future paths

If the user commits to Helix after clearing the switch bar, revisit with
one of:

- **Headless nvim wrapper.** Shell script wraps `nvim --headless` to invoke
  qmk.nvim's format function and exit. Keeps qmk.nvim installed in nvim;
  exposes it as a CLI. Register in Helix `languages.toml` as external
  formatter. Simplest path; still requires nvim + qmk.nvim on the machine.

- **Steel plugin.** If the Helix `steel-event-system` fork (verified:
  `mattwparas/helix`, ref `steel-event-system`, commit `0522d51`) matures
  to the point where tree-sitter queries are accessible from Steel scripts,
  a Steel-based on-event hook could reimplement qmk.nvim's behaviour
  natively in Helix. Medium complexity; requires building Helix from the
  Steel branch.

- **Manual formatting.** Accept that `keymap.c` files are formatted only
  when opened in LazyVim. Low complexity; only appropriate if keyboard
  layout editing is rare.

These paths are deferred to a future plan, contingent on committing to
Helix.

## Why this ADR retains the original filename

This filename (`0004-qmk-cli-formatter.md`) was allocated in the
manifestation plan to maintain ADR numbering stability, even though the
content is a deferral rather than the original D17 "shared CLI formatter."
The deferral is the decision; the file persists as the durable record.

## References

- Grill artifact: `.pi/plans/bbq-2026-07-06/grill/2026-07-06-cmux-herdr-lazyvim-helix.md`
  (D17, SG5)
- Spike gate SG5: `.pi/plans/bbq-2026-07-06/SPIKE.md` §SG5
- Gap assessment: `.pi/plans/bbq-2026-07-06/helix-gap-assessment.md` §8
- ADR-0005 §Exemptions (qmk editing during eval)
