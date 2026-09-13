# Verification Report Contract

The canonical verification verdict is a local Markdown report. Command output, Pi session records, and runtime-native records are supporting evidence referenced by the report, not alternate report formats. Reports MUST remain user-local, session-local, or gitignored unless the user explicitly approves publication.

## Required document shape

A conforming report contains each of the following headings exactly once and in this order. Every heading is required, even when its value is `None`.

```markdown
# Verification Report

- Target: <verified change, claim, feature, command, or integration>
- Scope: <included and excluded boundaries>
- Date: YYYY-MM-DD

## Environment and capabilities

| Capability | Status | Evidence |
|---|---|---|
| node | available | `node --version` returned a bounded version string |

## Blast radius

- Affected paths: <project-relative paths or none>
- Affected contracts: <interfaces, schemas, or none>
- Rollback scope: <bounded rollback description>

## Check results

| Check | Status | Evidence grade | Evidence reference |
|---|---|---|---|
| CHECK-1 | pass | measured | session artifact or native runtime record |

## Evidence references

| Reference | Kind | Bounded detail |
|---|---|---|
| EVIDENCE-1 | command output | exit status 0; relevant output excerpt |

## Cleanup status

| Check | Required cleanup | Status | Evidence |
|---|---|---|---|
| CHECK-1 | none | not-required | no state or process created |

## Limitations and unsupported checks

- None.

## Verdict

PASS — all required checks passed with qualifying evidence.
```

Target, scope, date, every table cell, and verdict MUST be non-empty. Target, Scope, and Date appear exactly once as the three metadata lines directly beneath the H1. Dates use `YYYY-MM-DD`. Paths MUST be project-relative. Evidence MUST use bounded excerpts or references and MUST NOT contain credentials, sensitive session content, complete transcripts, or unbounded environment dumps.

Capability status is exactly `available` or `unavailable`. List every capability declared by the definition exactly once and no undeclared capabilities. When the definition declares no capabilities, retain the exact capability header and separator with zero data rows; otherwise at least one data row is required. An unavailable capability identifies both the capability and every affected check in the limitations section, and each affected check has status `unsupported`. A check may be `unsupported` only when at least one capability it declares is listed as unavailable.

## Result statuses

| Status | Meaning |
|---|---|
| `pass` | The pass signal occurred and the evidence grade is `measured` or `observed`. |
| `fail` | The check ran to its stopping point and its pass signal did not occur. |
| `error` | The check could not produce a result because execution, collection, timeout handling, or cleanup failed. |
| `skipped` | The check was intentionally not run; a limitation names that exact `CHECK-<n>` and states why it was not run. Lack of a capability is not `skipped`. |
| `unsupported` | A declared required capability was unavailable. No undeclared fallback was used. |

Each check from the selected definition MUST appear exactly once. Additional repository-evidence checks use the lowest unused positive `CHECK-<n>` identifier, recalculated after each allocation, and are described in the limitations section. For example, a definition containing `CHECK-1` and `CHECK-3` allocates `CHECK-2` and then `CHECK-4`. Status values are lowercase and exactly one of those listed above.

## Evidence grades

| Grade | Meaning |
|---|---|
| `measured` | A command or runtime produced a retained objective value, exit status, or machine record. |
| `observed` | The runner directly witnessed an interactive or visual signal and records what was seen, where, and when. |
| `agent-reported` | An agent summarized an outcome without qualifying direct evidence. This is a claim, not proof. |
| `unverified` | No usable evidence supports the result. |

Every result MUST have one evidence grade and a non-empty evidence reference. `pass` is valid only with `measured` or `observed`, and the referenced bounded detail must establish every condition in the definition's declared pass signal. A `pass` paired with `agent-reported`, `unverified`, contradictory evidence, or an uncorrelatable signal is schema-invalid. Conflicting evidence is preserved in the evidence detail, and measured evidence takes precedence over summaries when assigning the status.

