# Phase 5 evidence

## Stage 0 — exact package gate

**Verdict: PASS** (2026-09-19). The exact candidate passed the managed Node 24 check and the isolated Node 25 full and focused checks. No live Pi smoke was run.

### Candidate and isolation

- Source checkout: `/home/attamusc/projects/github.com/attamusc/pi-workflows`
- Required and observed `git rev-parse HEAD`: `b177118aa9b1bc3e966db61c5c69719c9fac7869`
- Checkout status was not clean (`?? context.md`), so it was not used as the test tree.
- Two disposable exports were made with `git -C "$PKG" archive "$PIN" | tar -x -C "$TEST_ROOT"`: `/tmp/pi-workflows-node24.jE7KLg` and `/tmp/pi-workflows-node25.fcVUE8`.
- The managed runtime remained Node `v24.19.0`, npm `11.17.0`; `mise current node` remained `24.19.0` after testing.
- The isolated runtime was Node `v25.9.0`, npm `11.12.1`, installed/run with `mise x node@25 -- …`.

### Commands and measured results

| Runtime | Command | Exit | Tests | Pass | Fail | Skip |
|---|---|---:|---:|---:|---:|---:|
| Node 24 | guarded runner identity check + `npm ci` | 0 | — | — | — | — |
| Node 24 | guarded runner default `npm run check` | 0 | 358 | 351 | 0 | 7 |
| Node 25 | Node 25 guarded runner identity check + `npm ci` | 0 | — | — | — | — |
| Node 25 | Node 25 guarded runner default `npm run check` | 0 | 358 | 358 | 0 | 0 |
| Node 25 | guarded runner focused contract set | 0 | 149 | 149 | 0 | 0 |

The guarded runner default `npm run check` resolved to `npm run typecheck && npm run test`; the package scripts use `tsc --noEmit` and `node --test tests/unit/*.test.ts`. Both installs added 270 packages, audited 271, and reported 0 vulnerabilities. Node 24 emitted npm `allow-scripts` warnings for six dependency install scripts; this was not a test failure. Node 25 emitted a skipped-integrity-check warning for the pinned Git dependency; this was not a test failure.

### Bounded skip and execution evidence

All seven Node 24 skips were the expected Node-25 permission-runtime cases:

1. `sandbox denies fs.readFileSync with ERR_ACCESS_DENIED`
2. `sandbox denies fs.writeFileSync with ERR_ACCESS_DENIED`
3. `sandbox denies child_process.spawnSync with ERR_ACCESS_DENIED`
4. `sandbox denies worker_threads.Worker with ERR_ACCESS_DENIED`
5. `sandbox denies net.createConnection with ERR_ACCESS_DENIED`
6. `sandbox: process.permission.has() reports denials correctly`
7. `sandbox always uses external Node process (not in-process jiti or eval)`

Under Node 25 those tests executed and passed; the focused run had zero skips. It also executed and passed all three real lifecycle cases: explicit grant through `agent_end`, shutdown cancellation/suppression of automatic follow-up, and automatic completion across compaction. There were no failure excerpts to record.

### Package identity, registration, and API

At the tested revision, `package.json` records:

- name/version: `pi-workflows` / `0.1.0`;
- Pi extension registration: `pi.extensions = ["./src/index.ts"]`;
- root type/import export: `./src/api.ts`;
- exact `pi-agent-execution` dependency pin: `git+https://github.com/Attamusc/pi-agent-execution.git#091fada20c05470af558a5a121932e43186b8144`.

The full typecheck and focused API/contract tests passed against these exported sources.

### Contract evidence at the tested revision

Paths below are relative to the archived candidate.

