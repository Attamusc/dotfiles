---
name: create-verification-skill
description: Create one repository-evidenced project verification definition as an approval-gated proposal. Use when a project needs a repeatable scoped verification skill or verify-this reports that no matching project definition exists.
---

# Create a Verification Skill

Create exactly one project-local verification definition. The default destination is `.agents/skills/verify-<scope>/SKILL.md`. Do not create feature maps, helper files, `AGENTS.md`, notes, or unrelated skills. Do not inspect Pi transcripts.

Read `~/.agents/skills/verify-this/references/verification-definition.md` before drafting. It is the canonical definition contract.

## 1. Establish the scope and persistence policy

Choose one narrow scope from the user's target and repository evidence. Normalize it to lowercase letters, digits, and single hyphens so both the skill name and directory are `verify-<scope>`.

Check repository guidance to determine whether committed project Agent Skills are accepted. If they are prohibited, unclear, or the user requests no write, use proposal-only mode. Proposal-only mode completes every step below except writing and leaves the working tree unchanged.

Record the initial working-tree state. Never reset, clean, checkout, overwrite, or include unrelated changes.

## 2. Inspect repository-owned evidence

Inspect only repository files relevant to the scope:

- command manifests and task runners such as `package.json`, `Makefile`, or language project files;
- existing test configuration and focused tests;
- CI workflow files and their invoked scripts;
- project documentation for supported setup and verification commands;
- source-of-truth schemas, API specifications, migrations, interfaces, or other contracts.

Prefer exact commands already run by CI or documented by the repository. Trace wrappers to the repository file that defines the invoked command. Do not infer commands from filenames, framework conventions, skill names, or executable names alone. Do not silently repair a broken command while generating the definition; report the evidence gap instead.

For every proposed command, cite each establishing repository path and exact entry or section in the check's `Target` value as inline code, for example `Target: API contract tests (source: \`package.json#scripts.test\`, \`.github/workflows/ci.yml#contract-tests\`)`. JSON entries use dotted keys; Markdown entries use the heading text or its lowercase hyphenated slug. Bare paths do not establish executable checks. Use project-relative paths only. If no exact command is established, omit that check or use a bounded manual `Procedure` supported by a cited repository documentation section.

## 3. Draft one complete definition

Draft exactly one file at `.agents/skills/verify-<scope>/SKILL.md` with valid Agent Skills frontmatter containing only `name` and `description`. Follow the canonical contract exactly:

```markdown
---
name: verify-api
description: Verify this project's API contract after route, schema, or client changes.
---

# Verification: API

## Scope
...

## Prerequisites
...

## Checks

### CHECK-1: Contract tests
- Target: API contract tests (source: `package.json#scripts.test`, `docs/testing.md#api-contract-tests`)
- Safety: read-only
- Requires: node
- Command: `npm test -- api-contract`
- Timeout: 60s
- Pass signal: exit status 0
- Failure means: API behavior violates the tested contract
- Evidence: exit status and bounded output
- Cleanup: none

## Report
Use the shared verification report contract from the `verify-this` skill.
```

Use stable sequential `CHECK-<positive integer>` identifiers. Include every required field in contract order and no unknown check fields. For a mutating check, include the exact target environment, mutation, approval text, and cleanup proof required by the contract. Never embed credentials, sensitive content, machine-specific absolute paths, complete transcripts, or unbounded output.

## 4. Validate the proposal

Write the in-memory draft to a user-local temporary file and run `node ~/.agents/skills/verify-this/scripts/validate-verification.mjs definition <temporary-path>` before presenting it; remove the temporary file afterward. Exit status 0 is required. The validator emits only bounded section/field errors and never artifact content. Also confirm that every command cites the repository source files that establish it.

If validation fails, revise the draft before continuing. Do not write an invalid proposal.

## 5. Present before writing

Show all of the following in one proposal:

1. the exact destination path;
2. the complete proposed `SKILL.md` content, without elision;
3. the repository evidence paths supporting each command or procedure;
4. the validation result against the canonical contract;
5. whether the project permits the file to be committed.

Then ask for explicit approval to write that exact content. Presenting the proposal is not approval. Do not create the directory, file, temporary project file, or any other project artifact before approval.

If approval is declined, absent, or proposal-only mode applies, stop after the proposal and confirm that the project remains unchanged.

## 6. Write only the approved file

After explicit approval, recheck that the proposed destination and content have not changed. Write exactly the approved `.agents/skills/verify-<scope>/SKILL.md`; create only its parent directory if needed. Do not add provenance or auxiliary files to the generated skill.

Read the written file back, run the same canonical validator against it again, and show the resulting path and validation result. If the approved destination now exists with different content, stop and request new approval rather than overwriting it.
