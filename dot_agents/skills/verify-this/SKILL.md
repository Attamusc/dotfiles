---
name: verify-this
description: "Verify one change, claim, feature, command, or integration with bounded checks, graded evidence, and a canonical Markdown report. Use for 'verify this', 'prove it works', or 'did this fix it'."
---

# Verify This

This skill is the single front door for verification. It owns target selection, the check manifest, evidence grading, and the final verdict. It does not own project-specific checks, blast-radius analysis, command or process execution, contract methodology, tests, GitHub, or browser automation.

Read `references/verification-definition.md` and `references/verification-report.md` before planning or running checks.

## Procedure

### 1. Define one target

Restate exactly one change, claim, feature, command, or integration as a falsifiable success claim. Record the included and excluded boundaries. If the request contains independent targets, ask the user to select one; do not combine verdicts.

Record the repository state and pre-existing changes. Never reset, clean, checkout, overwrite, or include unrelated work to obtain a result.

### 2. Select one project definition

Derive a narrow scope name from the target and look only for matching, committed `.agents/skills/verify-<scope>/SKILL.md` definitions in the trusted project. Select the single most specific match. Do not merge definitions and do not create one automatically.

Validate the selected definition before execution with `node ~/.agents/skills/verify-this/scripts/validate-verification.mjs definition <path>`. Exit status 0 is required. The validator emits only bounded section/field errors and never artifact content. If it is invalid or stale, stop its checks, retain each as `skipped` or `error` as appropriate, and recommend `maintain-verification-skill`.

If no matching definition exists, use only generic checks justified by repository evidence, such as documented test, lint, build, or reproduction commands. Before execution, create a temporary local definition-shaped manifest conforming to the definition contract and containing those checks. Keep it user-local, session-local, or gitignored; do not track it or treat it as a second verdict format. State `No matching project verification definition; coverage is incomplete` under limitations, recommend `create-verification-skill`, and make the verdict `INCOMPLETE` even when those checks pass.

### 3. Establish blast radius

Invoke the `blast-radius` skill with the target, success claim, selected definition, and relevant diff or plan. Carry its affected paths, contracts, rollback scope, verification implications, and unknowns into the manifest and report. Do not recreate or broaden its analysis.

For a contract-specific target, invoke `verify-integration` and follow its methodology rather than copying it here. Compose with `tdd`, `github`, or `playwright-cli` only when a manifest check requires that owner's capability.

### 4. Build the bounded manifest

Before execution, list every planned check. Checks from a project definition retain their stable IDs and order. Assign repository-evidenced generic checks the next unused `CHECK-<n>` identifiers. For each check record:

- target and purpose;
- exact command or bounded manual procedure;
- safety class (`read-only` or `mutating`);
- required host capabilities and execution owner;
- timeout or objective stopping condition;
- expected pass signal and failure interpretation;
- bounded evidence to retain;
- cleanup obligation and proof.

Reject checks that lack an objective pass signal, a bound, a justified relationship to the target, or a valid execution owner. Keep rejected and unavailable checks in the manifest; they must end as `skipped` or `unsupported`, never disappear.

### 5. Execute through existing owners

Invoke `control-cli` for every live CLI or interactive check. It selects Pi `bash` plus `command-safety`, `pi-interactive-subagents` plus Herdr, or an activated `pi-workflows` runtime and governs preflight, approval, timeout, capture, cleanup, and exit proof. Never implement a substitute controller or bypass its mutation approval.

Execute only manifest checks. When a required capability is unavailable, record `unsupported` and continue only independent checks. Preserve bounded output or a reference to the owner's native record. Native JSONL, session records, transcripts, screenshots, and command output are supporting evidence, not another verdict store.

### 6. Close every manifest entry

Give every planned check exactly one terminal status: `pass`, `fail`, `error`, `skipped`, or `unsupported`. Give each exactly one evidence grade: `measured`, `observed`, `agent-reported`, or `unverified`.

A `pass` requires `measured` or `observed` evidence. Agent summaries remain `agent-reported`; do not promote them to observations. Prefer measured evidence when evidence conflicts and preserve the disagreement. A check with required but unproven cleanup is `error`, not `pass`. A cancellation or termination request is not exit proof.

### 7. Render the canonical report

Render the report exactly as required by `references/verification-report.md`, including every required section and every check in both the results and cleanup tables. Put bounded excerpts in evidence references and list all skipped, unsupported, invalid, stale, or rejected checks and all blast-radius unknowns under limitations.

The verdict is exactly `PASS`, `FAIL`, or `INCOMPLETE` under that contract. Validate the rendered report with `node ~/.agents/skills/verify-this/scripts/validate-verification.mjs report <path> --definition <selected-or-transient-definition-path>` and do not report or accept it unless the command exits 0. Missing project definitions always force `INCOMPLETE` because generic checks cannot establish complete coverage. Store the report only in a user-local, session-local, or gitignored location unless the user explicitly approves publication.