- **Exact-hash trust:** `src/trust.ts:146-160` compares the complete composite trust key and rejects approvals without an absolute canonical path and a full 64-hex SHA-256 hash. `tests/unit/trust.test.ts` passed.
- **Project trust and saved discovery:** `src/saved.ts:80-117` canonicalizes discovered scripts, hashes their contents, gates project scanning on `projectTrusted`, and always scans the user directory. `tests/unit/project-trust.integration.test.ts` and the independence cases at `tests/unit/phase5.test.ts:553-637` passed.
- **Explicit/automatic authorization:** `src/model-invocation.ts:132-194` creates one-request grants, permits one automatic run, and consumes each explicitly selected workflow once. Authorization matrix tests at `tests/unit/phase5.test.ts:101-221` and the real lifecycle tests passed.
- **Persistence and trace:** `src/persistence.ts:89-100` tracks `run_start` and synchronously appends JSONL events so terminal `run_end` is not lost. `src/runtime.ts:98-261` emits start/end events and performs terminal cleanup. `tests/unit/persistence.test.ts`, `tests/unit/runtime.test.ts`, and lifecycle integration tests passed.
- **Cleanup:** `src/runtime.ts:243-250` removes the private temporary directory in `finally`; `src/context.ts:338-342` exposes isolation cleanup. The real cleanup assertions in `tests/unit/isolation.integration.test.ts:86-135` and leak check in `tests/unit/runtime.test.ts:274-279` passed.
- **Recursion suppression:** `src/index.ts:10-20` suppresses workflow registration above depth zero; `src/runner.ts:36,144,297` increments `PI_WORKFLOWS_DEPTH` for child processes. Propagation tests at `tests/unit/phase5.test.ts:389-528` passed.
- **No dynamic in-process fallback:** `src/runtime.ts:160-175` routes dynamic source only to the external permission sandbox and explicitly forbids jiti/script-path fallback; `src/sandbox.ts:412-464` starts external Node. The Node 25 test `sandbox always uses external Node process (not in-process jiti or eval)` executed and passed.
- **Real Pi lifecycle/trace handling:** `tests/unit/pi-invocation-lifecycle.integration.test.ts:62-304` exercises real Pi extension lifecycle, shutdown, follow-up, and compaction behavior; all three cases executed and passed under Node 25.

No chezmoi settings, managed workflows, package source, trust state, managed Node default, or runtime configuration was changed during this gate.

## Stage 2 — synthetic dogfood

**Measured 2026-09-19.** A detached disposable worktree at exact revision `b177118aa9b1bc3e966db61c5c69719c9fac7869` was identity-checked and installed by the guarded runner; neither the managed package list nor Node default changed.

- Exact-candidate focused harness (`PI_WORKFLOWS_CANDIDATE=<disposable> node --test dot_pi/agent/test/pi-workflows-phase-5.test.mjs`): exit 0, 10/10 pass, 0 skip. The harness now requires both an explicit candidate and that candidate's compiler; an ordinary suite without the input records an explicit skip rather than claiming API compatibility.
- Isolated Node 25 package denial (guarded runner focused test): exit 0, 7/7 pass, 0 skip. This executed filesystem read/write, child process, worker, network, permission-query, and external-process/no-fallback denial cases. Managed Node remained Node 24.
- Focused iterate-pr, PR canvas, and Phase 4 command: exit 0, 24/24 pass.
- Full managed Node suite (`cd dot_pi/agent && npm test`): exit 0, 300 tests, 296 pass, 0 fail, 4 documented environment-dependent skips. Its Phase 5 API case skipped because the full-suite command intentionally supplies no candidate; the separate exact-candidate run above passed with zero skip.
- Portability (`bash scripts/check-portability.sh`): first run correctly rejected an untracked Python `__pycache__` produced by the full suite. After deleting that generated fixture artifact, rerun exited 0 and reported public JSON, Darwin/Linux rendering, shell syntax, Git include behavior, Fedora startup, and portability PASS. No standalone parity script exists; parity is exercised by this Darwin/Linux render gate.
- Whitespace (`git diff --check`): exit 0. `jj diff --check` is unsupported by installed jj and exited 2; no whitespace defect was reported by the Git gate.

The earlier statement above described fixture intent more broadly than the executable assertions then established. It is superseded by the remediation measurements below.

### Stage 2 remediation (2026-09-19)

