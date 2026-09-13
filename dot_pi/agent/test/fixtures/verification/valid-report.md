# Verification Report

- Target: example contract fixture
- Scope: contract parser and project-relative fixtures; external integrations excluded
- Date: 2026-09-14

## Environment and capabilities

| Capability | Status | Evidence |
|---|---|---|
| node | available | EVIDENCE-1 records the bounded version check |

## Blast radius

- Affected paths: `test/example.test.mjs`, `tmp/verification-output.txt`
- Affected contracts: verification definition and report fixtures
- Rollback scope: remove the generated disposable output file

## Check results

| Check | Status | Evidence grade | Evidence reference |
|---|---|---|---|
| CHECK-1 | pass | measured | EVIDENCE-2 session artifact or native runtime record |
| CHECK-2 | pass | observed | EVIDENCE-3 direct file observation |

## Evidence references

| Reference | Kind | Bounded detail |
|---|---|---|
| EVIDENCE-1 | command output | `node --version` returned `v22.0.0` |
| EVIDENCE-2 | command output | test command exited 0; one test passed |
| EVIDENCE-3 | direct observation | command exited 0; the output file contained the single line `verified` before cleanup |
| EVIDENCE-4 | command output | `tmp/verification-output.txt` was absent after cleanup |

## Cleanup status

| Check | Required cleanup | Status | Evidence |
|---|---|---|---|
| CHECK-1 | none | not-required | no state or process created |
| CHECK-2 | remove `tmp/verification-output.txt` and prove the path is absent after cleanup | complete | EVIDENCE-4 |

## Limitations and unsupported checks

- None.

## Verdict

PASS — all required checks passed with measured or observed evidence and cleanup completed.
