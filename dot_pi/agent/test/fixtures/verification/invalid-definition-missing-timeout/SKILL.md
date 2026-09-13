---
name: verify-missing-timeout
description: Invalid fixture whose check omits both timeout and stopping condition.
---

# Verification: missing timeout

## Scope

Verify the fixture parser.

## Prerequisites

Node.js is available as `node`.

## Checks

### CHECK-1: Missing timeout
- Target: fixture parser
- Safety: read-only
- Requires: node
- Command: `node --test test/example.test.mjs`
- Pass signal: exit status 0
- Failure means: parser behavior violates the contract
- Evidence: exit status and bounded output
- Cleanup: none

## Report

Emit a Markdown report conforming to the shared verification report contract at `references/verification-report.md`.
