---
name: control-cli
description: "Select an existing host capability for bounded CLI execution and require approval, lifecycle ownership, and exit evidence. Use for controlled commands, visible interactive Pi agents, or repeatable saved pipelines."
---

# Control CLI

Select and govern an existing execution capability. This skill is a procedural adapter: it does not implement a terminal, PTY, daemon, pane manager, process supervisor, status reporter, session store, or transcript store.

## Classify and Select

Classify the requested interaction before launch and use exactly one approved owner:

| Need | Existing owner | If unavailable |
|---|---|---|
| ordinary command | Pi `bash` + `command-safety` | `unsupported` |
| visible interactive Pi agent | `pi-interactive-subagents` + Herdr | `unsupported` |
| repeatable saved pipeline | `pi-workflows` after its activation gate | use direct checks or `unsupported` |

Do not improvise a substitute runtime. A repository-native checked-in test may be run as an ordinary command, but its processes remain owned by Pi `bash` and its declared timeout. If the request needs terminal interaction that none of the approved owners provides, report `unsupported` and explain the missing capability.

## Preflight

Before every launch, declare:

- interaction class and selected owner;
- exact command or exact subagent/workflow invocation;
- working directory and target environment;
- safety class: `read-only` or `mutating`;
- expected filesystem, repository, service, or external-state mutation;
- timeout or concrete stopping condition;
- output-capture boundary and evidence path;
- cleanup obligation and the host capability that owns it;
- owner-provided signal that will prove completion and process exit.

For every mutating interaction, show the full preflight and obtain explicit user approval before launch. Approval is specific to that command, target, and mutation. Pi `bash` remains subject to `command-safety`; destructive commands must pass its interactive confirmation and are blocked when confirmation is unavailable. Do not treat earlier approval, task assignment, or skill invocation as approval for a mutation.

Do not launch when the timeout, stopping condition, cleanup owner, or exit signal is unknown. Never put credentials in commands or retained evidence.

## Execute Through the Owner

### Ordinary command

Use Pi `bash` with the declared `cwd` and timeout. Retain only the bounded command output or artifact needed to support the result. The `bash` result and exit code are the completion evidence. If the command starts children, completion additionally requires evidence from the owner that the command and its owned children exited; otherwise report cleanup as unverified, not complete.

### Visible interactive Pi agent

Use `pi-interactive-subagents` with `interactive: true`; Herdr owns the visible surface and process lifecycle. Record the returned run identity and session identity so later interrupt, terminate, resume, status, and completion evidence remain correlated to the same run.

Use interruption and termination according to the owner contract:

- `subagent_interrupt` interrupts the active model turn. The pane, session, watcher, and running entry remain alive. Its acknowledgement is not exit evidence.
- `subagent_terminate` requests a hard stop. Its acknowledgement may still leave termination unconfirmed.
- Completion requires the owner's correlated result or status proving wrapper/process exit or confirmed absence of the recorded child process.

Do not infer exit from a keypress, a quiet pane, a cancellation request, an interrupt acknowledgement, or a terminate request. If the owner cannot prove exit, report cleanup as unverified and the interaction as incomplete.

Do not read, copy, expose, or store the session transcript through this protocol. Reference only the owner-provided run/session identifiers and bounded result or evidence artifact.

### Repeatable saved pipeline

Use `pi-workflows` only after its activation gate has passed for the current installation. The workflow runtime owns execution, persistence, timeouts, and cleanup. Until that gate passes, run independently useful checks directly through approved owners; if direct execution cannot satisfy the need, report `unsupported`.

## Completion Report

Report:

- selected interaction class and owner;
- approval outcome for a mutation, if any;
- bounded evidence reference and observed result;
- timeout or stopping-condition outcome;
- cleanup owner;
- owner-provided process-exit evidence;
- final state: `complete`, `incomplete`, or `unsupported`.

Use `complete` only when the selected owner reports the expected result and proves that no process owned by the interaction remains. A request or acknowledgement to cancel, interrupt, close, or terminate is never sufficient completion evidence.