Pass evidence uses a closed observation grammar. An observation begins at the bounded-detail boundary or after `.`, `,`, `;`, `and`, or `but`; it carries an exact canonical subject, predicate, value, and predicate-local polarity. Supported subjects and predicates are: `command`/`test command` + exit, `exit status` + state, `process status`, `status`, `returned value`, `count`, `file state`, `process state`, a declared subject + `contains`/`equals`/`matches`, a declared subject + presence state, and a declared subject + `appears`. Every recognized observation for a declared subject must affirm the expected value. Prefix text, a different subject, negation attached to the predicate, or another value cannot establish a pass. A relation value may be followed by unrelated trailing prose only when the suffix begins with one of these delimiters: `with`, `before`, `after`, `during`, `from`, `at`, or `in`. Quoted relation values end at their closing backtick. Unquoted `equals` and `matches` values must be the complete declared value before a delimiter that follows the expected-value span, or before the end of the observation; a reserved word inside that span is value text, and the delimiter does not permit substring matching. `contains` finds a complete expected-value span in the relation value: reserved words inside that span are value text, and a delimiter after it may begin trailing prose. A delimiter before the span closes the unquoted relation value, so expected text appearing only in that suffix is rejected. This is the closed ambiguity rule: when an intended unquoted relation value would place a delimiter before the expected span, delimit the complete relation value with backticks. Thus trailing prose such as `with no failures` does not negate an affirmative observation.

The entire evidence-reference cell identifies a local artifact or native runtime record without embedding machine-specific absolute paths, home-relative paths, or parent traversal. Agent-reported claims MUST be plainly labeled as such and MUST NOT be rewritten as observations.

## Cleanup semantics

Every check appears once in the cleanup table. Cleanup status is exactly:

- `not-required` only when its definition says `Cleanup: none`;
- `complete` only when the evidence is one canonical sentence: the exact backtick-delimited declared target, `was` or `remains`, an affirmative terminal state (`absent`, `gone`, `restored`, `stopped`, or `terminated`), and exactly one suffix (`after cleanup`, `after removal`, or `after the action`);
- `incomplete` when cleanup was not completed or proven.

The canonical sentence may end with one optional clause in exactly this form: `; no owned state remains <same suffix>` or `; no owned process remains <same suffix>`. The clause must repeat the sentence's suffix. No other trailing text or coordinated clause is valid evidence for `complete`.

A check with required cleanup cannot pass when cleanup is `incomplete`; use `error` and explain the remaining state. A cancellation request is not proof of process termination.

## Verdict semantics

The verdict keyword is exactly `PASS`, `FAIL`, or `INCOMPLETE`, followed by a short reason.

- `PASS` requires every required check to have status `pass`, every pass to use `measured` or `observed` evidence, and all required cleanup to be `complete`. Declare optional definition checks in Scope with the exact clause `Optional checks: CHECK-1` or a comma-separated list such as `Optional checks: CHECK-1, CHECK-3`. Optional checks may be `skipped` or `unsupported` only when this clause names them and the limitations section names each affected check with a reason for the coverage gap.
- `FAIL` means at least one completed required check has status `fail`.
- `INCOMPLETE` means no required check failed, but at least one required check is `error`, `skipped`, or `unsupported`, evidence is insufficient, or cleanup is incomplete.

Report conformance requires the exact section order, metadata, table headers, `---` separator cells, enumerated values, cross-section check identifiers, evidence/pass rule, cleanup rule, and verdict rule defined here. Validation rejects recognizable credential-value patterns (common Authorization Basic/Bearer headers, GitHub tokens, AWS access-key IDs, high-entropy generic key/token/password assignments, PEM private-key headers, and URL userinfo). This bounded pattern check reduces accidental disclosure; it is not proof that arbitrary content contains no secret. Validation always receives the selected definition (or the transient definition-shaped manifest used when no project definition exists). It compares declared capabilities, selected check IDs, result evidence references, and cleanup text with that input. Every selected check appears exactly once. Repository-evidence checks not present in the definition fill the lowest positive identifier gaps in deterministic order and are named under limitations.
