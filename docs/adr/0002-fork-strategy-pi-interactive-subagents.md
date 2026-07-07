# ADR-0002: Fork strategy for `pi-interactive-subagents` — `Attamusc` strict-superset of `HazAT`

**Status:** Accepted
**Date:** 2026-07-06
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-0001 (additive framing + rollback lane),
`.pi/plans/bbq-2026-07-06/grill/2026-07-06-cmux-herdr-lazyvim-helix.md` (D2, D4)

## Context

The pi multi-agent workflow depends on the `subagent` tool provided by an
extension package. Today, that slot in `.data/pi/agent/settings.json` is
occupied by `git:github.com/HazAT/pi-interactive-subagents` (v3.7.2 in the
existing local Attamusc fork base). To add herdr as a mux backend under
this extension while satisfying ADR-0001's additive/swap constraint, one of
three paths must be chosen:

- **H1. Fork HazAT ourselves as `Attamusc/pi-interactive-subagents`, add a
  targeted herdr backend.**
- **H2. Adopt `edxeth/pi-subagents` as the base and ignore its unused
  features.**
- **H3. Skip the fork entirely; use headless subagents when launched under
  herdr.**

Adversarial review (AR-1 objection O5) required this choice to be evidence-
backed rather than characterised. The evidence was gathered from the actual
source of each option on 2026-07-06 and is recorded here so the rationale
is dateable and re-inspectable.

## Decision

**Fork `HazAT/pi-interactive-subagents` as `Attamusc/pi-interactive-subagents`
(H1). Retain HazAT's cmux backend byte-for-byte from a user-observable
standpoint. Add a herdr backend as a targeted patch. Diverge freely
thereafter; no upstream-PR obligation.**

The fork is a **strict superset** of HazAT: existing behaviour under cmux
is preserved; new behaviour under herdr is additive and gated by
`PI_SUBAGENT_MUX` env detection (order:
`herdr → cmux → tmux → zellij → wezterm`).

Cherry-picking specific edxeth features (`mode: background`, orchestrator
mode, `allow-model-override`) is deferred to lived experience — no
pre-commitments in this ADR.

## Evidence (as of 2026-07-06)

**H1 — fork HazAT, DIY herdr backend (chosen).**
HazAT v3.7.2 is **6 files / 5,044 lines** with a flat `pi-extension/subagents/`
layout. Backend selection is a single `getMuxBackend()` switch in
`pi-extension/subagents/cmux.ts`:
- `process.env.PI_SUBAGENT_MUX` preference wins if set.
- Otherwise runtime-availability checks in detection order.

Adding herdr is mechanically:
1. New `isHerdrRuntimeAvailable()` gated on `HERDR_SOCKET_PATH` +
   `hasCommand("herdr")`.
2. Prepend `"herdr"` to the detection order.
3. One `muxSetupHint()` branch for herdr.
4. Pane-spawn / `pane.report_agent` wiring modelled on the existing cmux
   path.

Small, additive, testable against HazAT's existing suite (SG4).

**H2 — adopt edxeth as base, ignore unused features (rejected).**
`edxeth/pi-subagents` v2.5.2 is **71 files / 12,615 lines** — 12× the
file count and 2.5× the code of HazAT v3.7.2. It is a full architectural
rewrite:
- `src/mux/` (core / io / surfaces / runtime-probe abstraction)
- `src/launch/` (14 files: background / async axis, policy,
  context-boundary, interactive-sentinel)
- `src/tools/overlay/` (8-file overlay UI)

Its herdr backend is **632 lines** (`src/mux/herdr.ts` 524 +
`herdr-surfaces.ts` 108) that imports `defaultMuxRuntimeProbe` from
`./runtime-probe.ts` and is built on edxeth's bespoke mux-surface
abstraction — **not a cleanly liftable module.** The unused surface is not
opt-in frontmatter, it is the file structure the herdr code sits inside.
edxeth is on an independent version line (2.5.2) diverged from HazAT
(3.7.2) under a different package name, so adopt-and-ignore means
inheriting the entire rewrite as our rebase base and abandoning HazAT's
upstream line.

**H3 — skip subagents-under-herdr, use headless (rejected).**
Would eliminate SG4 entirely, but forfeits the visible parallel-subagent
workflow (watching agent panes) that is the stated reason for the whole
migration. Not compatible with the objective.

**Fork basis (user decision, 2026-07-07): fresh fork from latest
upstream.** The user chose a clean fork of `HazAT/pi-interactive-subagents`
at current upstream main (`c100577`, verified latest via `git ls-remote`
2026-07-07), **discarding** the pre-existing local `copilot-cli` commits
(`Sean Dunn`, 2026-05-21) that sat in
`/Users/attamusc/projects/pi-interactive-subagents`. No tiebreaker from
prior local work — that work is dropped; the fork starts clean from
upstream. The published fork + local checkout are created in Phase P3.
The user's existing 7 agent files run unchanged on the fork.

