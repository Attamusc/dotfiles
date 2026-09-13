---
name: maintain-verification-skill
description: Audit one explicit project verification definition against its canonical contract and current repository evidence, then propose approval-gated corrections. Use when verify-this reports an invalid or stale definition or when asked to audit a verification skill.
---

# Maintain a Verification Skill

Audit exactly one project verification definition supplied by explicit path. The target must be a project-local `.agents/skills/verify-<scope>/SKILL.md`. Do not search for other candidates, expand into general repository cleanup, edit product code, or inspect Pi transcripts.

Read `~/.agents/skills/verify-this/references/verification-definition.md` first. It is the canonical definition contract.

## 1. Establish the boundary

Require the user to identify one verification `SKILL.md` path. If the path is absent, ambiguous, outside the current project, or not a verification definition, stop and request an explicit path. Record the file's exact content and the initial working-tree state. Never reset, clean, checkout, overwrite, or include unrelated changes.

The only permitted write is an approved revision of that definition. Do not change its references, tests, command manifests, CI, product source, `AGENTS.md`, notes, or other skills.

## 2. Validate the definition contract

Run `node ~/.agents/skills/verify-this/scripts/validate-verification.mjs definition <path>` and require exit status 0 for contract validity. This single canonical validator emits only bounded section/field errors and never artifact content.

Report every contract error before assessing execution. Contract validity and staleness are separate findings. Never execute checks from an invalid definition. A proposed correction may repair contract errors only when the intended value is established by the definition or cited repository evidence; otherwise mark the correction ambiguous and leave it as a proposal requiring user input.

## 3. Audit every declared executable check

Run `node ~/.agents/skills/maintain-verification-skill/scripts/audit-verification.mjs <definition-path> <repository-root>` to inventory and classify every check whose `Command` is not `none`. The dependency-free helper reads each declaration and its cited repository files; it does not accept pre-classified booleans. Preserve document order and stable identifiers. For each command:

1. Read its full declaration, especially `Target`, `Safety`, command, timeout, evidence, and cleanup.
2. Follow repository source citations in `Target`, written as inline-code `project/relative/path#entry-or-section` values. For JSON, traverse the exact dotted entry. For Markdown, inspect only the exact heading text or lowercase hyphenated heading slug. Other text formats have no supported entry convention and are `ambiguous`. Never search the whole cited file for a command when an entry is named.
3. Trace a command wrapper only far enough to establish whether the declared executable path and arguments still exist and mean what the check claims.
4. Consult another repository source only when it directly resolves a conflict or missing citation. Record that path as current evidence.

Assess declarations from repository sources; do not run a check merely to determine whether its command is stale. Never execute a mutating check during maintenance. Do not install dependencies, start services, modify fixtures, or invoke commands with uncertain side effects as part of this audit.

Assign one state:

- `current` — current cited repository evidence establishes the exact command and intended target.
- `stale` — current repository evidence directly contradicts the declaration, such as a removed or renamed manifest entry, script, executable path, or required argument.
- `missing` — the declaration has no usable repository source citation or its cited source is absent, so currency cannot be established.
- `ambiguous` — available sources conflict or suggest a change without establishing one exact replacement.

Absence is not evidence of a replacement. Do not infer a replacement from framework conventions, nearby commands, filenames, or names alone. Do not rewrite descriptions for style or add checks unrelated to the existing definition.

## 4. Present the audit

Show one row for every declared executable check:

```markdown
| Check | Declared source | Current evidence | State | Proposed action |
|---|---|---|---|---|
| CHECK-1 | `package.json#scripts.test` | `package.json#scripts.test` no longer defines the declared command | stale | remove, or replace after an exact command is established |
| CHECK-2 | `docs/api.md#verification-command` | `docs/api.md#verification-command` still documents the exact command | current | none |
```

`Declared source` must cite the declaration's repository source path and entry or section. `Current evidence` must cite the current repository path and concrete observation. Every `stale` row must contain both citations and the contradiction; never report stale from an unsupported inference. For `missing` and `ambiguous`, state the evidence gap or conflict and keep any possible replacement explicitly provisional.

Also report:

- canonical contract validation result and each error;
- the number of executable checks inventoried and audited;
- any bounded source that could not be read;
- confirmation that no checks were executed and no files were changed.

## 5. Propose before persistence

If no correction is supported, report the definition as clean or blocked by identified evidence gaps and stop without writing.

Otherwise prepare an in-memory revision limited to proven contract or stale-declaration corrections. Preserve stable check identifiers and unrelated wording. For a stale command with no exact evidenced replacement, propose alternatives such as removal or a user-supplied command; do not place a guessed command in the proposed file.

Show all of the following before writing:

1. the exact target path;
2. a unified diff against the recorded original, without elision;
3. the audit rows and repository evidence supporting every changed line;
4. the revised definition's canonical contract validation result;
5. any ambiguous findings excluded from the diff.

Ask for explicit approval to apply that exact diff. Presenting the diff, receiving approval for investigation, or receiving no response is not approval. If approval is declined or absent, stop and confirm by re-reading the target that its content is unchanged.

## 6. Apply only the approved diff

After explicit approval, re-read the target. If it differs from the recorded original, stop and produce a fresh audit and proposal rather than overwriting concurrent work. Apply exactly the approved diff to the one definition file and no other path.

Read the result back, run the same canonical validator against it again, and re-audit each changed executable declaration against its cited current evidence. Report the path, validation result, changed check identifiers, and working-tree status. Do not commit or modify any unrelated file as part of this procedure.
