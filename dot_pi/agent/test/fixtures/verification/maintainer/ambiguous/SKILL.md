---
name: verify-maintainer-fixture
description: Audit fixture.
---
# Verification: maintainer fixture
## Scope
Fixture.
## Prerequisites
Node.
## Checks
### CHECK-1: Test
- Target: package test script; sources `package.json#scripts.test`, `docs.md#test-command`
- Safety: read-only
- Requires: node
- Command: `node --test test/current.test.mjs`
- Timeout: 30s
- Pass signal: exit status 0
- Failure means: tests failed
- Evidence: bounded output
- Cleanup: none
## Report
Use the report contract.
