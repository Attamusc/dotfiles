# Agent tooling follow-ups

Date: 2026-10-18
Status: parked; not approved for implementation
Related: [active five-project roadmap](agent-tooling-roadmap.md)

These are the seven remaining ideas from the GitHub tooling review. They are not
active implementation todos. Reinspect each repository and its conventions before
promotion: the observations below came from bounded source inspection, not a full
code audit or executed test suite. This document contains no private transcripts,
vault data, credentials, or machine-specific device identifiers.

## 1. Go60 export-drift CI

- Repository: [go60-zmk-config](https://github.com/Attamusc/go60-zmk-config).
- Complexity: low. Payoff: low–medium, concentrated around firmware changes.
- Basis: `tests/test_export_layout_editor.py` exercises the derived Layout Editor
  JSON; the inspected `.github/workflows/build.yml` builds and uploads firmware
  without running those Python tests or comparing regenerated JSON to the commit.
- First slice: run export tests and regeneration in a disposable CI checkout;
  fail on tracked export drift before the expensive firmware build. Explain which
  binding/layer changed rather than presenting an unexplained JSON diff.
- Acceptance: an unchanged fixture passes; stale export and invalid binding
  fixtures fail; the existing firmware output is unchanged. No writes to the
  owner's working tree, firmware flashing, or Bluetooth resets.
- Promotion trigger: next Go60 layout change, or a spare small-task slot. This is
  the quickest follow-up, not a prerequisite for any active project.

## 2. Weekly-report CLI end-to-end AI-failure coverage

- Repository: [weekly-report-cli](https://github.com/Attamusc/weekly-report-cli).
- Complexity: medium. Payoff: medium for recurring reporting.
- Basis: `internal/ai/copilot_test.go` already covers malformed/fenced responses,
  chunking, timeouts, cleanup and disabled host capabilities. Existing pipeline
  tests also need inspection before deciding what is missing.
- First slice: test the CLI-to-report path with fake GitHub/Copilot boundaries;
  verify malformed, partial, unavailable and interrupted AI responses do not
  silently drop source updates or produce an apparently complete report.
- Acceptance: deterministic CLI exit/error/report assertions; source rows remain
  traceable and completeness is explicit. Run existing Go tests and relevant race
  checks. No live tokens, provider calls, report posting or production issue edits.
- Agent split: fixture/transport worker and independent report-correctness verifier.
- Promotion trigger: next report reliability issue or Copilot SDK upgrade.

## 3. Grimoire repeatable performance suite

- Repository: [grimoire](https://github.com/Attamusc/grimoire).
- Complexity: medium. Payoff: medium, higher if latency is a current pain point.
- Basis: `scripts/measure-thread-capacity.mjs` measures a bounded concurrent
  deterministic ACP fixture using a single measurement run. Other QMD performance
  scripts exist; do not build a duplicate measurement framework.
- First slice: repeated concurrency sweeps, startup/first-output distributions,
  memory measurements and comparable machine-readable artifacts using synthetic
  data. Separate protocol capacity from Tauri/editor responsiveness.
- Acceptance: reproducible fixture/config identifiers, warmup/repetition rules,
  explicit environment and noise notes, bounded cleanup, and a baseline report.
  Start with reports rather than a flaky wall-clock CI threshold.
- Agent split: benchmark producer and independent measurement-method reviewer.
- Promotion trigger: measurable slowdowns or changes to concurrent thread handling.

## 4. Generated lifecycle-contract tests

- Repository: [pi-agent-execution](https://github.com/Attamusc/pi-agent-execution).
- Complexity: medium–high. Payoff: indirect reliability across consumers.
- Basis: `README.md` and `test/lifecycle.test.js` describe separate evidence axes
  for completion intent, settlement, process exit, control and transport state.
  Generated coverage is an opportunity, not a proven absence of equivalent tests.
- First slice: inspect current coverage, then generate reordered, stale, duplicate
  and contradictory evidence sequences against a small independent reference
  model. Keep failures reproducible through fixed seeds and minimized traces.
- Acceptance: invariants include run correlation, per-source ordering, first
  terminal-control-cause preservation and no inference of process exit from
  completion intent. Prove test sensitivity with deliberately incorrect reducers.
- Agent split: reference-model owner separate from generator/reducer-test owner.
  This pure library must not gain process, pane or session lifecycle ownership.
- Promotion trigger: after the active empty-subagent investigation, or before a
  lifecycle-contract change. Not required to diagnose the current symptom.

## 5. Keyboard behavior vectors and owner-run hardware guide

- Repository: [keymap-workbench](https://github.com/Attamusc/keymap-workbench), with
  the Go60 and Toucan firmware repositories as read-only source references.
- Complexity: medium–high. Payoff: medium around layout changes.
- Basis: editing, comparison, remote builds, checksum-verified downloads and
  stale-download blocking are already implemented. The README explicitly leaves
  hardware/runtime behavior unverified.
- First slice: expected-action vectors for shared bindings, board overrides,
  combo projection and layer transitions, plus an interactive owner-run checklist
  tied to a specific project revision and artifact hashes.
- Acceptance: project/projection expectations are automatically checked and kept
  distinct from firmware timing/behavior claims. Test evidence identifies board,
  revision and observed result. A simulator is not ZMK hardware proof.
- Limits: no flashing, firmware fork upgrades, pairing resets or automatic
  multi-repository synchronization. Physical checks require separate owner approval.
- Promotion trigger: before the next daily-driver firmware rollout.

## 6. First usable Helix hunk-review shell

- Repository: [pi-hunk-review](https://github.com/Attamusc/pi-hunk-review).
- Complexity: high. Payoff: high only if Helix is a daily review editor.
- Basis: the Rust core is editor-agnostic, Neovim has a real shell, and
  `shells/helix/handshake-smoke/` only proves the authenticated handshake. A full
  Helix shell is explicitly deferred to v2.
- First slice: validate current Helix integration capabilities, then list dirty
  files/hunks, navigate and submit notes using the existing RPC contract. Avoid
  hunk rejection/mutation in the first slice.
- Acceptance: real Helix-to-core test proves selected-session identity, submitted
  notes and acknowledgement handling; no dirty buffer overwrite or new daemon.
  Keep existing Neovim behavior unchanged.
- Agent split: RPC/client worker and editor-integration worker; independent
  protocol validator. Decide supported Helix/plugin versions before coding.
- Promotion trigger: a decision to use Helix for regular hunk review.

## 7. Safe mutating-workflow isolation research

- Repositories: [pi-workflows](https://github.com/Attamusc/pi-workflows) and dotfiles.
- Complexity: very high / research. Payoff: potentially high; success uncertain.
- Basis: [workflow dispositions](pi-workflows.md) deliberately defer
  `diagnose-and-fix` and `portability-phase`. Mutable jj identities and faithful
  tree materialization prevent a guarantee that reviewed bytes equal integrated
  bytes. Existing isolation tests do not override those recorded blockers.
- First slice: a disposable adversarial proof or a documented no-go. Define one
  immutable candidate-to-integration contract before attempting orchestration.
  Inventory current Git/jj behavior and existing `src/isolation.ts` and tests;
  do not add a second generic VCS serializer by default.
- Acceptance: demonstrate reviewed-byte identity and complete relevant tree
  capture under concurrent mutation, dirty/untracked state, symlinks, modes,
  deletions and failure/cleanup paths. Preserve ignored private local state.
  Independent validation is mandatory; inability to prove a case is a blocker.
- Limits: no production integration, workflow activation, automatic commits/pushes,
  relaxed approval rules, alternate multiplexer or new lifecycle manager.
- Promotion trigger: a concrete need for a deferred workflow and willingness to
  fund a bounded research spike. Leave the workflows disabled in the meantime.
