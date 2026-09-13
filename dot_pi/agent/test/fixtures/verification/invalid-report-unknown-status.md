# Verification Report

- Target: invalid status fixture
- Scope: report validation only
- Date: 2026-09-14

## Environment and capabilities

| Capability | Status | Evidence |
|---|---|---|
| node | available | EVIDENCE-1 records the bounded version check |

## Blast radius

- Affected paths: none
- Affected contracts: verification report contract
- Rollback scope: none

## Check results

| Check | Status | Evidence grade | Evidence reference |
|---|---|---|---|
| CHECK-1 | blocked | measured | EVIDENCE-1 |

## Evidence references

| Reference | Kind | Bounded detail |
|---|---|---|
| EVIDENCE-1 | command output | `node --version` returned `v22.0.0` |

## Cleanup status

| Check | Required cleanup | Status | Evidence |
|---|---|---|---|
| CHECK-1 | none | not-required | no state or process created |

## Limitations and unsupported checks

- None.

## Verdict

INCOMPLETE — the unknown result status is intentionally invalid.