- Exact-candidate focused harness against detached revision `b177118aa9b1bc3e966db61c5c69719c9fac7869`, using its installed compiler: exit 0, 18/18 pass, 0 skip. The adapter throws the package's real `BudgetExceededError` before the next launch and asserts a partial usage-bearing report and no synthesis/orphan launch. The seven read-only workflows execute over the bounded fixture; assertions cover semantic supported/unverifiable citation results, malformed transcript bytes remaining inert, traversal/symlink rejection, bounded calls, and a byte digest of all fixture and Git metadata before/after.
- Disposable mutation fixtures: the focused harness executed portability in Git and colocated jj for denial and approved integration-conflict reports, cleanup, protected-path rejection, and added-line whitespace rejection. Diagnose-and-fix executed isolated Git denial and jj approval/drift rejection, exact diff review, non-exact review rejection, unchanged invoking status, and cleanup. These are fake package-capability boundaries; they do not claim a live package integration.
- Isolated Node 25 exact-package dynamic contract (`mise x node@25 -- node --test dot_pi/agent/test/pi-workflows-dynamic-node25.test.mjs`): exit 0, 2/2 pass, 0 skip. One minimal read-only dynamic source succeeded; undeclared `/etc/hosts` access returned `ERR_ACCESS_DENIED`; `require` and `askAgent` were absent; forbidden fallback bridge calls remained zero.
- Fake PR boundary: the focused harness and dedicated iterate/PR-canvas/Phase-4 run established approval-before-spawn, denial, green, blocked, failure, finite pass limits, and no restart/automatic claim. Dedicated run: exit 0, 27/27 pass, 0 skip.
- Full managed suite (`cd dot_pi/agent && npm test`): exit 0, 306 tests, 301 pass, 0 fail, 5 explicit environment skips. The package script now sets `PYTHONDONTWRITEBYTECODE=1`; the immediately following portability run passed without manual cleanup and `find . -type d -name __pycache__` returned no paths.
- Portability (`bash scripts/check-portability.sh`): exit 0, ending `ok: portability checks passed`. Git whitespace check exited 0. The managed pin remained in source but was not applied. No live Pi, network, trust-store, package-runtime, or managed Node change ran.

### Final dogfood remediation (2026-09-19)

- Exact-candidate focused harness: exit 0, 18/18 pass, 0 skip. The executable adapter removes discovered isolation directories; denial, validation rejection, review drift, integration conflict, and success paths assert filesystem nonexistence after cleanup.
- Portability workflow boundary: disposable Git and colocated-jj fixtures both executed approved success with exact `portable.txt` bytes, denial, and post-review drift rejection. Git additionally executed protected tracked-path, added-line whitespace, conflict-marker, invoking-repository ignored/local-state mutation, and integration-conflict rejection. Rejections occurred before integration except the deliberately conflicted integration case.
- Read-only semantic reports: deep-review, investigate, jungle-book, and resume-status now assert workflow-specific expected report content; the existing report-validate, verify-claims, and mine-workflows assertions remain.
- Diagnose-and-fix: Git verification/review reads the captured commit bytes while ignoring mutable worktree bytes; Git denial, Git captured review rejection, and jj drift rejection all assert isolation directory removal.
- Isolated Node 25 dynamic contract: exit 0, 2/2 pass, 0 skip. Exact candidate success and undeclared-access denial ran with zero fallback calls.
- Full managed suite: exit 0, 306 tests, 301 pass, 0 fail, 5 explicit environment skips. The immediately following portability command exited 0 with `ok: portability checks passed`; `git diff --check` exited 0.
- No apply, live Pi, network, trust-store, package-runtime, or managed Node mutation ran. The todo remains open pending independent gates.

## Stage 3 — managed pin and rendering contracts

**Measured 2026-09-19.** The exact public package pin was added once. The existing setup hook required no change: it is already content-addressed to both public and private settings, runs `pi update --extensions` before `herdr integration install pi`, and exposes failures.

- Source JSON and current-host rendered settings exact-pin assertions: exit 0; the 40-character pin occurred once in each.
- Exact-candidate focused Phase 5/API/dogfood (`PI_WORKFLOWS_CANDIDATE=/tmp/pi-workflows-stage2.hxi2rL node --test dot_pi/agent/test/pi-workflows-phase-5.test.mjs`): exit 0, 11/11 pass, 0 skip. The candidate was the previously installed disposable archive at revision `b177118aa9b1bc3e966db61c5c69719c9fac7869`; no install ran in this stage.
- Phase 4 guidance (`cd dot_pi/agent && node --test test/phase-4-guidance.test.mjs`): exit 0, 4/4 pass.
- Full managed Node suite (`cd dot_pi/agent && npm test`): exit 0, 301 tests, 297 pass, 0 fail, 4 documented environment-dependent skips. The exact API case is separately covered by the focused zero-skip run.
- Portability (`bash scripts/check-portability.sh`): exit 0. It rendered macOS and Fedora 44 settings and setup scripts, checked public-first private package overlay order, full Attamusc development pins, exact package uniqueness, content-addressed reconciliation, Herdr install order, unaffected managed rendering, and absence of local/symlink duplicates, fallback configuration, duplicate lifecycle/status ownership, and suppressed-error fallback.
- Whitespace (`git diff --check`): exit 0.

Documentation now records trusted saved-code versus dynamic sandbox boundaries, managed Node 24 behavior, all ten dispositions, mutation gates, direct-skill independence, audit-only JSONL/checkpoints, and the pending user-only fresh-terminal activation. No `chezmoi apply`, Pi update/list/reload/startup, `/workflows`, live smoke, trust change, package install, or Node upgrade ran.

