# Context-efficiency final contract validation

**Date:** 2026-09-06  
**Contract verdict:** **PASS**  
**Conclusion review:** **PASS** in a separate independent session; the measured-configuration stop recommendation cleared both gates.

## Contracts

| Contract | Verdict | Evidence |
|---|---|---|
| Accepted-refresh ordering | PASS | `lifecycle.ts` creates a per-provider `LatestRequestGate` ticket, records only after `isCurrent`, and records neither stale nor failed requests. `refresh-state.ts` invalidates outstanding tickets on reset. `index.ts` registers only lifecycle-triggered refreshes; no polling loop is added. |
| Secret exclusion | PASS | `providers.ts` confines OAuth token and Codex account ID to request headers. `history.ts:createQuotaObservation` projects only schema version, time, random runtime ID, refresh reason, provider, plan, and bounded windows; it excludes provider payloads, headers, token, account ID, and `UsageSnapshot.details`. Live history smoke recorded four sanitized observations across reload with zero model calls (`contract-validation.md`). |
| Parent/child linkage | PASS | Pinned subagent source records the started child `sessionFile` and later `subagent_result` completion. `parse_strategy_usage` requires matching start/completion metadata, successful exit, and a parseable linked child session. Sampled actual exact-contract scout-first parent/child JSONL headers are v3; the parent is a fresh root and the child declares its parent session. |
| Usage aggregation | PASS | Assistant usage is summed independently per persisted session; parent tool-result nested usage is excluded. The sampled actual sessions summed to parent `16,869`, child `36,329`, combined `53,198` total tokens, with all five usage fields matching the committed record/report. |
| Citation coverage | PASS | `context-efficiency-pilot.py` compares final/scored citation **span sets**, so fact grouping and repeated prose spans cannot cause a false rejection. It still rejects an extra unscored span and independently requires a post-scout parent-read mapping whose returned frozen-corpus range covers each fact citation. Regression: `tests/context-efficiency/test_validation_report.py`. |
| Lifecycle/shutdown | PASS | `context-efficiency-run.mjs` emits `session_shutdown` before disposal. `lifecycle.ts` resets the request gate and bounded-flushes history; the SDK lifecycle fixture clears its timer only on shutdown. The documented no-model red/green lifecycle reproduction is retained in `contract-validation.md`. |

## Evidence boundary

The committed protocol-2 result set contains eight records (`summary.json`: four valid pairs, zero efficiency wins); `report.md` keeps telemetry distinct from subscription billing and quota attribution unavailable. This check used actual persisted session metadata and usage only—no prompts, assistant/tool prose, credentials, or provider payloads are recorded here. It validates a trusted-local evidence parser, not an OS sandbox, and makes no provider-independence claim.

## Conclusion review — independent Codex session

**Overall verdict: PASS.** This is a named independent Codex-session review, not human ground truth or cross-provider independence.

| Gate | Verdict | Bounded evidence |
|---|---|---|
| Rubric fidelity | PASS | Rescoring sampled final evidence against the frozen manifest/corpus confirms both log answers omit required F3’s run-019 TypeScript-loading pass (source line 720), so both correctly score 0/0. Exact-contract F2 remains 1/1: “No classification returns undefined” means absence of a classification returns `undefined`, matching `policy.ts:63-79`; it is not a contradiction. Sampled inventory and repeated-pattern citations support their scored facts. |
| Arithmetic sample | PASS | Independently summing assistant `usage` in every persisted parent/child JSONL reproduces all eight totals. Direct/scout-combined by pair: 42,598/202,409; 58,870/118,088; 129,790/157,642; 13,236/53,198. Strategy sums are 244,494 and 531,337 respectively (2.17×). |
| Billing language | PASS | `report.md` consistently calls these Pi token telemetry, declares quota attribution unavailable and model subscription weighting unknown, and makes no dollar, quota, or Spotify-universal-savings conversion/claim. |
| Recommendation supported | PASS | The plan requires correctness plus combined improvement beyond an outlier before a guardrail plan. Combined tokens are higher in all four pairs (and the log pair fails both arms); **stop** follows. The report bounds this to the measured harness/configuration and discloses parent startup asymmetry, unavailable quota attribution, unknown concurrency, and one observation per arm/task. |

**Evidence:** `research/context-efficiency/report.md`; `research/context-efficiency/summary.json`; `research/context-efficiency/results/*.json`; `.pi/plans/2026-09-06-context-efficiency/pilot-evidence/*.md`; `research/context-efficiency/manifest.json`.
