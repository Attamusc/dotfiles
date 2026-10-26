# Agent tooling roadmap

Date: 2026-10-18
Status: twelve todos complete; ACP paused for owner decision
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
local verification and local commits. At that point, installation, pushes and
activation were excluded. On 2026-10-26 the user authorized pushing and locally
activating the four completed projects, including their scoped package/tool pins.
ACP, live provider calls, real-Herdr tests and hardware changes remain out of scope.

The roadmap contains **16 todos** tagged `agent-tooling-roadmap`. At execution
start, five discovery tickets were ready and eleven downstream tickets were drafts.
The parent owns authoritative ticket transitions and passes resolved scope to
repository-scoped children, whose todo namespaces differ by cwd. Existing
unrelated todos and claims are unchanged. The tracker is machine-local; this
document preserves readable scope/dependencies, not the full ticket bodies.

Before execution, fetch the ticket with `todo get`, inspect source freshness and
repo conventions, then claim it. Blockers are recorded as `Blocked by:` lines in
the ticket bodies. After a discovery ticket finishes, refine its dependent drafts
with the resulting exact contract, test commands and writable scope before
promoting them. A closed blocker alone does not promote a draft automatically.
If an assumption fails, re-triage rather than silently changing scope.

## Local rollout checkpoint — 2026-10-26

- Spin `a230a1a1c420` is pushed and installed through mise at
  `0.0.0-20261022014811-a230a1a1c420`. Installed structured status JSON passes.
- The subagent fix was rebased unchanged onto current main as `5e2c4ef`; all
  **291 tests pass**, with no skips. The installed pin `952aff8` includes that fix
  and preserves a newer concurrent update rather than downgrading it.
- pi-lsp `c548647` (0.4.0) is pushed and installed. Stock gopls v0.23.0 and the
  telemetry-off private profile are provisioned persistently outside workspaces.
  All five Go operations and empty/error/corrected snapshots pass against the
  installed service using this profile. Spin's public module dependencies are
  cached; other projects still need their dependencies provisioned per contract.
- Managed package/tool pins and Linux Go environment are updated. Local mise
  changes preserve unrelated configuration. The readiness helper runs directly
  from this repository: **15 tests pass**, observed `baseline:clear`,
  `runtime:unverified`. Full Fedora/macOS portability checks pass.

Existing Pi processes retain their loaded extensions and environment; restart Pi
from a fresh shell to load the new versions. No daemon, provider or ACP rollout
is implied. Unrelated local planner commits are not part of the dotfiles push.

## Go completion checkpoint — 2026-10-26

Go's three tickets are complete in local pi-lsp commit `c548647` (package 0.4.0,
contract v4). The existing tool supports all five operations using unchanged stock
gopls v0.23.0 and Go 1.26.5 on Linux; diagnostic snapshots are explicitly partial.
Normal tests pass **182 cases, with five opt-in skips**; the separate real-gopls
smoke test passes navigation and empty/error/corrected diagnostic snapshots.
Typecheck and package dry-run pass. Independent Claude functional validation is
PASS. Nothing was pushed or activated; ACP remains paused.

The user explicitly replaced the over-scoped sandbox/syscall/SIGSTOP proof work
with normal tests, one functional integration fixture, review and a local commit.
The unused proof machinery is not a remaining release gate or a security claim.

## Earlier execution checkpoint — 2026-10-22

- **Nine of sixteen todos are complete:** all three tickets for Spin, the bounded
  subagent-diagnostic slice and workstation readiness. All three scoped
  implementations passed independent Claude CLI validation and are committed
  locally. No packages or home configuration were activated.
- Spin contract: `febf392085ce`; implementation: `a230a1a1c420`, under
  `~/projects/github.com/attamusc/spin`. Parent-run tests, race checks, vet, build
  and postcommit verbose CLI fixtures pass on Fedora. A deliberately restored
  stale-PID deletion failed the manifest test; exact source restoration went green.
  macOS and installed-binary runtime proof remain outside this completed scope.
- Subagent diagnosis: `3d3b2c6`; fix: `af61042`, on `roadmap/empty-findings` under
  `~/projects/pi-interactive-subagents-empty-findings`. Parent postcommit
  `npm test` passes 255 tests, none skipped. Claude caught a precedence bug in an
  earlier candidate; corrected fallback now preserves all structured lifecycle
  errors. Synthetic observer and parent-summary proof does not attribute the
  earlier live scout failures. Real-Herdr/provider/runtime gates remain intact.
- Earlier Pi-backed diagnostic/validator failures caused a pause. The user then
  approved Claude CLI seats and explicitly made `claude-reviewer` and
  `claude-validator` the default. Managed instruction commit: `9d7be0a0`.
  No home instructions, packages or installed runtimes were reconciled/applied.
- Readiness contract: `014a5fd68574`; implementation: `5762c00dcd5a`. All three
  readiness tickets are complete. Parent postcommit tests pass 15 cases, full
  portability checks pass, and final Claude CLI validation is PASS. Known
  `.config` aliases are protected before excluded-child metadata. A safe Fedora
  observation reports `baseline:clear`, `runtime:unverified`; this is not version,
  pin, auth, activation or health proof. No home helper was installed.
