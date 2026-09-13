---
name: verify-mutation-without-approval
description: Invalid fixture whose mutating check omits required approval metadata.
---

# Verification: mutation without approval

## Scope

Verify mutation metadata validation.

## Prerequisites

Node.js is available as `node`.

## Checks

### CHECK-1: Unapproved mutation
- Target: disposable output
- Safety: mutating
- Target environment: disposable local fixture
- Mutation: creates `tmp/verification-output.txt`
- Requires: node
- Command: `node scripts/write-verification-output.mjs tmp/verification-output.txt`
- Timeout: 30s
- Pass signal: exit status 0
- Failure means: output creation failed
- Evidence: exit status and bounded output
- Cleanup: remove `tmp/verification-output.txt` and prove the path is absent

## Report

Emit a Markdown report conforming to the shared verification report contract at `references/verification-report.md`.
