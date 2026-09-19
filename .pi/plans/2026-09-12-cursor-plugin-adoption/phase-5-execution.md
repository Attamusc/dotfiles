# Phase 5 Execution — `pi-workflows` Wiring and Dogfood

**Date:** 2026-09-19
**Status:** Ready for implementation
**Package source:** `/home/attamusc/projects/github.com/attamusc/pi-workflows`
**Required revision:** `1614faf29c6ad1d0fcc9fe6db86a770f34e2b129`

## Objective and rollout boundary

Activate the pinned package only after its current contracts and the eight retained managed workflows pass static, synthetic, rendering, review, and integration gates. The first rollout enables trusted saved workflows. The managed host currently runs Node 24, so dynamic `$workflow` remains unavailable unless the package proves an absolute Node 25+ permission runtime at startup; there is no fallback runtime and no need to upgrade the managed host merely to activate saved workflows.

Phase 1 direct skills remain independently usable when the package is absent or disabled. JSONL and checkpoints are audit/reconstruction evidence only; no workflow or documentation may claim cross-restart execution resume. Herdr and the existing Pi integration remain the only pane, lifecycle, session-identity, and status owners.

## Stage 0 — Verify the exact package before changing chezmoi

**Owner:** automated worker in a disposable detached package worktree; no settings/workflow edits.
**Gate:** required before any Phase 5 source mutation.

1. Record `git rev-parse HEAD` and require the exact revision above. Never test from the dirty source checkout. Create a real detached worktree, then install dependencies inside that disposable candidate (`node_modules` is ignored):

```sh
PIN=1614faf29c6ad1d0fcc9fe6db86a770f34e2b129
PKG=/home/attamusc/projects/github.com/attamusc/pi-workflows
TEST_ROOT=$(mktemp -d)
rmdir "$TEST_ROOT"
git -C "$PKG" worktree add --detach "$TEST_ROOT" "$PIN"
node scripts/check-pi-workflows-package.mjs \
  --candidate "$TEST_ROOT" --revision "$PIN"
```

The guarded runner verifies the full `HEAD`, detached state, and empty tracked/untracked non-ignored status before `npm ci`. Only after installation does it require the candidate-local compiler/dependencies and prepend the candidate's `node_modules/.bin` to `PATH` for the check. Marker-only archives and external-only compilers are rejected.

2. Under the current managed Node 24 runtime, use the guarded runner's default `npm run check`. Record all skips; Node-25-only sandbox-denial tests are expected to skip, not silently pass.
3. In a second disposable detached worktree, invoke the same runner through isolated Node 25 and require the real permission-sandbox denial tests to execute. This may populate the mise tool cache but must not change the managed default from Node 24. Run the focused contract set through the guard as well:

```sh
mise x node@25 -- node scripts/check-pi-workflows-package.mjs \
  --candidate "$TEST_ROOT_25" --revision "$PIN"
mise x node@25 -- node scripts/check-pi-workflows-package.mjs \
  --candidate "$TEST_ROOT_25" --revision "$PIN" -- node --test \
  tests/unit/trust.test.ts \
  tests/unit/saved.test.ts \
  tests/unit/model-invocation.test.ts \
  tests/unit/capabilities.test.ts \
  tests/unit/persistence.test.ts \
  tests/unit/runner.test.ts \
  tests/unit/runtime.test.ts \
  tests/unit/project-trust.integration.test.ts \
  tests/unit/sandbox-denial.integration.test.ts \
  tests/unit/isolation.integration.test.ts \
  tests/unit/pi-invocation-lifecycle.integration.test.ts \
  tests/unit/phase7-integration.test.ts \
  tests/unit/phase5.test.ts
```

4. Verify `package.json` still registers `./src/index.ts`, exports `./src/api.ts`, and pins `pi-agent-execution`. Require evidence for exact-hash trust, project trust, explicit/automatic authorization, saved discovery, persistence, cleanup, real Pi lifecycle/trace handling, recursion suppression via `PI_WORKFLOWS_DEPTH`, and no dynamic in-process fallback.

**Evidence:** revision, Node/npm versions, commands, exit codes, test/pass/skip counts, and bounded failure excerpts in `phase-5-evidence.md`. Any unexpected failure, unexpected sandbox skip under Node 25, or source/API mismatch stops the phase; do not compensate in chezmoi.

## Stage 1 — Reconcile the original ten workflow dispositions while the package remains unconfigured

**Likely files:** the eight retained files in `dot_pi/agent/workflows/`, plus `dot_pi/agent/test/pi-workflows-phase-5.test.mjs` and, if needed, `scripts/check-pi-workflows-contract.mjs`.