## Safe workflow-set remediation — 2026-09-19

This section supersedes earlier ten-workflow and two-automatic-workflow measurements.
Current-package evidence defers `diagnose-and-fix` and `portability-phase`: mutable jj
identities and incomplete captured-tree materialization prevent proof that reviewed
bytes equal integrated bytes without building a second VCS serializer. Their direct
alternatives are the `diagnosing-bugs` skill and `scripts/check-portability.sh` plus
the normal review/commit workflow.

Discovery now contains eight retained workflows. `report-validate` is the sole
automatic workflow and uses only inert filesystem containment discovery; VCS status
is explicitly unavailable. `resume-status` is explicit. Hostile `core.fsmonitor` and
filter marker regressions prove automatic validation executes neither configured
program. No retained workflow calls `isolate`, `integrate`, or `cleanupIsolation`.

Exact-package harnesses now reject dirty or untracked checkouts, require either a
clean detached exact revision or an exact-revision-marked archive, and require the
candidate-owned compiler. Measurements for this remediation are recorded below after
running from a disposable archive; activation, trust, install, reload, and live smoke
remain pending.

Measured results:

- Exact archived Phase 5 API/security/dogfood: 16/16 pass, 0 skip.
- Exact archived Node 25 dynamic contract: 2/2 pass, 0 skip.
- Focused iterate/PR-canvas/Phase 4: 27/27 pass, 0 skip.
- Managed full suite: 304 tests, 299 pass, 0 fail, 5 documented environment skips.
- Immediate portability/render gate: pass on Darwin and Fedora render fixtures.
- `git diff --check`: pass.

## Final exact-candidate remediation — 2026-09-19

This section supersedes every earlier archive/marker candidate claim and command.
Marker self-attestation is rejected. All API, dynamic, and package harnesses now
require a real detached Git worktree at full `HEAD`
`b177118aa9b1bc3e966db61c5c69719c9fac7869`, an empty tracked/untracked
non-ignored status, and a candidate-local compiler. Ignored candidate-local
`node_modules` from `npm ci` is permitted. Regressions reject a forged marker-only
directory, modified tracked `src/api.ts`, and an unexpected untracked source file.

The measured candidate was created without changing the source checkout:

```sh
TEST_ROOT=$(mktemp -d)
rmdir "$TEST_ROOT"
git -C "$PKG" worktree add --detach "$TEST_ROOT" "$PIN"
node scripts/check-pi-workflows-package.mjs \
  --candidate "$TEST_ROOT" --revision "$PIN"
PI_WORKFLOWS_CANDIDATE="$TEST_ROOT" node --test dot_pi/agent/test/pi-workflows-phase-5.test.mjs
PI_WORKFLOWS_CANDIDATE="$TEST_ROOT" mise x node@25 -- node --test dot_pi/agent/test/pi-workflows-dynamic-node25.test.mjs
```

Measurements are recorded after the final run below. The eight-workflow safe set,
unapplied package pin, and pending user-only activation/live smoke remain unchanged.

Final measurements:

- Detached exact-candidate Phase 5/API/security: 17/17 pass, 0 skip.
- Detached exact-candidate Node 25 dynamic: 2/2 pass, 0 skip.
- Focused iterate/PR-canvas/Phase 4: 27/27 pass, 0 skip.
- Managed full suite: 305 tests, 300 pass, 0 fail, 5 documented environment skips.
- Portability/rendering: pass for Darwin and Fedora fixtures.
- Whitespace: `git diff --check` pass.

## Guarded package full-check remediation — 2026-09-19

This section supersedes all earlier unguarded Stage 0 package commands. The new
runner verifies detached exact identity and clean non-ignored status before
`npm ci`, then requires candidate-local compiler/dependencies, prepends the
candidate `node_modules/.bin` to `PATH`, and only then executes the requested
package check. A regression proves an external-only compiler is rejected after
install and before the check command executes.

Measured results from disposable detached worktrees:

- Guarded Node 24 full package check: 358 tests, 351 pass, 0 fail, 7 expected permission-runtime skips.
- Guarded Node 25 full package check: 358/358 pass, 0 skip.
- Guarded Node 25 focused package contract set: 149/149 pass, 0 skip.
- Exact-candidate Phase 5/API/security: 18/18 pass, 0 skip.
- Exact-candidate Node 25 dynamic: 2/2 pass, 0 skip.
- Managed full suite: 306 tests, 301 pass, 0 fail, 5 documented environment skips.
- Portability/rendering: pass for Darwin and Fedora fixtures.
- Full-range whitespace (`git diff --check 169cc0c..HEAD`) and working diff whitespace: pass.

