---
name: verify-example
description: Runs focused checks for the example contract fixture. Use when testing verification definition parsing and validation.
---

# Verification: example contract

## Scope

Verify the example contract parser and its project-relative fixture; external integrations are excluded.

## Prerequisites

Node.js is available as `node`.

## Checks

### CHECK-1: Focused tests
- Target: contract parser and fixtures
- Safety: read-only
- Requires: node
- Command: `node --test test/example.test.mjs`
- Timeout: 60s
- Pass signal: exit status 0
- Failure means: implementation or fixture violates the contract
- Evidence: exit status and bounded output
- Cleanup: none

### CHECK-2: Generated output
- Target: disposable verification output
- Safety: mutating
- Target environment: disposable local fixture
- Mutation: creates `tmp/verification-output.txt`
- Approval: explicit user approval required before execution
- Requires: node
- Command: `node scripts/write-verification-output.mjs tmp/verification-output.txt`
- Timeout: 30s
- Pass signal: command exits 0 and the output file contains `verified`
- Failure means: generated output does not satisfy the fixture contract
- Evidence: exit status and bounded evidence excerpt
- Cleanup: remove `tmp/verification-output.txt` and prove the path is absent after cleanup

## Report

Emit a Markdown report conforming to the shared verification report contract at `references/verification-report.md`.