- Go discovery TODO-26d6912f is `needs-info`. Research is preserved at local
  pi-lsp commit `4dee150`, not approved implementation. Its historical pair would
  exclude Spin's Go 1.25.5 module. Official current-tag metadata identifies
  gopls v0.23.0 as a candidate for this Go 1.26.5 host; compatibility, launch safety
  and native tracing remain unproven. Server/tracer provisioning needs approval.
- ACP discovery TODO-4c3782e1 is `needs-info`: the intended production client
  supplies session-scoped MCP servers, while pi-acp rejects them before startup.
  Owner must choose scoped MCP integration or a reduced/negative protocol probe,
  not a false full-compatibility pass. No inspected migration decision justified
  discarding this work. Detailed private inventory stays in local ignored plans.
- All source commits are local; nothing has been pushed or activated.

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
Follow `AGENTS.md` and existing isolated Go tests. The accepted surface is
`spin status --format json`, specified in Spin's `docs/status-contract.md`.
No process/database lifecycle redesign or storage migration is included.

A source-specific planning pass reports `cmd/up.go` is another shared-scan caller;
reinspect it along with the dashboard and preserve explicit lifecycle cleanup.
The completed discovery chose the existing `--format` convention, not two
interfaces. An extra `spin agent-skill` feature suggested by that
pass is outside this project and has not been added to its scope.

### Tickets and dependencies

1. **TODO-7177c7d1 — Specify structured observational status and regression fixtures.**
   Done. Defined schema, observation/error states, source ownership, host/path
   ambiguity, no-mutation boundary and fixture cases.
2. **TODO-b53c2f69 — Implement JSON status without observation-side mutations.**
   Done after TODO-7177c7d1. Implemented approved status/shared callers,
   tests and affected documentation; committed as `a230a1a1c420`.
3. **TODO-6f70ee74 — Independently prove structured, non-mutating status.**
   Done after TODO-b53c2f69. Claude CLI validation passed, backed by real CLI
   fixtures and negative-control sensitivity; platform omissions remain explicit.

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
   Done. Reproduced a hidden output-read/parse diagnostic fault with synthetic
   fixtures; earlier live failures remain unattributed.
2. **TODO-19ac9885 — Implement the evidence-backed completion fix or diagnostic.**
   Done after TODO-2c6e541f. Committed the narrow diagnostic fix as `af61042`,
   preserving existing errors, empty-output policy and process facts.
3. **TODO-154dcbed — Independently validate findings delivery and lifecycle boundaries.**
   Done after TODO-19ac9885. Independent Claude CLI validation passed for the
   declared synthetic observer/consumer contract, not full live recovery.

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

The accepted [readiness contract](workstation-readiness-contract.md) selects
`python3 -I -S -B scripts/workstation-readiness.py [--json]`, repository-local and
filesystem-only, not an installed helper. Fixed check IDs, output/exit semantics,
input limits, privacy exclusions and manual gates are explicit. Isolated startup
disables Python environment/site hooks; a trusted interpreter is still required.

No subprocesses, version/auth probes, arbitrary project commands, Git hooks,
network/client calls, server startup, installs or repairs. No private overlays,
credentials, merged settings, session data or raw environment/output dumps.
Presence alone is not compatible versions, configured pins or activation proof.
The Pi setup hook and workflow package harness are mutating, not doctor probes.

### Tickets and dependencies

1. **TODO-944d16f9 — Define offline checks and privacy-safe output.**
   Done. Committed the filesystem-only contract as `014a5fd68574`, including
   privacy/unknown/manual semantics and isolated Python startup.
2. **TODO-2d54608b — Implement the observational report and fixture tests.**
   Done after TODO-944d16f9. Helper/tests, documentation and isolated portability
   wiring committed as `5762c00dcd5a`; no home installation or apply.
3. **TODO-da744725 — Independently verify non-mutation, privacy and platform limits.**
   Done after TODO-2d54608b. Claude CLI validation passed; 15 tests and portability
   checks pass, with synthetic platform/permission and unknown-alias limits explicit.

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
   Done. Contract v4 documents stock gopls v0.23.0 / Go 1.26.5, Linux modules,
   provisioned tools/profile and partial versioned push diagnostics.
2. **TODO-5cf86f0f — Implement approved backend with deterministic fixtures.**
   Done in `c548647`; existing tool shapes and lifecycle ownership are preserved.
3. **TODO-364aa0e7 — Independently verify native behavior and unchanged backends.**
   Done under the user-approved functional scope: normal tests, one real Go
   navigation/error/correction smoke test, typecheck, packaging and Claude review.
   Native Rust/Ruby were not rerun; no hostile-workspace sandbox guarantee is made.

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

The bounded inventory found no migration decision in the inspected sources, so
migration hearsay does not justify discarding these tickets. Instead, the intended
production pair has a capability mismatch: the client supplies session MCP servers
and pi-acp explicitly rejects them before startup. Owner must authorize scoped MCP
integration or accept only a clearly reduced/negative protocol probe. Do not strip
MCP or bypass client authority to manufacture a full-compatibility result.

### Tickets and dependencies

1. **TODO-4c3782e1 — Inventory compatibility and select deterministic scenarios.**
   Needs info. Source-verified session-MCP incompatibility blocks positive app
   compatibility. Local private inventory preserves pins, matrix and candidate seams;
   owner decision on MCP scope precedes downstream implementation.
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
