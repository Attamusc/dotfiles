# Context-efficiency contract validation

Date: 2026-09-06
Status: **Pre-pilot gate passed. History and persisted parent/child smoke verified; independent parser source/live-shape review passed.**

## Verified commands

Commands run by the orchestrator from the repository root:

| Command | Exit | Bounded result |
|---|---:|---|
| `node --test dot_pi/agent/test/*.test.mjs` | 0 | 45 tests passed, 0 failed |
| `python3 -m unittest discover -s tests/context-efficiency` | 0 | 21 tests passed, including citation order/repetition regression |
| `python3 research/context-efficiency/validate.py` | 0 | Structural schema, conditions, pairs, hashes, anchors, and range bounds validated; semantic review separate |
| `scripts/check-portability.sh` | 0 | macOS and Linux/Fedora render/contract checks passed; non-failing subsecond tar timestamp warnings |
| `python3 scripts/protected-local-state.py compare --before <baseline> --after <post-portability>` | 0 | All four protected local roots unchanged |

Protected-state snapshots were created with `python3 scripts/protected-local-state.py snapshot --repo "$PWD" --output <temporary-manifest>` before implementation and after portability validation. No protected contents were printed.

## Independent source-contract review

- Quota-history schema and privacy: pass by inspection and canary tests.
- Accepted-refresh ordering, failure isolation, shutdown, and no polling: pass by inspection and lifecycle fixtures.
- Persistence and retention: pass by inspection and temporary-directory tests.
- Anonymous decrease detection: initial failure corrected. A regression reproduced missing diagnostics when providers interleaved; the correction tracks the last window per provider/window ID, respects reset changes, and passed independent recheck.
- Pilot preregistration: initial six findings corrected before any run; independent re-review passed. Operator answers are withheld from model input, citation scoring is semantic, tool conditions are explicit, and exact-contract parent reads are auditable.

Review sessions were independent but used the same Codex provider as implementation. The configured Claude reviewer failed before producing a review because third-party extra usage was unavailable; no billing settings were changed.

## Live history evidence

Executed:

```sh
node scripts/context-efficiency-smoke.mjs \
  --sdk-root "$(realpath "$(dirname "$(command -v pi)")/../@earendil-works/pi-coding-agent")" \
  --repo "$PWD"
```

Exit **0**. Actual installed Pi 0.84.4 loaded only the new source extension and dispatched registered `/usage` commands. Four sanitized observations persisted in a runner-owned temporary state directory; a fresh reader saw prior records across actual resource reload. Reported model-call count: **0**. No user runtime installation was changed. Node emitted a non-failing module-type warning for the TypeScript helper.

The initial harness attempt used `--pi` and failed before loading Pi or calling a provider: the installed executable is a shell shim, not a symlink into its package. The harness now requires an explicit verified SDK package root instead of guessing from executable ancestry.

## Persisted parent/child smoke

One genuine read-only parent/scout smoke was launched through installed Pi 0.84.4 and the pinned subagent extension. The parent used Astra/high, delegated one two-line source read to the configured Luna/low scout, and continued after the completion event. No additional model smoke was run.

The launcher initially exited 1 *after* the successful model turns: it required optional completion metadata `sessionFileExists` to equal `true`, but the successful live record omits that field. Direct filesystem inspection confirmed the child JSONL exists. The launcher now checks the file itself. The incomplete-attempt artifact is retained; no model call was repeated to hide the harness failure.

`python3 scripts/context-efficiency-pilot.py parse <actual-parent-session.jsonl>` returned `valid: true`, one linked scout, and no diagnostics. An independent standard-library sum over each actual session's assistant `usage` records matched all five fields exactly:

| Session | Input | Output | Cache read | Cache write | Total tokens |
|---|---:|---:|---:|---:|---:|
| Parent | 2,460 | 129 | 3,328 | 0 | 5,917 |
| Scout | 11,356 | 103 | 10,752 | 0 | 22,211 |
| Combined | 13,816 | 232 | 14,080 | 0 | 28,128 |

These are session telemetry, not measured subscription charges or pilot results. Raw session prose and credentials are not included in this report.

## Parser gate outcome

Independent re-review passed after correcting source-derived read coverage, final/child ordering, corpus/child-task binding, and timing/counts. The real qualified scout model pin is checked separately from response provider/model. Live-shaped fixtures now exercise text-array user input and repository-relative/absolute paths, mapped to frozen corpus identities. A separate check against the actual smoke child confirmed the returned two-line read matches its frozen source.

Final review also closed a shell-option scope bypass: only a small command-specific boolean flag allowlist is accepted. Unknown options that can invoke programs or consume indirect files invalidate a run. This is a trusted-local offline evidence check, not an OS sandbox. All 20 Python tests and 45 Node tests passed; the final pre-pilot portability command exited 0.

There were no additional model smoke attempts. The original launcher assertion failure remains recorded above. Pilot conclusions still require run validation, rubric scoring, and independent conclusion review.

## Protocol-2 corrections and execution

Two protocol-1 inventory runs finished but used shell forms the evaluator cannot certify. They remain invalid, unscored attempts in `attempts/protocol-1.json`; raw sessions are retained privately in user state. Before any revision-2 run, identical inspection grammar was added to all four shared prompts. Corpus hashes, facts, anchors, model pins, and pair order were programmatically compared to original preregistration `47695950` and remained unchanged. Independent review cleared revision 2 before execution (commit `596115f5`).

The initial scout-first launcher remained alive after persisting its final result because `session.dispose()` does not dispatch `session_shutdown`. The launcher now emits that event first, matching the installed SDK runtime owner. A real SDK fixture extension holds a timer until shutdown; its no-model check timed out with exit 124 before the correction and exited 0 afterward. An idle check using the genuine subagent extension alone did not reproduce the timer issue, so it was not represented as the regression proof.

Actual truncated reads add `content` to truncation metadata. The parser now compares expected flags while continuing to reconstruct and match returned text against frozen source. The regression failed before correction; afterward all actual inventory parent/scout reads matched. Unsupported shell commands remained invalid.

All eight revision-2 runs completed sequentially in the prescribed alternating order and exited 0. Parent sessions were copied byte-for-byte into private user state; child sessions remain in Pi's session store. No revision-1 attempt is pooled with revision 2.

Post-run instrumentation also exposed that fact-grouped citations cannot preserve prose order or repeated occurrences. A generic regression reproduced the false rejection. Comparison now requires the same set of final and scored citation spans; every per-fact post-scout read-coverage check remains. An additional unscored final range still fails. The final independent contract review verified this correction; the separate conclusion review also passed. Both verdicts are recorded in `validation.md`.

The final test run passed 21 Python and 45 Node tests. Portability exited 0 and all four protected roots remained unchanged. No user runtime installation was applied or billing configuration changed. Account-wide quota attribution for the measured batch is unavailable.

Fixture success is not live integration evidence. Local routing conclusions belong in `report.md`, after evidence and semantic review.
