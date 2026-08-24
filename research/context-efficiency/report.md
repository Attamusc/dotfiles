# Context-efficiency pilot report

2026-09-06 · Protocol revision 2 · Eight sequential runs, one observation per arm/task.

Pi token telemetry is not subscription billing. Pair-level results come first; the recommendation follows. All eight records pass structural/session validation. Peak parent footprint is the maximum per-request `input + cacheRead + cacheWrite`; total tokens accumulate input, output, and cache fields over all requests.

## Pair: implementation-inventory
Order: direct → scout-first. Records: [direct](results/implementation-inventory-direct.json), [scout-first](results/implementation-inventory-scout-first.json).

| Strategy / role | Input | Output | Cache read | Cache write | Total tokens |
|---|---:|---:|---:|---:|---:|
| Direct parent = combined | 12,801 | 1,125 | 28,672 | 0 | 42,598 |
| Scout-first parent | 9,282 | 1,406 | 45,952 | 0 | 56,640 |
| Scout child | 22,390 | 1,011 | 122,368 | 0 | 145,769 |
| Scout-first combined | 31,672 | 2,417 | 168,320 | 0 | 202,409 |

| Strategy | Correctness | Peak parent input footprint | Latency (s) | Post-scout reads / bash calls |
|---|---|---:|---:|---:|
| direct | pass | 10,801 | 52.871 | 0 / 0 |
| scout-first | pass | 7,951 | 106.803 | 7 / 1 |

Scout-first combined telemetry is **4.75× direct**. Quota references: unavailable for both arms; other account activity: unknown.

## Pair: repeated-pattern-extraction
Order: scout-first → direct. Records: [direct](results/repeated-pattern-extraction-direct.json), [scout-first](results/repeated-pattern-extraction-scout-first.json).

| Strategy / role | Input | Output | Cache read | Cache write | Total tokens |
|---|---:|---:|---:|---:|---:|
| Direct parent = combined | 20,032 | 1,590 | 37,248 | 0 | 58,870 |
| Scout-first parent | 19,469 | 2,103 | 45,440 | 0 | 67,012 |
| Scout child | 10,088 | 1,564 | 39,424 | 0 | 51,076 |
| Scout-first combined | 29,557 | 3,667 | 84,864 | 0 | 118,088 |

| Strategy | Correctness | Peak parent input footprint | Latency (s) | Post-scout reads / bash calls |
|---|---|---:|---:|---:|
| direct | pass | 11,162 | 75.488 | 0 / 0 |
| scout-first | pass | 13,890 | 126.558 | 5 / 1 |

Scout-first combined telemetry is **2.01× direct**. Quota references: unavailable for both arms; other account activity: unknown.

## Pair: large-log-summarization
Order: direct → scout-first. Records: [direct](results/large-log-summarization-direct.json), [scout-first](results/large-log-summarization-scout-first.json).

| Strategy / role | Input | Output | Cache read | Cache write | Total tokens |
|---|---:|---:|---:|---:|---:|
| Direct parent = combined | 41,584 | 1,294 | 86,912 | 0 | 129,790 |
| Scout-first parent | 27,113 | 1,706 | 56,064 | 0 | 84,883 |
| Scout child | 49,800 | 1,455 | 21,504 | 0 | 72,759 |
| Scout-first combined | 76,913 | 3,161 | 77,568 | 0 | 157,642 |

| Strategy | Correctness | Peak parent input footprint | Latency (s) | Post-scout reads / bash calls |
|---|---|---:|---:|---:|
| direct | fail | 39,792 | 61.205 | 0 / 0 |
| scout-first | fail | 7,825 | 120.119 | 13 / 0 |

Scout-first combined telemetry is **1.21× direct**. Quota references: unavailable for both arms; other account activity: unknown.
Both answers omit required F3: run 019 passed TypeScript loading. Neither cites its supporting range. This pair cannot support an efficiency win despite lower scout-first parent footprint.

## Pair: exact-integration-contract
Order: scout-first → direct. Records: [direct](results/exact-integration-contract-direct.json), [scout-first](results/exact-integration-contract-scout-first.json).

| Strategy / role | Input | Output | Cache read | Cache write | Total tokens |
|---|---:|---:|---:|---:|---:|
| Direct parent = combined | 7,095 | 1,277 | 4,864 | 0 | 13,236 |
| Scout-first parent | 5,043 | 1,714 | 10,112 | 0 | 16,869 |
| Scout child | 14,034 | 791 | 21,504 | 0 | 36,329 |
| Scout-first combined | 19,077 | 2,505 | 31,616 | 0 | 53,198 |

