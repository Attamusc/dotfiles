# Agent tooling roadmap

Date: 2026-10-18
Status: executing; first discovery wave started 2026-10-22
Owner: Sean; execution coordinated through Pi's todo tracker

## Goal and priority

Improve daily project inspection, delegation reliability, workstation diagnosis,
Go code navigation and Grimoire/ACP interoperability on the existing Fedora host.
The user selected these five projects, in this order:

| Priority | Project | Complexity | Expected daily payoff |
| --- | --- | --- | --- |
| 1 | Spin structured, non-mutating status | Low | High across local projects |
| 2 | Diagnose empty subagent findings | Medium–high; cause unknown | Very high for reliable delegation |
| 3 | Read-only workstation readiness report | Medium | High when setup or package state drifts |
| 4 | Go intelligence in pi-lsp | High | High for Spin and weekly-report-cli work |
| 5 | Shared Grimoire/pi-acp compatibility suite | High | High across client/adapter upgrades |

The [seven other ideas](agent-tooling-followups.md) are parked as follow-ups, not
active implementation tickets. Relative priority is a planning judgment, not a
measured productivity result.

## What this plan authorizes

The original request authorized planning and todo creation. On 2026-10-22 the
user said “ok go”, authorizing execution of this roadmap: scoped source changes,
local verification and local commits. Package/runtime installation, publication,
pushes, workstation reconciliation/activation, live provider calls, real-Herdr
live tests and hardware changes remain behind their separate approval gates.

There are **16 new todos** tagged `agent-tooling-roadmap`: five initial
contract/discovery tickets are `ready-for-agent`; eleven downstream tickets are
`draft` at execution start. Spin discovery and subagent diagnosis are claimed by
the coordinating session and delegated to separate repository-scoped workers.
Child todo namespaces differ by cwd; the parent owns authoritative ticket
transitions and passes resolved scope to each child. Existing unrelated todos
and claims are unchanged. The tracker is machine-local; this document preserves the readable
scope/dependency summary but does not replicate full ticket bodies.

Before execution, fetch the ticket with `todo get`, inspect source freshness and
repo conventions, then claim it. Blockers are recorded as `Blocked by:` lines in
the ticket bodies. After a discovery ticket finishes, refine its dependent drafts
with the resulting exact contract, test commands and writable scope before
promoting them. A closed blocker alone does not promote a draft automatically.
If an assumption fails, re-triage rather than silently changing scope.

## 1. Spin structured observational status

