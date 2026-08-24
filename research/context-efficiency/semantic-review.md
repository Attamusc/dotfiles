# Preregistration semantic anchor review

**Date:** 2026-09-06
**Scope:** Operator-only pre-run check. This file must never be included in model input.
**Method:** Read each frozen `requiredFacts[].reviewerAnchors` range and confirm that the cited source supports the fact text. This is human semantic review; `validate.py` does not perform it.

| Task | Fact | Result | Evidence check |
|---|---|---|---|
| implementation-inventory | F1 | PASS | Anchors show `pi.registerTool` for `todo` and `pi.registerCommand("todos")`. |
| implementation-inventory | F2 | PASS | Anchors define `PI_TODO_PATH`, resolve its nonblank value, and otherwise call repository-scoped storage. |
| implementation-inventory | F3 | PASS | Anchor resolves repository root, hashes it with SHA-256, takes eight hex characters, and joins basename plus digest. |
| implementation-inventory | F4 | PASS | Anchor defines symlink creation and migration by rename followed by linking. |
| implementation-inventory | F5 | PASS | Anchors define 30-minute TTL and use it when deciding whether a lock is current. |
| repeated-pattern-extraction | F1 | PASS | Each anchored workflow sets `wf.budget` and uses `wf.report` for termination paths. |
| repeated-pattern-extraction | F2 | PASS | Spawn sites in all four files provide explicit `tools` and `timeoutMs`. |
| repeated-pattern-extraction | F3 | PASS | The corpus-wide anchors show `wf.parallel` only in `investigate.ts`. |
| repeated-pattern-extraction | F4 | PASS | The fix spawn alone grants `write` and `edit`; other anchored spawn tool lists are read-only or read/bash. |
| repeated-pattern-extraction | F5 | PASS | Anchored result/failure reports include `usageTotal: wf.usage()`. |
| large-log-summarization | F1 | PASS | Runs 017 and 018 invoke `jj show --no-graph`, receive exit 2, and abort for VCS metadata failure. |
| large-log-summarization | F2 | PASS | Both error blocks give usage `jj show --no-pager [REVSET]`. |
| large-log-summarization | F3 | PASS | Run 019 passes jiti and corrected jj, then aborts on SC2086. |
| large-log-summarization | F4 | PASS | Run 020 passes all named stages and completes with `duration_ms=434`. |
| large-log-summarization | F5 | PASS | Header declares deterministic synthetic reconstruction, synthetic fields, no benchmark result, and no sensitive payloads. |
| exact-integration-contract | F1 | PASS | Handler blocks noninteractive parent confirmation; policy returns block for subagents and confirm for parents. |
| exact-integration-contract | F2 | PASS | Recoverable command table is consulted only inside the `isSubagent` branch. |
| exact-integration-contract | F3 | PASS | Handler returns for non-subagents before calling discovery inspection. |
| exact-integration-contract | F4 | PASS | Policy blocks unbounded root discovery and assigns 30 seconds only to discovery commands not classified long-running. |
| exact-integration-contract | F5 | PASS | Handler sets timeout only when the decision has one and input timeout is undefined. |

All 20 preregistered facts passed before any pilot run. This check confirms the answer key is grounded; it does not predict model correctness and does not require answers to copy anchor ranges exactly.
