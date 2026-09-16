# Cursor plugin adoption Phase 2 integrated validation

**Date:** 2026-09-16

**Candidate chain:** P2-1 `de13ab7e` → P2-2 `d39381c` → P2-3 `b3cdb791` → P2-4 `3da0b583` → integrated evidence `3914098d` → retained-tail evidence `821943d0`

**Verdict:** **RELEASED**

The implementation, synthetic evidence, installed-runtime differential, portability, provenance, and hygiene gates pass. Independent integrated review and validation both accepted `821943d0` with zero P0/P1 findings:

- Reviewer: **APPROVED** — `.pi/plans/2026-09-12-cursor-plugin-adoption/review-p2-5c-integrated-release-gate.md`
- Validator: **PASS** — `.pi/plans/2026-09-12-cursor-plugin-adoption/validation-p2-5c-integrated-release-gate.md`

## Installed contract and retained-tail decision

- Package version: `0.84.4`, read from installed `package.json`.
- Package root: `/home/attamusc/.local/share/mise/installs/npm-earendil-works-pi-coding-agent/0.84.4/node_modules/.mise/@earendil-works+pi-coding-agent@0.84.4/node_modules/@earendil-works/pi-coding-agent`.
- Installed `docs/session-format.md:234-248,322-342` describes the newer `retainedTail` checkpoint shape.
- Installed `dist/core/session-manager.d.ts:36-47,145-166` omits `retainedTail` and exposes the legacy JSONL replay functions.
- Installed public API `dist/index.js` resolves those legacy functions from `dist/core/session-manager.js:198-239`. The actual CLI bundle exports in `dist/bundle/index.js` resolve the same legacy behavior from `dist/bundle/chunks/chunk-OMWWHBTG.js:660`: `retainedTail` is ignored.
- The CLI bundle also embeds a distinct, unexported `*2` ordered-path subsystem at `dist/bundle/chunks/chunk-OMWWHBTG.js:842,947`. It supports retained tails, but is not the public JSONL API, is not exported by the CLI bundle index, and must not be treated as public/API behavior or copied into the reader.
- Direct synthetic imports of both `dist/index.js` and `dist/bundle/index.js` pin the public result: tail roles `user`, `assistant`, `toolResult`, and `custom` are ignored; first-kept, no-first-kept, repeated-compaction, and missing-boundary outputs follow the legacy contract exactly.

P2-AC2 therefore covers parity for supported public exported shapes. P2-AC3 is intentionally stricter: any selected-path `retainedTail` produces `unsupported-session-contract` before excerpts. The retained-tail reader fixtures remain outside the supported projection loop as a forward/docs guard. Review that decision only when public exported CLI/API behavior and package types implement compatible retained-tail semantics; then deliberately review the fixtures and contract rather than adding a fallback or copying the unexported subsystem.

## Executed evidence

All commands ran from the repository root. `PI_SDK_ROOT` was the installed package root above and `PYTHONDONTWRITEBYTECODE=1` was set for Node suites.

| Evidence | Exact command | Result |
|---|---|---|
| Installed full serial suite | `PI_SDK_ROOT="$SDK" PYTHONDONTWRITEBYTECODE=1 node --test --test-concurrency=1 dot_pi/agent/test/*.test.mjs` | 265 passed, 0 failed, 0 skipped |
| Focused reader/pickup/why/promotion | `PI_SDK_ROOT="$SDK" PYTHONDONTWRITEBYTECODE=1 node --test --test-concurrency=1 dot_pi/agent/test/session-reader-contract.test.mjs dot_pi/agent/test/knowledge-reconstruction.test.mjs dot_pi/agent/test/promotion-handshake.test.mjs` | 183 passed, 0 failed |
| Direct retained-tail differential | focused reader suite imports both installed `dist/index.js` and `dist/bundle/index.js`, with package version asserted as `0.84.4` | 4 shapes × 2 public export namespaces passed; all tail markers absent |
| Working portability | `bash scripts/check-portability.sh` | Darwin and Linux public rendering; Git includes; fresh Fedora zsh: pass |
| Fresh archive | `git archive HEAD \| tar -x -C "$archive"`; then the full installed serial command and `bash scripts/check-portability.sh` | 265 passed; portability passed |
| Syntax/diff | `git diff --check 3914098d..HEAD` | pass |
| Bytecode | `find "$archive/dot_pi/agent" -type f \( -name '*.pyc' -o -path '*/__pycache__/*' \)` | zero |
| Plan hygiene | `git check-ignore -v .pi/plans/2026-09-12-cursor-plugin-adoption/phase2-entry-gate.md`; `git ls-files .pi \| wc -l` | `.pi` ignored; zero tracked |
| Provenance | `sha256sum` over the three vendored artifacts | entity JSON `0155d7c…3218`; Marked ESM `43e1fc0…0d15`; MIT license `8e3a3f8…71ab9` |