| Strategy | Correctness | Peak parent input footprint | Latency (s) | Post-scout reads / bash calls |
|---|---|---:|---:|---:|
| direct | pass | 3,401 | 63.182 | 0 / 0 |
| scout-first | pass | 4,513 | 82.184 | 2 / 0 |

Scout-first combined telemetry is **4.02× direct**. Quota references: unavailable for both arms; other account activity: unknown.
The scout-first parent completed two source reads after scout completion and before its answer. Their returned ranges cover all six final citation spans and all nine fact/range mappings.

## Bounded aggregate

- Four structurally valid pairs; three pass correctness in both arms. Six of eight final answers pass.
- **Zero combined-token efficiency wins.** Scout-first combined total is higher in every pair, and latency is higher in every pair.
- Across these eight runs only: direct totals **244,494**, scout-first totals **531,337** (2.17×). This workload-weighted sum is not a universal savings estimate and includes the failed log pair.
- Parent peak footprint falls for inventory and the log, but rises for repeated patterns and exact-contract reasoning. The log drops from 39,792 to 7,825 peak parent input tokens, but fails correctness in both arms and adds child usage. Lower parent context alone is not a demonstrated combined-resource or subscription saving.

## Recommendation

**Decision:** stop

**Supported task classes:** none for automatic scout-first routing on this evidence.

**Unsupported generalizations:** all codebases, task sizes, production parent contexts, other model pairs, subscription charges, or a universal line threshold.

**Correctness gate:** inventory pass; repeated patterns pass; large log fail; exact contract pass.

**Quota attribution:** unavailable.

Do not proceed to selective-guardrail design from this pilot. The plan requires combined parent-plus-scout improvement beyond an isolated outlier; there is none in the four visible pairs. This stops the proposed guardrail effort for the measured configuration, not all use of scouts for parallel work, specialization, or context management. No read blocker or routing policy was added.

## Method, invalid attempts, and limits

- Parent: Astra/high; scout: Luna/low, using the pinned extension. Fresh persisted sessions, [fixed task corpus and rubric](manifest.json), explicit tool grammar, alternating pair order. The eight measured runs ran sequentially from 19:52:55Z through the final direct exact-contract answer on 2026-09-06.
- Parents use an isolated SDK resource loader without global instructions/skills; scouts retain configured startup context. This asymmetric startup overhead is included in scout usage. These numbers characterize this harness, not ordinary interactive sessions with full parent context.
- Fresh session does not guarantee a cold provider cache. Cache-read/write fields are retained separately. Model-specific subscription weighting is unknown; no dollar or token-to-quota conversion is made.
- Quota references are null: there is no attributable before/after observation for the measured batch. The orchestrator waited during the batch, but could not independently observe other account activity. Usage history was smoke-tested separately, not treated as pilot quota evidence.
- One run per arm/task, no variance estimate or statistical claim. The log is a fixed synthetic fixture, not production telemetry. Tool grammar was deliberately restricted for auditable scope.
- [Two revision-1 inventory attempts](attempts/protocol-1.json) remain invalid and are excluded, not silently discarded. Their underspecified prompts allowed shell forms outside the evaluator grammar. Both finished model work; the first scout-first launcher then remained alive until outer timeout. Their answers were not scored before revision 2.
- Revision 2 added the same grammar paragraph to all four shared prompts before any new run. Corpus hashes, facts, anchors, model pins, and pair order were unchanged. Runtime/read-evidence fixes and no-model regressions are recorded in [contract validation](contract-validation.md).
- Post-run citation comparison was corrected to compare span sets rather than prose order/repetition; every actual final span and every per-fact parent-read mapping is still checked. One reviewer-recorded subrange was normalized to the actual final citation enclosing it, with a note in the record.
- Scoring used named independent Codex agents, not human ground truth or cross-provider review. An initial exact-contract contradiction finding was withdrawn after its full sentence was read as absence of classification returning `undefined`; the rubric was unchanged.
- Implementation, review, smoke, and invalid-attempt work are not included in the eight-run sum. The genuine parent/scout smoke used 28,128 reported tokens; additional lifecycle checks made no model calls. This pilot is measurement work, not a claim of net experiment-workflow savings.
- Raw sessions stay in private user state/Pi session storage. Versioned records and [machine summary](summary.json) contain evidence references and metrics, not raw prompts, provider payloads, or credentials. No billing settings or protected local roots were changed; the source extension has not been applied to the user runtime.

## Verification

21 Python tests and 45 Node tests pass. Portability exits 0; four protected roots are unchanged. Separate independent contract and conclusion reviews both passed; evidence and sampled checks are recorded in [validation.md](validation.md).
