# Verification Report

- Target: invalid evidence fixture
- Scope: report validation only
- Date: 2026-09-14

## Environment and capabilities

| Capability | Status | Evidence |
|---|---|---|
| node | available | agent says Node.js is available |

## Blast radius

- Affected paths: none
- Affected contracts: verification report contract
- Rollback scope: none

## Check results

| Check | Status | Evidence grade | Evidence reference |
|---|---|---|---|
| CHECK-1 | pass | unverified | EVIDENCE-1 |

## Evidence references

| Reference | Kind | Bounded detail |
|---|---|---|
| EVIDENCE-1 | agent claim | no command output or direct observation retained |

## Cleanup status

| Check | Required cleanup | Status | Evidence |
|---|---|---|---|
| CHECK-1 | none | not-required | no state or process created |

## Limitations and unsupported checks

- CHECK-1 has no qualifying evidence.

## Verdict

PASS — the unsupported pass claim is intentionally invalid.
