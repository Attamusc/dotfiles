# Pi harness capability evolution: first-tranche reconnaissance

Date: 2026-09-08. Scope: composition, package precedents, execution ownership,
and follow-up hypotheses. Implementation/verification evidence belongs in the
standalone package and the rollout record, not in this reconnaissance summary.

## Decisions

[ADR-0008](../docs/adr/0008-semantic-intelligence-as-a-pi-package.md) classifies
ownership before implementation. Build `pi-lsp` independently; keep language
servers optional and machine-owned. Add neither a Job framework nor a workflow
controller. No changes to Herdr, subagents, or workflow execution in this tranche.

The citation tokens in the originating brief are not retrievable source links.
The findings below instead use inspected repository files, installed package
revisions, and current local CLI/API documentation.

## Composition and package precedents

| Source | Observed contract | Implication |
|---|---|---|
| `.data/pi/agent/settings.json` | Git capability packages; only explicitly enabled local extension is smart-sessions | Add a package entry, not a local LSP extension |
| `dot_pi/agent/settings.json.tmpl` | Public/private JSON merge | Do not rewrite personal overlays |
| `.chezmoiscripts/run_onchange_after_30-setup-pi.sh.tmpl` | `pi update --extensions`, then managed Herdr integration | Existing installer reconciles a new published pin |
| `scripts/check-portability.sh:1109-1140` | Exact package list; personal Git packages use full commit SHAs except hunk-review release tag | Pin one tested SHA and update the rendered contract |
| `README.md`, Machine-local configuration | Extra toolchains and language servers are machine-owned | Do not add server executables to shared manifests silently |

Inspected installed package checkouts under `~/.pi/agent/git/github.com/Attamusc`:

- `pi-interactive-subagents` at `fa7600194341071e722692da20f5e1f8d087c26d`:
  `pi.extensions` manifest, peer dependencies, unit/integration tests, independent
  pane/process/session lifecycle. Useful process-boundary testing precedent;
  not a reason to reuse its terminal backend for LSP.
- `pi-television` at `c3826bc268e05a1045e1d2339fc5a0cd3fd17a7e`:
  small `src/index.ts` manifest package. Useful minimal adapter precedent.
- `pi-hunk-review` at `7330ad702860bbe4e0032f1550d7ce4f123e0be1` (`v0.1.1`
  in settings): independent Pi package, package tests, Rust core tests, and
  versioned release/install contract. Its binary release bootstrap is unnecessary
  for an LSP client that uses optional machine-installed servers.

`pi-television` still imports the older `@mariozechner` namespace. New work must
use the actual installed Pi API rather than copying namespace details blindly.
Installed Pi **0.85.1** `docs/packages.md` documents `@earendil-works` host peer dependencies,
`typebox`, `pi.extensions`, runtime npm dependencies, local package development,
Git commit/tag pins, and pin reconciliation. The Homebrew path still contains
`0.84.3`, but both `pi --version` and the installed package manifest report
`0.85.1`; directory naming is not version evidence. A local path is not a portable pin.

A separate local `pi-observability` checkout exists at
`~/projects/github.com/Attamusc/pi-observability`. Its `README.md` describes batched
session events sent to a loopback HTTP/SQLite service, not a shared library for
content-free per-operation metrics. It is not in the public package list.
Reusing or extracting its telemetry is not a prerequisite for LSP. Revisit only
when there are two consumers of the same concrete metric contract.

## Pi/LSP contract findings

The installed Pi `docs/extensions.md`, `docs/sdk.md`, `docs/sessions.md`,
`docs/session-format.md`, and `dist/core/extensions/types.d.ts` establish:

- Extension factories may load without a session: start servers lazily, not at
  module load. `session_shutdown` covers quit, reload, new, resume, and fork.
- Tool execution receives `(toolCallId, params, signal, onUpdate, ctx)`;
  sequential execution is available for document-sync/request transactions.
- Tool result `details` are session data. Thrown execution errors produce Pi's
  `isError`; returning text saying “error” does not. Failure instrumentation must
  account for this distinction rather than hide failures as ordinary successes.
- Custom session entries support durable extension state. They are unnecessary
  for a reconstructible LSP connection cache.
- A later diagnostics experiment can use tool events rather than replacing
  built-in edit/write. No such hook is added in the first slice.