The entity hash matches `dot_agents/skills/why/vendor/PROVENANCE.md`; its exact pinned CPython 3.13.7 regeneration command is exercised by the focused suite. Marked is pinned to 18.0.5, upstream commit `4063c638cb621c09091d41b26f323ff074416bb9`, with its MIT license retained.

## Acceptance matrix

| Contract | Status | Evidence |
|---|---|---|
| ISC-L1 | PASS | Reader/pickup fixture matrix, installed differential, branch/compaction/malformed/privacy/bounds cases; pickup imports the canonical reader rather than duplicating its parser. |
| ISC-L2 | PASS | Promotion matrix covers exact approval, destination recheck, races, decline/absence, taint, owner handoff, and exact result attestation. |
| ISC-X1 | PASS | Explicit path only; tests and static inspection show no discovery, latest-session lookup, index, search, or sibling access. |
| ISC-X3 | PASS | Protocol is read-only through handoff; durable writes remain owned by notekeeper/domain-modeling. |
| P2-AC1 | PASS | Committed session-reader fixtures cover linear, branch, compaction, malformed, privacy, retained-tail, and bound rows. |
| P2-AC2 | PASS | Canonical reader agrees with installed 0.84.4 public API and CLI bundle exports for supported public context shapes. Direct retained-tail controls pin the public legacy boundary without declaring that forward shape supported. |
| P2-AC3 | PASS | Selected retained-tail fails closed without excerpts as a strict product forward/docs guard. It is deliberately not public-runtime parity. |
| P2-AC4–AC11 | PASS | Why target cardinality, inference/report/history contracts, explicit contained path, ancestry, sibling isolation, and derived-summary labels pass their focused matrices. |
| P2-AC12–AC19 | PASS | Output bounds, privacy, taint rejection, approval binding, race rejection, owner attestation, synthetic-only transcript evidence, and read-only/no-discovery boundaries pass. |
| P2-AC20 | PASS | Phase 2 adds no process, pane, lifecycle, or status owner. |

## Trust, limitations, and decision

`why` trusts the invoking Pi/Node host runtime, startup/preloads/loader, OS permissions, and platform `/usr/bin/git`. Repository/history content, Git configuration and attributes, Git routing variables, caller `PATH`, and Git child environment are untrusted and constrained. It reads repository evidence only and has no session-reader import or session-path input.

`session-pickup` accepts one explicit contained JSONL path and is read-only. `promote.py` performs approval preparation and owner handoff only; notekeeper or domain-modeling owns durable mutation and exact-result attestation. Phase 2 adds no session discovery/index, live-transcript fixture, automatic durable write, runtime fallback, duplicate session parser, process/pane controller, lifecycle manager, or status reporter.

This host is Linux; macOS evidence is deterministic rendered configuration rather than execution on macOS hardware. Working-tree portability includes unrelated pre-existing edits to `scripts/check-portability.sh`; they are excluded from this candidate commit. The ignored Phase 2 gate and release-decision working notes carry the same corrected namespace distinction.

**Decision: RELEASED.** The technical, reviewer, and validator gates pass with zero P0/P1 findings. Phase 2 is complete.