### Final dispositions

| Workflow | Disposition | Required narrowing |
|---|---|---|
| `deep-review.ts` | **Retain, narrowed** | Change model invocation to `explicit`; keep the 12-file/13-agent/concurrency-3/$6 ceilings; embed the required review rubric rather than requiring skill injection. Trusted saved mode only. |
| `diagnose-and-fix.ts` | **Deferred; remove from discovery** | The package exposes mutable jj change identities and cannot guarantee reviewed bytes equal integrated bytes. Use the direct `diagnosing-bugs` skill and normal review/commit workflow. |
| `investigate.ts` | **Retain, narrowed** | Change to `explicit` because six agents/$5 is not low-fanout automatic work; preserve read-only tools, 160-file limit, partial results, and independent verification. |
| `iterate-pr.ts` | **Retain, narrowed** | Keep `explicit`; require per-run approval naming repository/PR, network/credential use, commit/push/reply effects, six-pass/$6 ceiling, and stop conditions. Embed the one-cycle contract; if the mandatory commit protocol is unavailable, stop. Never expose as automatic and never claim continuation after restart. |
| `jungle-book.ts` | **Retain, narrowed** | Change to `explicit`; embed the classification vocabulary/artifact contract, retain read-only tools, 160-file/5-agent/concurrency-3/$4 ceilings. |
| `mine-workflows.ts` | **Retain, narrowed** | Change to `explicit`; keep six-root-session/48-candidate/128-KiB-header bounds; treat transcript text as data; emit proposals only; make the rubric self-contained. |
| `portability-phase.ts` | **Deferred; remove from discovery** | Exact review would require a second Git/jj serializer to preserve every tree entry. Run `scripts/check-portability.sh` directly and use the normal review/commit workflow. |
| `report-validate.ts` | **Retain** | The only `automatic` workflow: one tool-free agent, contained realpath, five-minute/$0.75 ceiling, inert filesystem repository discovery, and an explicit unavailable VCS-status marker. Never spawn Git, jj, or repository-configured programs. |
| `resume-status.ts` | **Retain** | Explicit because VCS status may execute repository-configured programs; bounded and explicitly “status only.” Preserve “do not resume work”; no execution-resume claim. |
| `verify-claims.ts` | **Retain, narrowed** | Change to `explicit` because it can fan out to ten agents; embed citation-verification rules, preserve read-only tools, path containment, eight-claim/160-file/concurrency-3/$3 ceilings, and treat document content as untrusted data. |

Eight workflows are retained and two are deferred outside discovery. Only `report-validate` is eligible for automatic selection. Saved workflow TypeScript is trusted in-process code; do not describe it as sandboxed. Dynamic source is the only permission-sandboxed path.

### Automated contract tests

Add tests that fail unless:

- exactly the eight retained workflows import the current `WorkflowContext`/`SpawnResult` API and typecheck against the exact candidate `src/api.ts`;
- metadata matches the disposition table and only `report-validate` is `automatic`;
- direct-mode skills and Phase 1 tests contain no dependency on package availability;
- no workflow adds Herdr/tmux process control, Pi extension listeners, lifecycle ownership, status reporting, or `askAgent` tool-path dependence;
- checkpoint/report text cannot imply execution resumes after restart;
- mutating workflows satisfy their declared gate: isolation plus reviewed integration, or explicit per-run mutation approval;
- read-only workflows restrict spawned tools and preserve fan-out, budget, path, and timeout limits;
- prompts that define correctness are self-contained rather than dependent on loading an unrelated skill.

The candidate checkout is an explicit input to the API compatibility script; require its Git revision before using it. Do not vendor a stale copy of `api.ts` and do not fall back to `research/pi-workflows-design.md`.

## Stage 2 — Synthetic dogfood before activation

**Owner:** automated worker; no live configured Pi subprocesses.
**Likely fixtures:** temporary directories created by `pi-workflows-phase-5.test.mjs`; avoid tracked generated logs.

Use fake/bounded `WorkflowContext` adapters and disposable Git and jj repositories:

1. **Read-only fixture:** 8–12 files, a report, two supported and two unsupported citations, repeated patterns, synthetic todo/session JSONL, and malformed/untrusted lines. Exercise every read-only workflow. Assert expected reports, traversal/symlink rejection, bounded fan-out/budget, partial-result handling, and byte-for-byte unchanged files/VCS state.
2. **Failure fixture:** force one spawn failure and budget exhaustion before the next phase. Require a partial report with usage, no orphan phase, and cleanup evidence.
3. **Automatic-security fixture:** configure hostile Git `core.fsmonitor` and filter programs that write marker files. Run `report-validate` and prove neither marker is created. Assert no retained workflow calls `isolate`, `integrate`, or `cleanupIsolation`.
4. **PR fixture:** use a fake `gh`/CI boundary only. Prove `iterate-pr` cannot start mutation without the explicit approval response, cannot become automatic, and stops at its finite pass/blocked states. Do not use a real PR.
5. **Dynamic fixture:** under Node 25, run only a minimal read-only dynamic script. Require denial outside declared permissions, no imports, no `askAgent`, and no fallback. This proves the package contract; it does not enable `$workflow` on the Node 24 managed host.

Run the focused Phase 5 test, the Phase 4 regression test, then the full managed suite:

```sh
cd dot_pi/agent
node --test test/pi-workflows-phase-5.test.mjs
node --test test/phase-4-guidance.test.mjs
npm test
```

## Stage 3 — Add the managed pin and rendering checks

**Depends on:** Stages 0–2 passing.
**Likely files:**

- `.data/pi/agent/settings.json`
- `scripts/check-portability.sh`
- `.chezmoiscripts/run_onchange_after_30-setup-pi.sh.tmpl` (test; change only if a failing contract requires it)
- `README.md`
- `docs/pi-verification.md`
- preferably a focused `docs/pi-workflows.md`
- `.pi/plans/2026-09-12-cursor-plugin-adoption/phase-5-evidence.md`

Append exactly this public package identity, once:

```json
"git:github.com/Attamusc/pi-workflows@1614faf29c6ad1d0fcc9fe6db86a770f34e2b129"
```

Update the portability expected package list and assert every Attamusc development pin remains a full 40-character commit except the existing released `pi-hunk-review` tag. Preserve public-first private overlay merging and prohibit a local-path duplicate. The existing content hashes in the setup hook should trigger `pi update --extensions`; do not add a separate installer, lifecycle manager, status reporter, symlink install, or suppressed-error fallback.

Automated evidence:

```sh
jq empty .data/pi/agent/settings.json
chezmoi --source "$PWD" cat "$HOME/.pi/agent/settings.json" \
  | jq -e '.packages | map(select(. == "git:github.com/Attamusc/pi-workflows@1614faf29c6ad1d0fcc9fe6db86a770f34e2b129")) | length == 1'
bash scripts/check-portability.sh
(cd dot_pi/agent && npm test)
git diff --check
```

The portability gate must render macOS and Fedora 44 settings/setup scripts, prove the exact pin and content-addressed reconciliation, preserve Herdr installation order, reject `pi-herdr`/cmux/tmux fallback configuration, and leave Phase 4 guidance tests green.

Documentation must distinguish saved trusted workflows from dynamic sandboxed workflows, state the Node 24 dynamic-unavailable behavior, list mutation approvals, keep direct skills package-independent, and describe JSONL/checkpoints as audit history rather than resumable execution.

## Stage 4 — Independent source gates

**Depends on:** all automated commands passing; still no `chezmoi apply`.

1. An independent reviewer examines the complete diff for safety, maintainability, privacy, duplicate ownership, and Phase 4 regression. Gate: no unresolved P0/P1 findings.
2. An independent integration validator compares the implementation with the exact package revision and source-of-truth files: `src/api.ts`, `src/trust.ts`, `src/sandbox.ts`, `src/persistence.ts`, `src/capabilities.ts`, `src/saved.ts`, `src/tools/saved-workflows.ts`, `src/model-invocation.ts`, package tests, ADR-0006, and ADR-0007. Gate: `VALIDATION: PASS`, with exact-pin, type/API, trust, mutation, lifecycle, render, and no-resume claims verified.
3. Record reviewer/validator verdicts and commit IDs in the bounded evidence file. Agent summaries alone are not test evidence.

Only after these gates may the user activate the rendered package.

## Stage 5 — User-run activation and fresh-terminal live smoke

**Owner:** user/main host, outside every Pi/worker/subagent session. Workers must not run this stage. Follow `tests/MANUAL-SMOKE.md` OOM precautions: fresh terminal, tiny `/tmp` cwd, one bounded spawn at a time, no `node_modules`/large tree, and process cleanup checked after abort/timeout.

1. Review and activate:

```sh
chezmoi diff
chezmoi apply
pi list
```

