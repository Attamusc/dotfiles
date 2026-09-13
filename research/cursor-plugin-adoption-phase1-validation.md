# Cursor Plugin Adoption Phase 1 Validation

**Date:** 2026-09-15
**Plan:** `.pi/plans/2026-09-12-cursor-plugin-adoption/plan.md`
**Scope:** Phase 1 verification bundle
**Status:** PASS — implementation, independent validation, and final review complete

## Environment and boundaries

- Managed `pi-interactive-subagents` revision: `fa7600194341071e722692da20f5e1f8d087c26d`
- Installed package revision: matches the managed revision
- Installed `scout` definition: `auto-exit: true`
- Multiplexer and lifecycle owner: Herdr through `pi-interactive-subagents`
- Mutation boundary: `control-cli` requires procedural human approval for every declared mutation. `command-safety` mechanically confirms or blocks its recognized destructive-command classes. Phase 1 does not claim universal executable mutation detection.
- Final validated implementation commit: `a02a3d20176a`
- Evidence contains no transcript body, credentials, environment dump, or external account identifier.

## Results

| Check | Command or interface | Exit/status | Evidence grade | Bounded evidence |
|---|---|---:|---|---|
| Skill contracts | `node --test dot_pi/agent/test/verification-skills.test.mjs` | 0 | measured | 34 passed, 0 failed |
| Pi-agent tests | `(cd dot_pi/agent && npm test)` | 0 | measured | 81 passed, 0 failed; Node emitted existing module-type performance warnings |
| Portability and rendered discovery | `scripts/check-portability.sh` | 0 | measured | macOS and Fedora renders passed; all five skills and provenance files present |
| Installed package pin | managed settings plus installed checkout | matched | measured | managed and installed revisions matched |
| Independent release gate | validator review | PASS | measured | 293/293 required replay outcomes matched; all 12 ISC-V1–V8 and ISC-X1–X4 criteria passed; `.pi/plans/2026-09-12-cursor-plugin-adoption/validation-release-decision.md` |
| Independent final review | reviewer replay | APPROVED | measured | 88/88 expected-span outcomes and 100/100 accumulated reviewer outcomes matched; no P0/P1 findings |
| Corrected live lifecycle | `subagent`, read-only scout with visible pane | completed | observed | run `645a43e3`; session identity `2026-09-15T11-03-18-690Z_645a43e3-91088e35-340b6d82-d3b3.jsonl`; returned `# Dotfiles`; owner delivered completion after closing the surface and releasing registration |

The portability run emitted sub-second archive timestamp warnings during the Linux render. The command completed successfully and reported `ok: portability checks passed`.

## Live-smoke correction

The initial bare interactive smoke, run `2cb2af5d`, returned the expected heading but remained open because normal assistant completion depended on the model calling `subagent_done`. The main session interrupted and then terminated that run; it is recorded as incomplete, not as passing evidence.

The user approved one corrected replacement. The procedure now verifies the installed package pin and launches `agent: "scout"` with `interactive: true` after confirming `auto-exit: true`. This keeps a visible Herdr pane while making normal agent completion the primary shutdown path. The corrected run completed in five seconds and produced the package-native correlated completion result.

## Contract assessment

| Criterion | Result | Evidence |
|---|---|---|
| ISC-V1 | pass | The bundled executable validator covers the strict YAML subset, resolved scalar limits, generic machine paths, exact fields, finite manual procedures, mutation conditions, evidence bounds, and valid/invalid fixtures. |
| ISC-V2 | pass | Definition-aware validation covers exact tables, every selected check and capability, evidence identities, unavailable-capability mapping, cleanup declarations, project-relative paths, and reasoned verdict consistency. Pass evidence uses a closed subject/predicate/value/polarity grammar with expected-relative trailing-prose boundaries. |
| ISC-V3 | pass | A pass requires measured or observed evidence; agent-reported and unverified claims cannot produce pass. |
| ISC-V4 | pass | Ordinary and interactive execution delegate to existing Pi/Herdr owners. |
| ISC-V5 | pass at the approved Phase 1 boundary | Procedural approval is mandatory for all declared mutations; executable policy covers recognized destructive classes. |
| ISC-V6 | pass | Corrected smoke produced owner-delivered completion after surface close and registration release. |
| ISC-V7 | pass | Structural tests require affected contracts and rollback scope in blast-radius output. |
| ISC-V8 | pass | The maintainer audit helper exercises concrete definitions and repository evidence for current, stale, missing, and ambiguous cases, including npm wrapper arguments and canonical repository containment. |
| ISC-X1 | pass | No pane manager, process supervisor, or status reporter was added. |
| ISC-X2 | pass | No standalone deslop skill or duplicate service wrapper was added. |
| ISC-X3 | pass | No transcript indexing or full-transcript forwarding was added. |
| ISC-X4 | pass | No cross-restart workflow execution-resume claim was added. |

## Limitations

- Phase 1 uses a bundled deterministic validator for artifacts but does not test general LLM compliance.
- Credential detection covers documented recognizable patterns; it does not prove arbitrary secret absence.
- Non-destructive mutation approval remains a human-in-the-loop procedural boundary rather than universal command classification.
- `pi-workflows`, session pickup, Glimpse review, and Advisor enforcement remain later-phase work.
- Runtime-native session records remain supporting evidence; this report does not duplicate them.
