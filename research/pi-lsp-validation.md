# pi-lsp first-tranche validation

Date: 2026-09-08. This record separates observed results from pending gates.

## Baseline (before package integration)

| Command | Exit | Observed result |
|---|---:|---|
| `scripts/check-portability.sh` | 0 | All checks passed, including isolated Darwin/Linux JSON and shell renders, Herdr-only configuration, package pins, and fresh Fedora zsh startup |
| `npm --prefix dot_pi/agent test` | 1 | 15 tests: 14 passed, 1 failed. Existing test at `test/configuration.test.mjs:154` reads missing `dot_config/opencode/opencode.jsonc`; public config has moved to templated composition |
| `python3 scripts/protected-local-state.py compare --before /tmp/pi-lsp-protected-before.json --after /tmp/pi-lsp-protected-after-baseline.json` | 0 | All four protected ignored/local roots unchanged |

Raw local baseline logs: `/tmp/pi-lsp-portability-baseline.log` and
`/tmp/pi-lsp-config-baseline.log`. They are temporary supporting evidence, not
portable repository artifacts. The unrelated stale config test was not changed.

## Initial package pass (not release-ready)

Standalone source: `~/projects/github.com/Attamusc/pi-lsp`.
Reviewed local commit: `22a4ece9a673d6db00fbba3f8c162cc62c073397` (`0.1.0`).
No remote repository, release, or shared package pin has been published.

| Command / check | Exit | Observed result |
|---|---:|---|
| `npm test` in package checkout | 0 | 3 tests passed; initial suite did not cover the lifecycle claims |
| `npm run typecheck` | 0 | TypeScript check passed |
| `npm run pack:check` | 0 | Dry-run tarball contained 5 intended files; not a production-install test |
| `node /tmp/pi-lsp-load.mjs` | 0 | Actual installed Pi 0.85.1 `DefaultResourceLoader`, in-memory package settings and temporary cwd/agentDir: no loader errors, one extension with one `lsp` tool |
| `node --import tsx /tmp/pi-lsp-repro.ts` | 0 | Diagnostic probe reproduced two defects: cap-before-sort returned line 3 instead of line 1; an already-aborted request incorrectly succeeded |

The diagnostic probe exits zero after printing observations; it is not a passing
correctness test. Revisions and regression tests are required before release.
The initial definition test queried an import alias and expected its own location;
a cross-file call-site assertion is required to prove useful definition resolution.

## Hardened local candidate

Parent-run verification after the implementation revisions:

| Check | Exit | Observed result |
|---|---:|---|
| `npm test` in standalone checkout | 0 | 27 tests passed, 0 failures |
| `npm run typecheck` | 0 | Passed against the Pi 0.85.1 development API |
| `npm run pack:check` | 0 | Seven intended runtime/package files; test tools excluded |
| Clean production tarball install/load (inside test suite) | 0 | Actual Pi loader succeeds; no packaged tests, TypeScript, TS language server, or tsx |
| Original diagnostic probe | 0 | Sorted prefix now starts at line 1; pre-aborted request rejects |
| Explicit missing-server Pi CLI smoke | 0 | `lsp` emits `isError: true`, `classification: missing_server`, 162-byte error content and matching metrics; subsequent ordinary `read` succeeds |
| `scripts/check-portability.sh` | 0 | Existing package composition and Darwin/Linux rendering pass |
| Protected-state comparison | 0 | All four roots unchanged |

Lifecycle assertions cover PID reuse, crash/restart, initialization and request
cancellation, a shared startup/request deadline, timeout recovery without late
cleanup killing its replacement, concurrent-call rejection, stop during startup
and filesystem work, idempotent stop, and SIGKILL escalation for a stubborn child.
Additional regressions verify a configurable deadline, preservation of healthy
servers after validation/result-limit errors, actionable scan filesystem errors,
rejection of outside-workspace paths/symlinks before spawning, and digest-based
restart for metadata-preserving edits. `PI_LSP_TIMEOUT_MS` defaults to 10,000 ms
and accepts explicit budgets up to 120,000 ms; slow projects no longer have an
unconfigurable cold-start cutoff. Open-document state stores hashes, not full
source copies.

