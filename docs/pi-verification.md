# Pi verification bundle

Phase 1 of the selective Cursor plugin adoption is installed as five shared skills. It works directly through Pi and existing execution owners, independently of the separately managed `pi-workflows` package. Session pickup, Glimpse review, Advisor automation, and the other roadmap phases are not enabled by this bundle.

## Choosing a verification action

| Need | Invoke | Durable write? |
|---|---|---|
| verify one target | `verify-this` | local report only |
| define project checks | `create-verification-skill` | approval required |
| audit existing checks | `maintain-verification-skill` | approval required |
| inspect impact | `blast-radius` | no |
| drive a live CLI | `control-cli` | depends on approved command |

Give `verify-this` one concrete change, claim, feature, command, or integration target. It builds a bounded manifest, obtains impact scope from `blast-radius`, selects project checks when available, and writes a Markdown report. Use `control-cli` only when a check needs live CLI interaction. Creating or changing project checks is a separate, approval-gated action.

## Ownership

Each Phase 1 capability has one owner:

| Capability | Owner |
|---|---|
| General verification orchestration, evidence grading, report, and verdict | `verify-this` |
| Project verification-definition creation | `create-verification-skill` |
| Project verification-definition audit and maintenance proposals | `maintain-verification-skill` |
| Impact and rollback-scope analysis | `blast-radius` |
| Live CLI adapter selection, approval protocol, and cleanup proof | `control-cli` |

The skills do not replace existing owners. Pi tools govern ordinary command execution, and `command-safety` mechanically enforces its recognized destructive-command classes. `pi-interactive-subagents` and Herdr govern visible child execution and lifecycle; Herdr remains the sole supported Pi/subagent multiplexer. `control-cli` adds no pane manager, PTY runtime, process supervisor, status reporter, session store, transcript store, or service wrapper. Missing capabilities are reported as `unsupported`; they do not trigger a tmux, process-control, or service fallback.

## Project definitions and maintenance

Trusted projects may commit one scoped definition at `.agents/skills/verify-<scope>/SKILL.md`. The shared contract defines each check's identifier, target, command or bounded procedure, safety class, required capabilities, timeout, expected signal, failure interpretation, retained evidence, and cleanup obligation. Manual procedures use an explicit target/action/finite-maximum/observation shape, with a finite stopping bound and named observable signal. The project supplies the values without redefining those meanings.

`create-verification-skill` first presents the exact proposed file and requires approval before writing it. `maintain-verification-skill` audits an explicitly supplied definition, proposes a diff, and likewise requires approval before a durable edit. Neither action infers guidance from transcripts or writes `AGENTS.md`, notes, or unrelated skills. If no valid definition exists, `verify-this` records checks justified by repository evidence in a temporary local definition-shaped manifest, marks coverage incomplete, and recommends the creation action. Report validation always receives the selected or transient definition so it can compare exact table schemas, capabilities, check IDs, evidence, and cleanup.

## Evidence, reports, and privacy

Every check ends as `pass`, `fail`, `error`, `skipped`, or `unsupported`, with evidence graded `measured`, `observed`, `agent-reported`, or `unverified`. Only measured or directly observed evidence can support a pass. A launch, cancellation, or cleanup request is not proof that a process exited; cleanup must be established through the execution owner's final state.

The Markdown report is the human verdict artifact. Native command output, JSONL, screenshots, or runtime records remain supporting evidence and are referenced with bounded excerpts. Reports are user-local, session-local, or gitignored by default; they are not tracked project output unless the user explicitly chooses otherwise. Do not include credentials, full transcripts, sensitive session content, or unbounded environment dumps. The validator rejects recognizable common credential values in Authorization Basic/Bearer headers, GitHub tokens, AWS access-key IDs, high-entropy generic key/token/password assignments, PEM private-key headers, and URL userinfo. This closed pattern set catches common accidental disclosures; it does not prove comprehensive secret absence. Phase 1 neither indexes transcripts nor forwards them automatically.

Every declared mutation in `control-cli` requires procedural human approval. Before execution, show the exact command, target environment, expected mutation, timeout, and cleanup plan, then obtain explicit approval. `command-safety` separately provides mechanical enforcement for the destructive command classes it recognizes; its existing policy is not weakened by this protocol. Universal executable enforcement for every possible mutating command is deferred and is not a Phase 1 claim. Independent checks may continue when an optional capability is unavailable, but the affected check remains `unsupported` rather than being simulated.

## Provenance and updates

Each managed skill contains `UPSTREAM-SKILL.md`, preserving its pinned Cursor source, and `UPSTREAM.md`, recording the source path and commit, MIT license, ownership boundaries, local deviations, and re-sync procedure. When updating a skill, fetch the exact upstream revision, keep the preserved source byte-identical, review the adaptation against the shared contracts, update the commit/license/deviation record, and run the agent tests and portability check.

Phase 1 supports direct skill invocation regardless of package availability. The separately managed `pi-workflows` pin and activation status are documented in [Pi workflows](pi-workflows.md); no workflow can resume execution across a process or host restart.