> **History note (2026-07-07):** an earlier draft claimed the Attamusc
> fork "already exists" as a decisive tiebreaker — an over-inference from
> a local checkout's `origin` config (the GitHub repo was never
> published). The user has since decided to discard that local
> copilot-cli work and fork fresh from upstream, so the tiebreaker is
> void. The load-bearing evidence (edxeth non-liftable, aphotic dead,
> ~79-line patch) carries the decision on its own.
>
> **Test-baseline consequence:** the 6 failing tests recorded in SG4 were
> measured on the *tainted* local checkout, whose copilot-cli commits
> modified `pi-extension/subagents/index.ts` (+129 lines) — the same
> tool-registration/discovery area those tests exercise. The clean-fork
> baseline must be re-measured in Phase P3 before the accept-vs-fix
> decision on pre-existing failures.

**Shepardizing.** `aphotic/pi-mux-subagents` confirmed "Repository not
found" via `git ls-remote` on 2026-07-06 — not a live option and not
considered.

## Strict-superset contract

The fork MUST satisfy the following for the ADR-0001 rollback lane to be
meaningful and for cmux-workflow continuity during the plan:

1. **`getMuxBackend()` returns `cmux` unchanged** when
   `PI_SUBAGENT_MUX` is unset AND `HERDR_SOCKET_PATH` is unset AND the
   cmux socket is reachable. No change to behaviour, error messages, or
   env-var handling relative to HazAT baseline.
2. **All existing cmux-path code is exercised** with the same call
   signatures. Adding herdr is by *new file(s)* + *new detection case* —
   not by rewriting shared plumbing.
3. **HazAT's existing test suite passes** on the fork (SG4). If the suite
   is not exercisable on this machine, an agreed smoke-check substitute is
   executed with user approval before ISC-5 is claimed.
4. **Zero-mux behaviour is byte-identical.** When no mux is detected, the
   `subagent` tool returns the HazAT-baseline error verbatim: `"Subagents
   require a supported terminal multiplexer. Start pi inside cmux (...),
   tmux (...), zellij (...), or WezTerm."` (Verified per grill D10 /
   AR-1 O2 against HazAT v3.7.2 `pi-extension/subagents/index.ts:1433` +
   `cmux.ts:82`.)

Any change that breaks any of these four points either lands as a follow-up
ADR that explicitly supersedes this one, or does not land.

## Rollback

`.data/pi/agent/settings.json` is strict JSON — no inline comments.
Rollback from the Attamusc fork back to HazAT is a version-control
operation: `jj log` / `git log` finds the pre-swap commit; the
`packages` array entry is restored to the verbatim snippet below.

**Verbatim restore snippet** — paste into the `packages` array in
`.data/pi/agent/settings.json`, replacing the Attamusc local-path entry:

```json
"git:github.com/HazAT/pi-interactive-subagents"
```

Rollback triggers (either sufficient):
- SG4's "patch grows unexpectedly" branch fires and scope-check with user
  concludes the fork is not viable.
- Regression under cmux (contract point 1, 2, or 4 above violated) is
  observed during Phase 4 coexistence smoke or later parallel run.

After rollback, `pi-herdr` may remain installed (it no-ops without a
herdr session) but the `subagent` tool reverts to HazAT-only behaviour.

## Consequences

**Positive:**
- Continues with a clean fork from upstream rather than proliferating branches or inheriting a rewrite.
- Fork surface is minimal and localised (per H1 evidence), so review /
  audit / rebase-from-HazAT is tractable.
- The rollback lane is a one-line paste from this ADR, not a
  from-memory reconstruction.

**Negative:**
- Upstream drift from HazAT is our problem alone; no PR obligation, but
  also no shared-maintenance benefit.
- Two mux-backend code paths (cmux + herdr) must coexist in the fork
  indefinitely — the cmux backend cannot be deleted while ADR-0001's
  rollback lane is in force.
- We forgo edxeth's `mode: background` and orchestrator features until
  cherry-picking is opened as a separate track.

**Neutral:**
- The fork installs from a local path (D3), so pre-publish iteration is
  possible without a GitHub push, matching the pi-cmux / pi-television
  pattern.

## Alternatives considered

- **H2 (adopt edxeth)**: rejected on 12× file-count / non-liftable
  herdr module / abandonment of HazAT line.
  See Evidence §H2 above.
- **H3 (headless-only under herdr)**: rejected — forfeits the visible
  agent-pane workflow.

## References

- Grill artifact: `.pi/plans/bbq-2026-07-06/grill/2026-07-06-cmux-herdr-lazyvim-helix.md`
  (D2, D3, D4, D10)
- AR-1 objection O5 (evidence demand):
  `~/.pi/agent/reviews/bbq-cmux-herdr-helix-decisions-2026-07-06T23-34-14Z.md`
- AR-1 re-review confirming evidence:
  `~/.pi/agent/reviews/bbq-cmux-herdr-helix-decisions-re-review-2026-07-07T00-15-00Z.md`
- Existing Attamusc fork: `/Users/attamusc/projects/pi-interactive-subagents`