Require the exact Git package and no local/symlink duplicate. Start a new Pi process (or reload only from that top-level process) and use slash-command autocomplete to verify exactly the eight retained workflow commands are discoverable with the expected metadata. `/workflows` is the active/recent-run dashboard and may show previous runs; `/workflows catalog` shows only trusted automatic catalog entries, not the complete saved-workflow library.

2. In `/tmp/pi-workflows-smoke`, create only a tiny README/report fixture. Run the package’s existing `tests/smoke-workflow-tool.ts` and `tests/smoke-runtime-hello.ts` from the exact source revision. For abort and timeout, materialize the bounded temporary scripts printed in `tests/MANUAL-SMOKE.md` because the candidate does not contain standalone `smoke-abort.ts`/`smoke-timeout.ts` files. Require terminal `aborted`/`timeout` results within the documented bound and prove the owned child process exited.
3. In the fresh top-level Pi, approve and run only `/report-validate <synthetic-report>` as the managed saved-workflow smoke. Require a bounded read-only report, a JSONL `run_start`…`run_end`, and no fixture/VCS mutation. Do not live-dogfood `iterate-pr` against a real PR.
4. Start one child only if needed to verify recursion suppression; confirm child Pi has no workflow commands/tools and no duplicate Herdr/Pi status source. Do not add a second reporter to make this observable.
5. Record commands and measured output separately from user-observed TUI facts. Never paste credentials, private settings, full transcripts, or unbounded process listings.

**Live acceptance:** `/workflows` is present; one managed saved workflow completes; approval/hash invalidation behaves as documented; abort and timeout clean up; no recursive registration occurs; Herdr remains the sole lifecycle/status owner; Node 24 does not expose `$workflow`. Direct-skill independence is established by the automated Phase 1 regression tests, not by mutating rendered settings during smoke.

## Acceptance gates

Phase 5 is complete only when all are true:

- exact candidate tests pass before chezmoi mutation, including unskipped Node 25 sandbox denial and real Pi lifecycle tests;
- every workflow has the recorded disposition and compiles against the current API;
- only `report-validate` is automatic;
- all mutation paths are approval-gated or isolated/reviewed/integrated on source-of-truth boundaries;
- synthetic read-only, failure, mutation, PR, and dynamic fixtures pass;
- exact managed pin, macOS/Fedora renders, setup behavior, full tests, Phase 4 regression tests, and portability pass;
- independent review has no unresolved P0/P1 and integration validation passes;
- user-run fresh-terminal smoke passes with cleanup evidence;
- no direct-skill package dependency, dynamic fallback, duplicate lifecycle/status owner, or cross-restart execution-resume claim exists.

## Rollback and stop conditions

- **Before apply:** do not add/keep the pin if any gate fails. Revert only Phase 5 commits; do not modify the package to hide incompatibility.
- **After apply, before live smoke passes:** revert the Phase 5 source commits, review `chezmoi diff`, then apply the reverted settings so Pi reconciliation removes the package. Restart Pi. Do not keep a local-path or old-pin fallback.
- Exact-hash trust for changed/removed workflows becomes inert; do not rewrite the trust store automatically. Run logs remain audit evidence unless the user explicitly approves their deletion.
- On an orphan found during manual smoke, stop new runs and follow the package manual cleanup from the fresh terminal. Do not let a worker issue broad process-kill commands.
- Repeated failure, contradictory lifecycle evidence, protected-state drift, or inability to prove cleanup triggers an Andon pause and blocks activation.

## Recommended todo breakdown

1. Capture exact-candidate Node 24/25 package test evidence (Stage 0).
2. Add the API/static policy contract harness for all eight retained workflows.
3. Narrow the seven read-only workflows and make required prompts self-contained.
4. Preserve the `iterate-pr` mutation gate and remove the two deferred workflows from discovery.
5. Add synthetic read-only/failure/mutation/PR/dynamic dogfood fixtures.
6. Run focused/full regression tests and resolve only contract-backed failures.
7. Add the exact package pin plus rendered setup/portability assertions.
8. Update package/direct-mode/security/resume documentation and evidence template.
9. Run independent review and integration validation; address all blocking findings.
10. Hand the user the fresh-terminal activation/smoke checklist; record its outcome.
11. Re-run validation over the final evidence and mark Phase 5/ISC-L5 complete only after live smoke.

## Blocking decision

None. The conservative rollout activates trusted saved workflows on the managed Node 24 host while leaving dynamic `$workflow` unavailable. Enabling dynamic workflows later requires a separate, measured decision to provide Node 25+ on the host; it must not be smuggled into this phase as a fallback or incidental global runtime upgrade.
