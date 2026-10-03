# Upstream

This skill adapts Cursor Team Kit's `control-cli` skill into a capability-selection and safety protocol for the existing Pi execution owners.

- Source: https://github.com/cursor/plugins/blob/889ec4b68fa5aab0e867dad71ec3fdf386ae48f3/cursor-team-kit/skills/control-cli/SKILL.md
- Repository: https://github.com/cursor/plugins
- Path: `cursor-team-kit/skills/control-cli/SKILL.md`
- Commit: `889ec4b68fa5aab0e867dad71ec3fdf386ae48f3`
- License: MIT

## Preserved upstream content

- `UPSTREAM-SKILL.md` is the pinned upstream `SKILL.md`, byte-identical.

## Ownership

- The local skill owns only interaction classification, capability selection, preflight requirements, and completion-evidence rules.
- Pi `bash` and `command-safety` own ordinary command execution and destructive-command approval.
- `pi-interactive-subagents` and Herdr own visible interactive Pi-agent surfaces, run/session identity, interruption, termination, status, and process-exit proof.
- Herdr alone owns persistent controlled-agent peer panes, processes, and attention state; peer turns and eventual cleanup are distinct.
- `pi-workflows` owns saved pipelines only after its activation gate passes.

## Local deviations

- Removed runtime and harness construction. The adaptation never creates a PTY, daemon, pane manager, process supervisor, status reporter, session store, or transcript store.
- Removed upstream multiplexer ownership and all fallback multiplexer guidance. Herdr is the sole supported multiplexer for visible Pi subagents.
- Removed temporary PTY scripts, direct key injection, screen capture, inspector recipes, recording, and transcript duplication.
- Replaced harness selection with a closed capability table. Missing approved capabilities produce `unsupported` rather than an improvised runtime.
- Added a mandatory preflight declaring the exact invocation, target, mutation, timeout or stopping condition, capture boundary, cleanup owner, and evidence path.
- Added explicit approval for every mutating interaction and retained `command-safety` as the destructive-command approval owner.
- Preserved interactive-subagent run/session correlation and its distinction between interrupting an active turn and requesting hard termination.
- Retained the Pi-child owner-proven process-exit completion rule; cancellation, interrupt, and termination-request acknowledgements do not establish completion.
- Added a distinct persistent Herdr peer class, exposed in skill discovery: host-discovered harness/provider/model, supported restriction/configuration preflight before approved launch, and separate runtime capability observation at startup or first turn. Neither flags nor model self-report certify isolation; missing preflight support prevents launch, while uncertain runtime behavior stops substantive work and retains the peer for human review.
- Require exactly one submitter and one outstanding prompt per peer. Post-submission working permits later settlement and bounded answer assessment; immediate blocked activity requires a human pause without prior working. An agreed retention window and separately approved Herdr removal/exit proof keep turn settlement distinct from peer cleanup and Pi-child completion; trust and permission prompts are never auto-accepted.
- Prohibit exposing or duplicating session transcript contents; reports reference bounded native evidence instead.

## Re-sync

1. Fetch the upstream file at the pinned commit into `UPSTREAM-SKILL.md` without modification.
2. Review upstream changes only for improvements to classification, preflight, evidence, or cleanup semantics.
3. Preserve the local execution-owner boundaries and fail-closed behavior.
4. Update the commit, license, and deviations above.