Research against the [LSP specification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/)
and [TypeScript-language-server sources](https://github.com/typescript-language-server/typescript-language-server)
found that the initial handshake needs `initialize` before document messages,
then `initialized`. Use `rootUri` (the TS server reads it), UTF-16 positions,
correct TS/JS language IDs, and `processId`. Disable automatic typing acquisition
to avoid package downloads as a side effect of navigation. Servers and project
toolchains are executable code: this is not a sandbox for untrusted repositories.

The TS server advertises incremental document sync. Do not assume it has agreed
to full-sync notifications. A balanced open/query/close transaction is a simple
candidate; retained documents require negotiated updates and disk freshness,
including other previously opened files. Real-server changed-file tests decide
whether the chosen implementation meets that contract.

Registry checks observed `vscode-jsonrpc@9.0.2`,
`vscode-languageserver-protocol@3.18.3`, and
`typescript-language-server@6.0.0` (Node >=22.22.2). Pi host imports use peer
dependencies. Server and TypeScript development fixtures must not become an
implicit global install; normal tool execution must not invoke downloading
`npx`. Local SDK research loaded Pi's shipped hello extension with no loader
errors; that verifies the test approach, not the as-yet-unverified LSP package.

## Herdr: verified capabilities and limits

Inspection used installed **Herdr 0.8.2**, CLI help, its API schema, and the pinned
subagent package. Exact read-only commands: `herdr --version`, `herdr pane --help`,
`herdr agent --help`, `herdr agent prompt --help`, `herdr agent wait --help`, and
`herdr api --help`. Captured output is locally available at
`/tmp/pi-lsp-herdr-help.txt`; rerun these commands against that version to verify
CLI flag details below. No panes or processes were changed by reconnaissance.

| Requirement | Evidence / available operation | Limit |
|---|---|---|
| Visible terminal topology | `herdr pane split`, move, rename, close | Pane location is not durable logical task identity |
| Run terminal-native work | `pane run`, `send-text`, `send-keys` | Terminal input, not a captured subprocess protocol |
| Process inspection | `pane process-info`, `api snapshot` | Live observation, not an immutable execution record |
| Read output | `pane read --source visible\|recent\|recent-unwrapped --lines N` | Terminal/scrollback, not guaranteed complete stdout/stderr |
| Wait for terminal output | `pane wait-output --match/--regex --timeout MS` | Explicit caller timeout required; stopping wait is not cancellation |
| Agent startup and inspection | `agent start`, list/get/read/attach | Recognized live occupant, not individual task history |
| Agent prompting | `agent prompt --wait --until ... --timeout MS` | Help explicitly says it does not track turns; an already-working turn may satisfy wait |
| Lifecycle wait | `agent wait --until idle\|working\|blocked\|done\|unknown --timeout MS` | Without timeout waits indefinitely |
| Reconstruction | `api snapshot` includes runtime/session metadata | Must reconcile mutable runtime with package-owned task evidence |
| Socket events | `api schema --json` advertises event/subscription types | No persistent subscription CLI found; supported subscription behavior not proven here |

`agent prompt --help` also documents rejecting already-blocked agents before
input, a 5-second observed-state-change requirement for accepted submissions
from non-working states, and indefinite settlement waits without `--timeout`.
A common abstraction must not mislabel these observations as per-turn completion.

### Actual consumers

| Consumer | PTY / visibility | Interaction | Persistence | Lifecycle authority |
|---|---|---|---|---|
| Existing visible Pi children | Required | Operator may take over | Independent of parent turn is useful | Subagent package plus Herdr's managed identity/status |
| Persistent watch/dev process | Candidate only; no shared recurring implementation identified in inspected active dotfiles | Depends on program | Often useful | Not established by this investigation |
| LSP service | Neither needed | Machine protocol only | Normally tied to owning Pi | LSP package's child process and JSON-RPC connection |
| Short launcher/VCS commands | No | No | No | Existing subprocess API and exit code |

The subagent package already contains a useful boundary over **visible delegated
agents**. `pi-extension/subagents/cmux.ts` (historical filename) implements the
Herdr socket adapter, pane creation/input/read/close, and completion sidecars;
`index.ts` owns launch and supervision. It does not currently route launches
through Herdr `agent.start`/`agent.prompt` or persistent event subscriptions.
Its socket adapter uses bounded one-request connections.

Do not broaden subagents into a generic process runner solely because some
lifecycle verbs look similar. No second demonstrated visible-work consumer was
found, so a new Job interface is not justified yet. LSP does not count toward
that justification: it needs piped JSON-RPC and strict ownership, not a PTY.

### Duplication worth investigating, not changing

- Subagents has separate activity/status observation, widget timers, completion
  sidecars, and reload cleanup (`index.ts`, `activity.ts`, `status.ts`, `cmux.ts`).
  These are several lifecycle mechanisms **within one owner**, not evidence of
  competing dotfiles Job implementations. Check whether any report conflicting
  completion states before attempting consolidation.
- `diagnose-and-fix.ts` and `deep-review.ts` both wrap short bounded VCS commands;
  `investigate.ts` separately enumerates a bounded manifest. This is small command
  policy duplication, not long-running process supervision.
- No second active dotfiles Herdr status reporter should be added: ADR-0007 gives
  managed Pi status and Session identity to Herdr. Historical external pi-herdr
  code is not an additional supported runtime owner.

## State reconstruction: focused hypotheses

These are source-level risks to test, not reproduced defects.

1. **Subagent reload:** `index.ts:61-84` uses global-symbol timers and an abort
   controller to stop stale pollers. Activity snapshots encode child IDs and
   phases; `status.ts` handles invalid/missing/wrong-ID data. Test reload during
   launch/completion and exactly-once delivery before changing this boundary.
2. **Subagent observation:** `index.ts:872-924` reads durable activity, with
   transcript-derived progress when unavailable. Stale/wrong-child snapshots
   must not authorize completion or mandatory-review discharge.
3. **Smart-session naming:** `smart-sessions/index.ts` reconstructs `named` on
   session start, but async name generation later calls `setSessionName` without
   checking that the initiating session is still current. Test a session switch
   during generation; this is naming state, not an authorization issue.
4. **Todo ownership:** local todo code stores `assigned_to_session` and derives
   session identity. Test restart, stale claims, and cross-project delegation.
   During this tranche, a worker launched in a different cwd could not retrieve
   the parent's todo because stores are project-scoped; the parent claimed it
   and supplied resolved scope. That is an observed handoff constraint, not proof
   that persistence itself is broken.

LSP process handles/capabilities are reconstructible caches. No persisted PID or
new workflow state store is needed for this slice. Work that controls whether a
mandatory review has completed must not be modeled as an LSP cache.

## Workflow control: repeated shape, no new primitive yet

Inspected `dot_pi/agent/workflows/{investigate,diagnose-and-fix,deep-review,iterate-pr}.ts`
without invoking them or the saved-workflow catalog.

| Workflow | Control shape | Existing bounds / outcome |
|---|---|---|
| investigate | Enumerate → parallel scouts → synthesis → independent verification | 160-file manifest, concurrency 4, budget, phase timeouts, checkpoints, partial reports |
| diagnose-and-fix | Diagnose → mutate → verify → review | Per-phase 15-minute timeout, budget, stage errors; mutation is an explicit separate phase |
| deep-review | Enumerate → single review or per-file fan-out → synthesis | 12-file maximum, threshold 8, concurrency 3, budget, partial reports |
| iterate-pr | Fresh worker context → parse result → checkpoint → repeat/stop | Maximum 6 passes, 20-minute pass timeout, budget, GREEN/BLOCKED/NO_PR terminals |

Three workflows share staged delegation and two share fan-out/synthesis, but
`pi-workflows` already supplies spawn, parallel/map, budget, checkpoint, usage,
and report. Only iterate-pr here implements a retry-until-outcome loop. The
remaining complexity mostly expresses distinct policy: trusted scope,
independent review, mutation permission, partial-evidence reporting, and stopping
conditions. A Director would move that policy without demonstrating simplification.

**Answer:** there is insufficient evidence that two or three workflows would
materially benefit from another multi-turn primitive. Leave them unchanged.
A narrower future investigation could test structured terminal results and
checkpoint reconstruction in the existing workflow package. In particular,
iterate-pr's first regex match can accept a status mentioned earlier in prose,
and unparseable successful output currently spends another pass. These are
candidate focused tests, not a mandate for a new controller.

## Next tranche and measurement gates

1. Finish the independent TS/JS definition/reference slice, lifecycle tests,
   package-load test, and reviewed published revision. Keep current behavior
   unchanged while integration is unverified.
2. Add explicit hover/workspace-symbols/diagnostics with documented per-server
   asynchronous diagnostic semantics, then Ruby and Rust fixtures. Investigate
   actual server initialization before claiming support.
3. Run paired tasks with and without the package, identical model/effort/budget,
   and no prompt telling the model to use LSP. Include cross-file callers,
   misleading textual matches, and edited documents. Record correctness against
   an answer key, grep/read/bash counts, retries, task duration, and natural LSP
   selection. Small samples establish observations, not general superiority.
4. Measure operation duration, status/error class, result count/bytes, language,
   server, and contract version from structured tool details. Source-bearing
   semantic results remain ordinary session data; measurement exports must omit
   them. Do not treat response bytes as token counts or telemetry as task quality.
5. Consider post-edit diagnostics only after explicit diagnostics add useful
   information. Consider rename/code actions only after read-only value is shown.
6. Revisit jobs only with a second concrete consumer and requirements. Investigate
   watch/dev processes before assuming PTYs or durable agent lifecycle fit them.
   Keep DAP and semantic mutation outside this tranche.

Open questions remain open: LSP task-performance improvement, automatic
feedback value, and safe semantic mutation have not been established by
reconnaissance or a package smoke test.