Protocol tests check the top-level automatic-typing-acquisition option, UTF-16,
React language IDs, rejected workspace edits, malformed results, and limits.
Real-server tests verify TS/JS cross-file definitions/references, producer edits
queried through consumers, added/removed references, cwd/root path round-trips,
and emoji coordinates.

The missing-server smoke is an explicit integration test, separate from the
unprompted tool-selection experiment below. Local event log:
`/tmp/pi-lsp-missing-server-smoke.jsonl`.

## Natural-selection observation

A paired **synthetic** navigation task used the same Pi 0.85.1 CLI,
`github-copilot/gpt-5.6-sol`, low thinking, prompt, read/bash tools, and fixed
fixture. Skills, personal context, other extensions, and startup network work
were disabled. The enabled run added only the local package and `lsp` tool;
the test-only server binaries were supplied through PATH. Neither prompt named
LSP or told the model which tool to use.

Prompt:

> Find every call site of lookupPolicy exported from src/policies.ts. For each,
> give the file and line and explain whether/how it uses the return value.
> Exclude unrelated functions with the same name. Do not edit files. Give a
> concise answer with evidence.

The fixture has four call sites: direct result consumption in `authorize.ts:3`,
a discarded result in `metrics.ts:3`, an import alias returned unchanged in
`preview.ts:2`, and consumption through a re-export in `feature.ts:2`. A same-name
local function in `shadow.ts` is excluded; `index.ts` is a re-export, not a call.
Both answers identified all four and classified their result use correctly.

| Mode | Bash | Read | LSP | Wall time | Answer |
|---|---:|---:|---:|---:|---|
| Baseline | 2 | 5 | 0 | 11.69 s | Correct |
| LSP enabled | 1 | 6 | 1 | 14.75 s | Correct |

The model chose `references` without prompting: 12 locations, 632 response bytes,
354 ms tool duration, `status: ok`, contract version 1, no truncation. It then
used source reads to distinguish imports/re-exports from call sites.

**Conclusion:** one observation of natural tool adoption, not evidence of better
task performance. The enabled run used one more tool call and took longer. This
small task was already solvable correctly with ordinary Pi. Real-code tasks,
repetition, controlled cold/warm runs, and failure-rate measurement remain future
work; neither runtime difference nor superiority is established by this pair.

Local reproducibility artifacts: `/tmp/pi-lsp-evaluate.py`,
`/tmp/pi-lsp-navigation-evaluation`, and
`/tmp/pi-lsp-eval-{baseline,lsp}-summary.json` plus CLI event logs. These temporary
artifacts are not a durable benchmark suite.

## Independent review

The initial contract review failed; its blockers were corrected rather than
waived. Final source review and focused close-out both passed. The close-out
verified selective server disposal, configurable cold-start deadline, filesystem
error classification, canonical workspace containment, and digest-only document
state against code, README, regression tests, and Pi 0.85.1's event semantics.
No blocking findings remain.

One non-blocking diagnostic edge remains: a stream `EPIPE`/`ERR_STREAM_*` error
while opening a document can be classified as validation by the broad errno
mapping. Connection closure marks the generation dead and the next query
restarts it; this does not change navigation results but could mislead triage.
`clientInfo.version` must also be updated alongside the manifest at release time.
No compatibility code was added for hypothetical hosts that reuse an extension
after session shutdown; current Pi reconstructs it.

## Pending gates
- Interactive Pi reload smoke beyond the lifecycle hooks and package tests.
- Repository visibility decision, then publication and portable full-SHA pin.
- Post-pin portability check and protected-state comparison; the current
  documentation-only changes pass the existing portability contract.
- Representative real-code usefulness evaluation beyond the single synthetic
  natural-selection observation above.
- Real Fedora runtime and SSH detach/reattach remain untested by local rendering.