## Pre-activation independent gates — 2026-09-19

Reviewed implementation through `d2a3c3ed1e6471959fbd3221a22d2f018ba56779`, including whitespace-only follow-up `b39555f2`:

- Independent source review: P0=0, P1=0, P2=0; `VERDICT: APPROVED`.
- Independent integration validation: P0=0, P1=0, P2=0; `VALIDATION: PASS`.
- Activation permission: granted only for the user-run Stage 5 fresh-terminal checklist.
- The managed pin remained unapplied during both gates; no package install/update, Pi reload/start, trust mutation, or live workflow run occurred.
- Validation report: `validation-phase-5-release-signoff.md`.

## Live-smoke remediation and repin — 2026-09-20

The first managed activation at `b177118aa9b1bc3e966db61c5c69719c9fac7869`
passed startup and tool registration but exposed a runner defect: a workflow
spawned from an ordinary Node script treated that script as the Pi CLI and
recursively relaunched it. The installed package was removed from the target
settings while the fix was prepared; the chezmoi source remained the authority.

The package fix makes generic Node or Bun self-spawn only when the real entry
script's nearest package manifest names `@earendil-works/pi-coding-agent` and
maps its declared `pi` binary to that exact real script. Arbitrary scripts,
name-only lookalikes, mismatched binary declarations, and Bun virtual paths use
`pi` from `PATH`; compiled Pi executables continue to self-spawn. Eight focused
invocation regressions cover those boundaries. The initial fix commit
`e39cf3c556ebb11b0d29611fb34b2909ba65808b` was superseded before publication
because upstream `main` advanced. The first rebased fix `6b3a730a9ad750fda37940f25a8bdd5b2df8d701`
was strengthened after adversarial validation. A second review rejected npm's
string-form `bin` because it does not explicitly declare a `pi` command. The
final fix accepts only an own object-form `bin.pi` mapping and is applied over
upstream task-outcome commit `cd5fa8f21b19ab1759f0862d85e3bd872c3e3cf6`
as exact revision `1614faf29c6ad1d0fcc9fe6db86a770f34e2b129`.

Measured against a clean detached worktree at the final revision:

- Guarded Node 24 package check: 386 tests, 379 pass, 0 fail, 7 expected Node-25 permission skips.
- The same guarded check inherited `PI_WORKFLOWS_DEPTH=1` and still produced 379 pass, 0 fail, 7 skips because the runner now clears inherited workflow depth before executing candidate checks.
- Guarded Node 25 package check: 386/386 pass, 0 skip.
- Exact-candidate Phase 5/API/security: 19/19 pass, 0 skip.
- Exact-candidate Node 25 dynamic: 2/2 pass, 0 skip.
- Managed full suite without an exact candidate (`cd dot_pi/agent && npm test`): 307 tests, 302 pass, 0 fail, 5 documented environment/candidate skips.
- Managed full suite with `PI_WORKFLOWS_CANDIDATE` set to the exact detached candidate: 321 tests, 317 pass, 0 fail, 4 documented environment skips.
- Portability/rendering and working-copy whitespace: pass.
- A stale assertion that the package API itself must not expose task outcomes was replaced with the intended activation boundary: none of the eight retained workflows opts into package isolation, integration, or task outcomes.
- Fresh remote identity check: GitHub `refs/heads/main` resolves exactly to `1614faf29c6ad1d0fcc9fe6db86a770f34e2b129`.

Final independent remediation gates used fresh, extension-disabled review contexts
because the configured Anthropic seats were quota-blocked:

- Reviewer (`openai-codex/gpt-5.6-sol`): P0=0, P1=0, P2=0; `VERDICT: APPROVED`.
- Integration validator (`openai-codex/gpt-5.6-terra`): P0=0, P1=0, P2=0; `VALIDATION: PASS`.

The user applied the final pin from a fresh terminal; `pi list` resolved the exact
Git package and managed install path. Static command-name comparison then
confirmed the reported duplicate `deep-review` registration: both a prompt
template and retained workflow owned that stem. The prompt is renamed to
`deep-code-review`, the workflow remains `/deep-review`, and a regression now
requires prompt and workflow command sets to be disjoint. A second apply plus
fresh-terminal runtime, abort, timeout, cleanup, and command-discovery smoke
tests remain required before Phase 5 closes.