Repository: [Attamusc/spin](https://github.com/Attamusc/spin).

### Outcome

Agents can inspect managed application state as versioned JSON without parsing a
colored table or causing cleanup. Human-readable status stays useful. Liveness
and PID-file age must not be overstated as application identity or exact uptime.

### Evidence and scope

The inspected `cmd/status.go` deletes stale `live.pid` records inside the shared
scan. Inspect `cmd/root.go` callers and config loaders as well: a non-mutating
flag on one command is insufficient if shared observation still writes.
Follow `AGENTS.md` and existing isolated Go tests. The preferred new surface is
`spin status --json`; the discovery ticket settles exact fields and exit policy.
No process/database lifecycle redesign or storage migration is included.

A source-specific planning pass reports `cmd/up.go` is another shared-scan caller;
reinspect it along with the dashboard and preserve explicit lifecycle cleanup.
Settle `--json` versus the existing `--format` convention in the initial ticket,
not by adding two interfaces. An extra `spin agent-skill` feature suggested by that
pass is outside this project and has not been added to its scope.

### Tickets and dependencies

1. **TODO-7177c7d1 — Specify structured observational status and regression fixtures.**
   Ready. Define schema, observation/error states, source ownership, host/path
   ambiguity, no-mutation boundary and fixture cases.
2. **TODO-b53c2f69 — Implement JSON status without observation-side mutations.**
   Draft; blocked by TODO-7177c7d1. Change only the approved status/shared callers,
   tests and affected documentation.
3. **TODO-6f70ee74 — Independently prove structured, non-mutating status.**
   Draft; blocked by TODO-b53c2f69. Parse real CLI output and compare before/after
   fixture manifests, including stale/invalid/unreadable state.

Verification baseline: `make test`, `make test-race`, `make vet`, `make build`.
No `make install`, `tidy`, process cleanup or installed-binary replacement.

## 2. Empty subagent findings

Repository: [Attamusc/pi-interactive-subagents](https://github.com/Attamusc/pi-interactive-subagents).

### Outcome

Nonempty findings survive delivery; actual empty output and failures remain
honest and diagnosable. No output is fabricated, no automatic paid retry is added,
and completion intent is never treated as process-exit proof.

### Evidence and scope

Three scout launches in the review session returned “Sub-agent exited without new
output”; one resumed child later returned findings. This is an observed symptom,
not a controlled reproduction or proof of an extraction bug. Compare development,
installed and configured package revisions before diagnosing the wrong source.
Do not inspect historical session JSONLs without a user-selected exact path/leaf.
Use synthetic fixtures and existing lifecycle evidence first.

A subsequent source check found development `7039646` and installed `d57e498`
working-file bytes identical for the four inspected completion/session modules,
but different for `index.ts`. This is a launch-parity lead, not a root cause.
The existing deterministic live harness asserts Pi `0.85.1` and injects a macOS
Homebrew PATH. Review and align that harness with the actual Fedora/Pi runtime
before any separately approved live execution; its current command is not current
runtime compatibility proof.

### Tickets and dependencies

1. **TODO-2c6e541f — Reproduce and localize empty completion findings.**
   Ready. Separate child/provider/launch behavior from transport/extraction/delivery
   faults. Produce a causal fixture or an explicitly inconclusive handoff.
2. **TODO-19ac9885 — Implement the evidence-backed completion fix or diagnostic.**
   Draft; blocked by TODO-2c6e541f. A product fix is conditional on the diagnosis;
   expected empty behavior or an external fault may require re-triage instead.
3. **TODO-154dcbed — Independently validate findings delivery and lifecycle boundaries.**
   Draft; blocked by TODO-19ac9885. Check the affected completion/failure/interrupt
   paths and absence of duplicate delivery or lost findings.

Verification baseline: `npm test` and inspected deterministic integration tests.
The opt-in real-Herdr test, provider prompts, host repin and fresh-Pi rollout need
separate approval. Herdr remains the sole visible pane/session/lifecycle owner.

## 3. Read-only workstation readiness report

Repository: [Attamusc/dotfiles](https://github.com/Attamusc/dotfiles).

### Outcome

One human/JSON report explains baseline availability, safely observable version
or pin drift, optional LSP prerequisites and checks that still need a human.
Missing optional tooling must not become a baseline failure. Static source/pin
alignment must not be described as proof of loaded-package or live Herdr health.

### Scope

Choose one small source helper under `dot_local/bin/`, focused fixture tests and
README documentation. The initial ticket settles the command name, exact check
allowlist, schema, timeout/output bounds and exit semantics. Prefer inert local
metadata. Even a version probe needs review: arbitrary agent startup, configured
project commands, Git hooks, auth probes and network requests are not allowed.
Do not read or print private overlays, credentials, raw environment or arbitrary
command stderr. No repair, install, reconciliation or server initialization.

The source-specific planning pass proposed a smaller alternative:
`python3 -B scripts/workstation-readiness.py [--json]`, repository-local and using
filesystem inspection only, with no subprocesses. Evaluate that before an installed
helper; the initial ticket must settle the path/read allowlist and update the
implementation drafts consistently. Presence alone is not version or activation
proof. The Pi setup hook and workflow package harness are mutating, not doctor probes.

### Tickets and dependencies

1. **TODO-944d16f9 — Define offline checks and privacy-safe output.**
   Ready. Map each check to public source metadata, a safe observation, requiredness
   and a manual/unknown fallback when observation is unsafe or unavailable.
2. **TODO-2d54608b — Implement the observational report and fixture tests.**
   Draft; blocked by TODO-944d16f9. Source-only changes, synthetic HOME/PATH fixtures,
   deterministic status output and no host remediation.
3. **TODO-da744725 — Independently verify non-mutation, privacy and platform limits.**
   Draft; blocked by TODO-2d54608b. Sentinel commands and before/after manifests
   verify the boundary; label Fedora/macOS/interactive omissions explicitly.

Verification baseline: the contract's focused test command plus
`scripts/check-portability.sh`, with mutation-capable phases isolated and protected
ignored state checked. No `chezmoi apply`. Real macOS and interactive Herdr/package
smoke remain user-owned; Ubuntu/macOS template rendering is not runtime proof.

## 4. Go intelligence in pi-lsp

Repository: [Attamusc/pi-lsp](https://github.com/Attamusc/pi-lsp).

### Outcome

Go projects gain bounded definition, references, hover, workspace-symbol and
explicit diagnostic queries through the existing single read-only tool. Result
coordinates remain UTF-16, coverage is honest and other backends do not regress.

### Evidence and prerequisites

Planning inspected package 0.3.0, contract v3, revision
`9496ab5a4fd6309c5647e4f358d1b6a0b0ff8409`. It supports TS/JS, Rust and Ruby;
`gopls` was absent from this host's PATH. The server remains optional and
machine-owned under [ADR-0008](adr/0008-semantic-intelligence-as-a-pi-package.md).
A human must approve/provision the exact runtime after the launch contract is
settled; no bootstrap manifest silently acquires it.

### Tickets and dependencies

1. **TODO-26d6912f — Define bounded gopls launch and result contract.**
   Ready. Establish tested versions, offline/no-source-mutation behavior,
   `go.mod`/`go.work` trust/root selection, readiness and diagnostic meaning.
   If server safety cannot be established, stop rather than weaken the boundary.
2. **TODO-5cf86f0f — Implement approved backend with deterministic fixtures.**
   Draft; blocked by TODO-26d6912f. Preserve existing tool shapes and lifecycle
   ownership, with fake-server error/cancellation/staleness/containment cases.
3. **TODO-364aa0e7 — Independently verify native behavior and unchanged backends.**
   Draft; blocked by TODO-5cf86f0f and operationally gated on the approved gopls
   prerequisite. Real native fixtures and before/after workspace evidence are
   mandatory; skipped runtime checks are not passing native coverage.

Verification baseline: `npm test`, `npm run typecheck`, `npm run pack:check`, plus
the documented opt-in native argv selected by the contract. No formatting/code
actions, automatic diagnostic calls, runtime install, package release or host pin
update. Installed package directories are evidence, never writable source targets.

## 5. Grimoire/pi-acp compatibility

Repositories: [Attamusc/pi-acp](https://github.com/Attamusc/pi-acp) and
[Attamusc/grimoire](https://github.com/Attamusc/grimoire).

### Outcome

One deterministic compatibility matrix proves the real Grimoire client and real
pi-acp adapter interoperate across the operations the app actually uses. Shared
fixtures remain synthetic; private implementation and vault data stay private.

### Evidence and scope

`pi-acp/docs/acp-bench.md` already describes a reusable fixture/lifecycle runner.
Grimoire already has deterministic ACP fixtures and concurrent capacity
measurements. Connecting them must cross actual production client/adapter
boundaries: an SDK fixture passing against another fixture is not app integration.
The inventory must identify any client filesystem/terminal/MCP requirements rather
than quietly assuming acp-bench supplies them. Provider/Pi RPC behavior should be
fake and offline; production protocol mapping should not be fake.

A late planning handoff raised a possible runtime migration as a reason to defer
ACP. That migration/priority change is not verified or approved in this parent
conversation. The discovery ticket must check the current target before freezing
fixtures; it must ask for an owner decision if a migration changes that target.
The selected five-project scope and four ACP tickets remain unchanged meanwhile.

### Tickets and dependencies

1. **TODO-4c3782e1 — Inventory compatibility and select deterministic scenarios.**
   Ready. Cite actual capabilities/operations, choose the minimal test seam, exact
   candidate pairing and golden schema, and refine both worker scopes.
2. **TODO-f6bbcd7c — Add provider-free adapter fixtures and compatibility cases.**
   Draft; blocked by TODO-4c3782e1. Owner: pi-acp only. No private Grimoire code or
   data may be copied into the public repository.
3. **TODO-f5565a7c — Exercise the real Grimoire client against the adapter candidate.**
   Draft; blocked by TODO-4c3782e1. Owner: Grimoire only. Can develop alongside the
   adapter worker once the shared fixture contract is stable; paired execution
   needs the corresponding adapter build.
4. **TODO-8671d652 — Independently validate the paired compatibility matrix.**
   Draft; blocked by TODO-f6bbcd7c and TODO-f5565a7c. Verify exact revisions,
   isolation/cancellation/denial/failure cases, a deliberate negative case, bounded
   cleanup and one reproducible paired command.

Known adapter commands include `npm run build` and `npm run test:bench`; discover
full client/Rust/UI commands from both repositories' instructions. Don't claim UI,
macOS or live-provider coverage from client-only tests. No personal vault, live
model, credential use, application install, release or host activation.

## Execution, ownership and gates

- Suggested first execution wave: Spin discovery and empty-subagent diagnosis,
  at most two concurrent investigations. Readiness can follow; Go and ACP discovery
  are independent and need not wait for unrelated projects to ship.
- Each initial investigation is one bounded session: roughly 60 minutes for Spin
  or readiness, 90 for subagents/Go/ACP, then an evidence/blocker handoff rather than
  an unattended retry loop. These are investigation stop points, not delivery estimates.
- Assign one writable owner per repository/path set. ACP may fan out into its two
  distinct repositories after its shared contract is stable. Same-repo parallel
  workers need isolated VCS workspaces and an integration owner, not shared edits.
- Pi and Herdr's existing host integration own agent lifecycle. This roadmap adds
  no process/pane/session/status machinery. Fixture subprocesses remain owned and
  bounded by the existing package test harnesses.
- Implementation and verification are separate. The orchestrator runs commands;
  independent reviewers receive bounded diffs, contracts, exact argv/exit/output
  and omissions. Security-sensitive/read-only and integration boundaries require
  independent validator approval, not producer self-certification.
- Dispose only runner-owned temporary state after owned-process exit is proven.
  Never clean live project/private roots. Preserve partial evidence and stop on
  repeated failure, contradictory findings, unsafe mutation or missing ownership.
- Each project's completion means its scoped code/docs and measured validation are
  accepted. Publication, managed pin changes, installation/reconciliation and live
  smoke are separate user-approved rollout steps. No automatic activation follows
  a green test suite.

## Planning evidence and limitations

The plan is based on GitHub metadata, READMEs, selected source/tests, public local
configuration and tool availability. No product tests, benchmark suites, provider
calls, package installations or hardware checks were run for the planning request.
Execution evidence must be recorded per ticket; starting work does not change those
planning observations into measured proof. Source observations and prior child
reports are leads, not proofs of unseen code behavior. Every initial task must
reconcile current state before relying on them.
