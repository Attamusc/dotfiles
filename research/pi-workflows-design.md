# pi-workflows — Extension Design (v1)

> Design doc for the `pi-workflows` extension. Closes the orchestration gap with Claude Code's Dynamic Workflows while keeping pi's conversational, process-isolated, human-in-loop strengths.
>
> Locked decisions are at the top. v2 backlog is at the end. Workers implement against the todos in `~/.pi/history/pi-workflows/todos/`.

---

## 1. Locked decisions (from grilling round 1)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Code lives in `/Users/attamusc/projects/github.com/Attamusc/pi-workflows`** (a fresh repo), symlinked to `~/.pi/agent/extensions/workflows/` during dev. Publishable as a pi package later. | Net-new repo = publishable shape. Avoids chezmoi templating during heavy iteration. Matches how the `subagent/` example is laid out. |
| D2 | **Plan → sign-off → stop.** Worker subagents kick off in a separate session. | Keeps planning clean, lets Sean review before commitment. |
| D3 | **`wf.ask()` v1 = `audience: "user"` only.** `audience: "agent"` via `sendUserMessage` is v2. | The user-facing variant is the differentiating value over CC. Agent variant adds real complexity (turn round-trip, structured response, checkpoint capture) and can wait. |
| D4 | **Approval flow v1 = raw script viewer + content-hash consent.** No phase extraction. | Static analysis is brittle (loops/conditionals invisible). Author-declared phases need v1 usage data first. Raw script is honest and ships in a day. |
| D5 | **No cross-restart resume in v1.** In-session pause/resume only. | Cross-restart needs stable phase IDs + cache key design + change-detection UX. Better designed once we know how workflows actually get written. |
| D6 | **No navigable TUI in v1.** `/workflows` is a text list of recent runs; per-run JSONL on disk for drill-in. | A real TUI is 1000+ LOC (see `todos/index.ts`). Text + JSONL is enough to validate the design. |
| D7 | **v1 does not touch `/plan`, `/bbq`, `/review`.** They coexist as prompt templates. | Migrating prompt templates to workflows is its own forcing function — better dogfood after v1 is real. |

---

## 2. The riskiest unknown — resolved

**Q (from plan-prompt):** "How does the extension actually spawn subagents? Is there a programmatic API, or only the LLM-facing tool? If the latter, what's the right pattern — `sendUserMessage` + tool-call interception, or something cleaner?"

**A:** The `examples/extensions/subagent/index.ts` extension shows the canonical pattern: extensions spawn subagents by `spawn()`-ing a `pi` subprocess directly, with `--mode json -p --no-session`, then parsing streamed JSON events on stdout (`message_end`, `tool_result_end`). Each event carries a full `Message` (role, content, usage, model, stopReason). This is a stable, documented protocol, used by an officially shipped example.

**Implication:** No `sendUserMessage` round-trip, no LLM-facing tool interception. `wf.spawn()` is a thin reuse of the proven code in `examples/extensions/subagent/index.ts`. The workflow runtime is, structurally, the subagent extension's `runSingleAgent` function called from arbitrary user code instead of from a tool-call handler.

We will vendor and adapt that code into `src/runner.ts` and treat it as our isolation boundary against pi internals: if pi changes the event protocol, one file breaks, not the whole extension.

---

## 3. Architecture overview

```
┌─────────────────────────────────────────────────────────┐
│  pi session (parent)                                    │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  pi-workflows extension                          │   │
│  │                                                  │   │
│  │  ┌─────────────────┐    ┌─────────────────────┐  │   │
│  │  │  `workflow`     │    │  /<name> commands   │  │   │
│  │  │  (LLM tool)     │    │  (saved workflows)  │  │   │
│  │  └────────┬────────┘    └──────────┬──────────┘  │   │
│  │           │                        │             │   │
│  │           ▼                        ▼             │   │
│  │  ┌──────────────────────────────────────────┐    │   │
│  │  │  approval flow (raw viewer + consent)    │    │   │
│  │  └────────────────────┬─────────────────────┘    │   │
│  │                       ▼                          │   │
│  │  ┌──────────────────────────────────────────┐    │   │
│  │  │  runtime (jiti loader + WorkflowContext) │    │   │
│  │  └────────────────────┬─────────────────────┘    │   │
│  │                       ▼                          │   │
│  │  ┌──────────────────────────────────────────┐    │   │
│  │  │  runner (pi subprocess spawner)          │    │   │
│  │  └────────────────────┬─────────────────────┘    │   │
│  │                       │                          │   │
│  │  ┌──────────────────────────────────────────┐    │   │
│  │  │  persistence (run JSONL + consent)       │    │   │
│  │  └──────────────────────────────────────────┘    │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
└──────────────────────┬──────────────────────────────────┘
                       │ spawn pi --mode json -p --no-session
                       ▼
                ┌───────────────┐  ┌───────────────┐
                │  subagent 1   │  │  subagent N   │  ...
                │  (pi proc)    │  │  (pi proc)    │
                └───────────────┘  └───────────────┘
```

Key properties:
- **Subagent isolation is unchanged from pi's existing model** — each is a separate pi process with its own context.
- **Plan lives in code** — workflow script holds the orchestration logic, not parent LLM context.
- **Parent context cost is bounded** — only the final synthesized output (or the tool result the LLM sees) goes into parent context. Per-agent transcripts live in the run JSONL.

---

## 4. File layout

```
pi-workflows/                          # repo root (this directory)
├── README.md
├── LICENSE
├── package.json                       # declares @earendil-works/pi-coding-agent peer dep, typebox, jiti
├── tsconfig.json
├── .gitignore
├── docs/
│   ├── authoring.md                   # how to write a workflow
│   ├── api.md                         # WorkflowContext reference
│   └── plans/                         # design notes (this doc lives in chezmoi/research/)
├── examples/
│   ├── hello.ts                       # smallest possible workflow
│   ├── scout-and-review.ts            # parallel + adversarial pattern
│   └── ask-user.ts                    # demonstrates wf.ask
└── src/
    ├── index.ts                       # extension entrypoint (default export factory)
    ├── api.ts                         # public TypeScript types (WorkflowContext, SpawnResult, etc.)
    ├── runner.ts                      # pi subprocess spawner (vendored from subagent example)
    ├── runtime.ts                     # jiti loader + script execution
    ├── context.ts                     # WorkflowContext implementation
    ├── approval.ts                    # raw script viewer + consent persistence
    ├── persistence.ts                 # run JSONL writer + consent storage helpers
    ├── saved.ts                       # discover .pi/workflows/*.ts → slash commands
    ├── tools/
    │   └── workflow.ts                # the LLM-callable `workflow` tool
    └── commands/
        └── workflows.ts               # /workflows text-list command
```

Install during dev (one-time):

```bash
mkdir -p ~/.pi/agent/extensions
ln -sf "$(pwd)/src/index.ts" ~/.pi/agent/extensions/workflows/index.ts
# or, if symlinking the whole dir works better:
ln -sf "$(pwd)" ~/.pi/agent/extensions/workflows
```

---

## 5. `WorkflowContext` API spec (v1)

Workflow scripts are TypeScript modules. The script's default export is an async function that receives a `WorkflowContext`:

```typescript
// examples/scout-and-review.ts
import type { WorkflowContext } from "pi-workflows";

export default async function (wf: WorkflowContext) {
  const findings = await wf.parallel([
    { agent: "scout", task: "Map the auth module" },
    { agent: "scout", task: "Map the DB layer" },
  ]);

  const review = await wf.spawn({
    agent: "adversarial-reviewer",
    task: `Find weaknesses in these findings:\n\n${findings.map(f => f.output).join("\n---\n")}`,
  });

  return wf.report({ findings, review: review.output });
}
```

### Full surface (v1)

```typescript
export interface WorkflowContext {
  /** Raw args string from slash-command invocation, or "" if invoked via `workflow` tool. */
  readonly args: string;

  /** Working directory the workflow was invoked from. */
  readonly cwd: string;

  /** Stable id for this run (used for the run JSONL filename). */
  readonly runId: string;

  /** Spawn a single subagent. Throws if the agent name doesn't resolve. */
  spawn(spec: SpawnSpec): Promise<SpawnResult>;

  /** Spawn many subagents with bounded concurrency. Default concurrency: 4. */
  parallel(
    specs: SpawnSpec[],
    opts?: { concurrency?: number },
  ): Promise<SpawnResult[]>;

  /** Mid-run human-in-loop. v1: prompts the user via ctx.ui.input. */
  ask(question: string, opts?: AskOptions): Promise<string>;

  /** Mark the final report. Returned to the LLM (via the `workflow` tool result)
   *  or surfaced in the run JSONL (when invoked via /<name>). */
  report(data: unknown): unknown;

  /** Free-form log line written to the run JSONL. Visible in /workflows drill-in. */
  log(message: string, fields?: Record<string, unknown>): void;

  /** Write a checkpoint marker to the run JSONL. v1: no-op for resume; v2 reads these back. */
  checkpoint(label: string, state?: Record<string, unknown>): void;
}

export interface SpawnSpec {
  agent: string;
  task: string;
  cwd?: string;
  /** Override the model declared in the agent definition. */
  model?: string;
  /** Override the tool allowlist declared in the agent definition. */
  tools?: string[];
  /** Per-spawn timeout in ms. Default: 30 * 60 * 1000 (30 min). */
  timeoutMs?: number;
}

export interface SpawnResult {
  agent: string;
  /** Final assistant text from the subagent (last text content of last assistant message). */
  output: string;
  /** Aggregated token / cost / turn / context-window metrics. */
  usage: UsageStats;
  /** Model the subagent ran on (resolved from agent def or override). */
  model?: string;
  /** "end" | "error" | "aborted" | "tool_use_limit" etc. */
  stopReason?: string;
  /** Wall-clock duration in ms. */
  durationMs: number;
  /** True if the subagent exited cleanly. */
  ok: boolean;
}

export interface AskOptions {
  /** Default value, shown pre-filled in the input. */
  default?: string;
  /** v2: "agent" mode will route through pi.sendUserMessage. v1 silently ignores. */
  audience?: "user";
}

export interface UsageStats {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  contextTokens: number;
  turns: number;
}
```

### Helpers NOT in v1

The plan-prompt sketched `wf.reviewBy()`, `wf.vote()`, `wf.synthesize()`. These are all expressible as patterns over `spawn`/`parallel` — they are sugar, not primitives. v2 adds them once we know what the real call shapes look like.

### Error handling contract

- `wf.spawn()` returns a `SpawnResult` with `ok: false` on subagent failure (non-zero exit, error stop-reason, abort). It does **not** throw — the workflow author decides whether to retry, branch, or rethrow.
- `wf.spawn()` throws only on configuration errors (unknown agent name, invalid spec).
- `wf.parallel()` always returns all results, including failed ones. Same contract per result.
- Uncaught exceptions in the workflow script are caught by the runtime, logged to the run JSONL with full stack, and surface to the user via `ctx.ui.notify("error")` and (if invoked via the `workflow` tool) as an `isError: true` tool result.

---

## 6. The `workflow` LLM tool

Schema (typebox):

```typescript
const WorkflowToolParams = Type.Object({
  script: Type.String({
    description: "Async function body OR full TS module that exports default async (wf) => { ... }. " +
      "Use wf.spawn, wf.parallel, wf.ask, wf.report. No fs/network/bash — go through subagents.",
  }),
  title: Type.Optional(Type.String({
    description: "Short label shown in approval dialog and /workflows list.",
  })),
});
```

`promptSnippet` (visible in the system prompt): describes the tool's purpose and points to a few exemplar workflows so the LLM can pattern-match.

**Execution flow:**
1. LLM emits `workflow({ script, title })` tool call.
2. Tool handler computes content-hash of the script.
3. If `(script-hash, allowed=true)` exists in consent store → skip approval. Else show raw-script viewer + Yes / Yes-always / No.
4. On approve, hand the script to the runtime.
5. Runtime jiti-loads the script (wrapping body-only scripts in `export default async function (wf) { ... }`) and runs it.
6. On completion, return `{ content: [{ type: "text", text: finalReport }], details: { runId, results, usageTotal } }` to the LLM.
7. On error, return `isError: true` with stack.

---

## 7. Saved workflows + slash commands

**Locations** (mirrors how skills/agents work):
- `.pi/workflows/*.ts` — project-local
- `~/.pi/agent/workflows/*.ts` — user-level

Each `<name>.ts` exports `default async function (wf: WorkflowContext) { ... }` and becomes `/<name>` slash command.

**Discovery:**
- Scan both locations on `session_start` and on `resources_discover { reason: "reload" }`.
- For each, `pi.registerCommand(name, { description, handler })`.
- Description pulled from a `// @description: ...` comment header if present, else "Saved workflow at <path>".

**Invocation flow:**
- User types `/triage 1024 1025 1030`.
- Handler captures `args = "1024 1025 1030"`, generates `runId`, runs approval flow (same content-hash consent — saved workflows hash their file contents, so editing the file re-prompts for approval).
- Runtime loads via jiti, supplies `WorkflowContext` with `wf.args = "1024 1025 1030"`.
- Workflow is responsible for parsing its own args. (v2: LLM-parsed structured args.)

**Conflict resolution:** project-local overrides user-level for same name. If a saved workflow shares a name with another extension's command, pi's existing suffix mechanism applies (`/triage:1`, `/triage:2`).

---

## 8. Approval flow + consent storage

**v1 UI (raw viewer):**

```
┌────────────────────────────────────────────────────────────┐
│ Approve workflow: "Audit auth for missing checks"          │
├────────────────────────────────────────────────────────────┤
│ # script source (read-only)                                │
│                                                            │
│   const files = await wf.spawn("scout", {                  │
│     task: "List all files under src/routes/",              │
│   });                                                      │
│   const audits = await wf.parallel(                        │
│     files.output.split("\n").map(f => ({                   │
│       agent: "reviewer",                                   │
│       task: `Check ${f} for auth gates`,                   │
│     })),                                                   │
│   );                                                       │
│   return wf.report(audits);                                │
│                                                            │
├────────────────────────────────────────────────────────────┤
│  [Y] Run once    [A] Always allow this script    [N] No    │
└────────────────────────────────────────────────────────────┘
```

Implementation: `ctx.ui.custom()` with a scrollable read-only text view and three-button bar. (If `ctx.ui.custom()` is too heavy for v1 ergonomics, fall back to `ctx.ui.editor()` in read-only mode + a follow-up `ctx.ui.select(["Run once", "Always allow", "Cancel"])`.)

**Consent store:**

Persisted via `pi.appendEntry("pi-workflows.consent", { hash, allowed: true, at })`.

On startup, replay entries to populate an in-memory `Map<scriptHash, true>`.

Why session-scoped persistence (`appendEntry`) instead of `~/.pi/workflows-consent.json`:
- Keeps the consent record tied to where the user actually saw and approved the script.
- Survives `/reload`, survives `/resume`.
- Does NOT propagate to other machines without explicit opt-in. (If we want global consent, that's a v2 toggle.)
- No filesystem state to clean up.

Trade-off: if you re-approve the same script in multiple sessions, you'll get the dialog once per session. That's fine — it's a one-time cost per script per session, and it's the safer default. If this proves annoying, v2 adds a global consent store.

**Hash algorithm:** SHA-256 of the normalized script source (trim trailing whitespace, no other normalization). For saved workflows, hash the file contents. For LLM-emitted scripts via the `workflow` tool, hash the `script` parameter as received.

---

## 9. Persistence schema

**Per-run JSONL:** `~/.pi/workflows-runs/<run-id>.jsonl`

Each line is a JSON object with `{ ts: number, type: string, ...payload }`. Append-only.

| `type` | Payload | When written |
|--------|---------|--------------|
| `run_start` | `{ runId, source: "tool" | "saved", name?, scriptHash, args, cwd, parentSession }` | Immediately after approval |
| `phase_start` | `{ phaseId, agent, task, model?, tools? }` | When `wf.spawn` begins |
| `phase_end` | `{ phaseId, ok, durationMs, usage, model, stopReason, outputExcerpt }` | When `wf.spawn` returns |
| `ask` | `{ question, answer, audience }` | When `wf.ask` returns |
| `log` | `{ message, fields? }` | Each `wf.log` call |
| `checkpoint` | `{ label, state? }` | Each `wf.checkpoint` call |
| `report` | `{ data }` | When `wf.report` is called |
| `run_end` | `{ ok, durationMs, error?, usageTotal }` | After the workflow function returns or throws |

`phaseId` is a stable counter (1, 2, 3, ...) per run. Sufficient for v1 surfacing; v2 cross-restart resume will need to layer content-addressed IDs on top.

**Run id format:** `${timestampMs}-${random4hex}` — sortable lexically.

**Session-scoped state via `pi.appendEntry`:**
- `pi-workflows.consent` — `{ hash, allowed, at }` per consented script.
- `pi-workflows.run-ref` — `{ runId, source, name?, scriptHash, startedAt }` per started run (so /workflows can list runs from the current session even before they complete).

---

## 10. `/workflows` text-list view (v1)

```
$ /workflows

ACTIVE
  20260608-a1b2  triage         3/5 phases  ↑45k ↓12k  $0.23
  20260608-c3d4  workflow tool  running...

RECENT
  20260608-e5f6  scout-and-review  ✓  4 phases  18s  ↑22k ↓8k  $0.14
  20260608-g7h8  workflow tool     ✗  1 phase   3s   error: ENOENT

→ Detail: cat ~/.pi/workflows-runs/<run-id>.jsonl
→ Live tail: tail -f ~/.pi/workflows-runs/<run-id>.jsonl
```

Implementation: `pi.registerCommand("workflows", { ... })` that reads `~/.pi/workflows-runs/*.jsonl` (last 10), reads its own in-memory active-runs map, formats as plain text via `ctx.ui.notify` or a long-form viewer. Optional subcommand:
- `/workflows tail <runId>` — opens `tail -f` in cmux pane (v1.5 if `cmux` skill makes it cheap; else just print the path).

---

## 11. Concurrency, timeouts, abort

**Concurrency:** `wf.parallel()` defaults to 4 concurrent subagents (matches `subagent/` example's `MAX_CONCURRENCY`). Authors can override per-call up to a hard cap of 8 (matches `MAX_PARALLEL_TASKS`).

**Process-global cap on live spawns:** the runner enforces a process-global semaphore of 4 concurrent `runAgent` calls (override via `PI_WORKFLOWS_MAX_CONCURRENT` env var). This is a safety belt added after a development-time OOM that crashed the entire machine — see `tests/MANUAL-SMOKE.md` for the post-mortem. Without this cap, multiple `wf.parallel` calls from one workflow plus the recursive load of the symlinked extension inside every spawned pi process could exhaust memory.

**Timeouts:** per-spawn default 30 minutes. Configurable per call. On timeout, runner sends SIGTERM then SIGKILL after 5s (same pattern as the subagent example).

**Abort:** `AbortSignal` from the tool-call execute or from `ctx.ui.custom`'s loader propagates down. Aborting the LLM turn aborts the workflow; aborting the workflow propagates to all live subagent subprocesses.

**No subagent-spawns-workflow recursion** in v1. The workflow runtime doesn't expose itself transitively. (A subagent could in theory call its own `workflow` tool, but only if that subagent had access — by default pi's agent definitions don't include workflow tool access.) v2 may explicitly support nested workflows.

**Workers do not run live-spawn integration tests.** This is a hard constraint, learned the hard way during TODO-e62b7b34 implementation. A worker subagent running `node tests/smoke-runner.ts` from inside its own pi session spawned three more pi subprocesses, each of which loaded the symlinked pi-workflows extension, each of which the model asked to read large unbounded content from `node_modules`. The compounded memory pressure crashed the entire machine. Acceptance criteria that involve real pi subprocesses are codified in `tests/MANUAL-SMOKE.md` and run by a human (or a dedicated terminal session) from outside any pi context. Workers can still write parser-level unit tests against mocked subprocess event streams.

---

## 12. Premortem — top 5 failure modes

### F1. Subprocess deadlock or zombie subagents (and the OOM lesson)
**Scenario:** A subagent hangs (model API stalls, infinite loop in the spawned pi). Workflow waits forever.
**Real-world failure:** during initial runner development (TODO-e62b7b34), three sequential spawns from a worker subagent's smoke test caused a whole-machine OOM. Cause was the combination of: (1) symlinked extension recursively loaded inside every spawned pi, (2) unbounded scout task ("list every file with full content") against a cwd containing `node_modules`, (3) sequential spawns layered on top of the worker pi and the parent session.
**Mitigation:**
- Per-spawn timeout (default 30 min) with SIGTERM → SIGKILL escalation.
- Process-global concurrency cap of 4 in the runner (overridable via `PI_WORKFLOWS_MAX_CONCURRENT`).
- Log unhealthy children (`phase_end` with `stopReason: "timeout"`, `ok: false`).
- Workers never run live-spawn integration tests — see `tests/MANUAL-SMOKE.md`.
- Manual smoke tests use a clean cwd (`/tmp/pi-workflows-smoke`), narrow tasks, and run outside any pi session.

### F2. Workflow script abuses the API or hangs in user code
**Scenario:** LLM-generated script does `while (true) { wf.log("..."); }`, or `await fetch(...)` directly bypassing wf, or throws unhandled.
**Mitigation:**
- Wrap workflow execution in try/catch + an overall run timeout (default: sum of per-spawn timeouts + 5min, with floor of 30min).
- Document explicitly that wf is the only side-effect channel. We do NOT sandbox at the JS level — the threat model is the LLM, and the approval flow is the gate. If a user approves a script with `fs.unlinkSync`, that's on them. (The script viewer ensures they can see it.)
- Unhandled exception → `run_end { ok: false, error: <stack> }` + `ctx.ui.notify("error")`.

### F3. Approval fatigue
**Scenario:** Every LLM-emitted workflow pops a dialog, user blindly hits Y, security value erodes.
**Mitigation:**
- "Always allow this script" is the v1 escape hatch (content-hash keyed — modifying the script re-prompts).
- Document the failure mode in `docs/authoring.md`: "If you find yourself always-approving, your workflows are probably one-offs. Save them as `.pi/workflows/*.ts` once, approve once, then invoke via `/<name>` repeatedly."
- The approval UI emphasizes the script length and a short hash so users can compare runs at a glance.

### F4. Streaming JSON parsing breaks if pi changes message_end shape
**Scenario:** pi updates `Message`/`message_end` event format. The vendored runner code stops parsing.
**Mitigation:**
- Isolate all parsing in `src/runner.ts`. Public `SpawnResult` shape doesn't leak `Message` internals.
- Add a smoke test (`tests/smoke.ts`): spawn one agent, assert `SpawnResult.usage.input > 0` and `SpawnResult.output.length > 0`. Run it on each pi version bump.
- If pi changes shape, only `runner.ts` needs to update.

### F5. Saved workflow + dynamic /command registration race
**Scenario:** User adds a workflow file mid-session. No `/<name>` command appears until restart.
**Mitigation:**
- Re-scan on `resources_discover { reason: "reload" }`. So `/reload` picks up new workflows.
- Document this in `docs/authoring.md`: "After adding a new saved workflow, run `/reload`."
- v2 adds a filesystem watcher.

---

## 13. v1 acceptance criteria (the whole-system level)

A user can:
1. In an interactive session, type "use a workflow to spawn a scout and a reviewer in parallel and synthesize their findings." The LLM emits a `workflow` tool call. The user sees the approval dialog with the actual script. On approve, two cmux panes appear (one per subagent), both run, the parent gets a synthesized text result.
2. Save a workflow as `.pi/workflows/triage.ts`, restart pi (or `/reload`), invoke `/triage 1024 1025`, get a result.
3. Run `/workflows` and see the most recent runs with per-run token totals.
4. `cat ~/.pi/workflows-runs/<id>.jsonl` and see a full event log.
5. `wf.ask("Should we proceed with deletion?")` mid-workflow pops a dialog, the workflow waits for the answer, then continues.
6. Approve a script once with "Always allow," invoke it twice in the same session, see the dialog only the first time.
7. Modify a saved workflow file, re-invoke — dialog reappears (hash changed).

---

## 14. v2 backlog (deferred from v1, documented for pickup after dogfooding)

| # | Item | Why deferred | Sketch |
|---|------|--------------|--------|
| V1 | `wf.ask({ audience: "agent" })` | Needs `sendUserMessage` round-trip + structured response capture + checkpoint capture | Inject a user message via `pi.sendUserMessage(question, { deliverAs: "followUp" })`, suspend the workflow promise, resume when next assistant message arrives. |
| V2 | Cross-restart resume | Needs stable phase IDs + cache-key contract + "script changed" UX | Read run JSONL, replay `phase_end` cached outputs into a `Map<phaseId, SpawnResult>`. `wf.spawn` checks the map first. New `/workflows resume <runId>` command. |
| V3 | Navigable `/workflows` TUI | A 2-pane drill-in UI is ~1k LOC of TUI code; cut to ship | `ctx.ui.custom()` with `SelectList` of runs + per-run `Markdown` viewer of the JSONL events. Mirror `todos/index.ts` patterns. |
| V4 | `wf.reviewBy()`, `wf.vote()`, `wf.synthesize()` sugar | Express as patterns first, sugar once we know real call shapes | Trivial wrappers over `spawn` and `parallel`. |
| V5 | Author-declared phases for approval UI | Need v1 to see what authors actually write | `export const phases = ["scout", "review", "synthesize"]` shown in approval dialog above the script. |
| V6 | Static phase extraction for approval UI | Brittle; gain unclear | Walk TS AST, find top-level `await wf.spawn(...)` / `wf.parallel(...)` calls, hoist agent/task literals. |
| V7 | Structured args for saved workflows | `wf.args: string` is fine for v1 | LLM-driven arg parsing (`/triage 1024 1025` → `wf.args = [1024, 1025]`). Mirror CC's `args` global. |
| V8 | Filesystem watcher for `.pi/workflows/` | `/reload` is enough for v1 | `fs.watch` on both workflow directories; re-register commands on change. |
| V9 | Global consent store | Per-session is the safer default | `~/.pi/workflows-consent.json`, opt-in flag, exportable. |
| V10 | Nested workflows | Adds recursion + concurrency-cap complexity | Allow subagents to spawn workflows; cap depth; aggregate run JSONL into a tree. |
| V11 | Port `/plan`, `/bbq`, `/review` to workflows | Forcing function once v1 is real; existing prompt templates still work | Each becomes a saved workflow in `~/.pi/agent/workflows/`. Validates that the API is expressive enough. |
| V12 | Cross-session run telemetry view | Per-run JSONL is enough for v1 | Aggregate stats across runs: per-agent total tokens, average duration, success rate. |
| V13 | Workflow script linter | LLM may emit anti-patterns we want to catch at approval time | Static checks: no `fs`/`child_process`/`fetch` imports, no top-level statements outside the default export, etc. Warning only, not blocking. |

---

## 15. Open questions parked for implementation time

These are micro-decisions that don't need Sean's input now — workers can resolve them with judgment:

- **Run JSONL location** — `~/.pi/workflows-runs/` vs `~/.pi/history/workflows-runs/`. Whichever matches existing conventions (check what `todos/index.ts` does).
- **Script wrapping for the `workflow` tool** — wrap body-only strings in `export default async function (wf) { ... }` automatically, or require the LLM to always emit a full module? Recommend: auto-wrap if no `export default` detected, document the wrap form for clarity.
- **`promptSnippet` and `promptGuidelines` content for the `workflow` tool** — what gets injected into the system prompt to teach the LLM to write good workflows. Plan to iterate on this after first dogfood pass.
- **README + install one-liner** — symlink script vs `pi install` from local path. Whichever pi packages.md supports cleanly.

---

## 16. Implementation order — see todos

Worker-shaped chunks are in `~/.pi/history/pi-workflows/todos/`. Each todo has acceptance criteria and points to specific reference files/examples. Approximate order:

1. Repo skeleton + extension entrypoint loads
2. Subagent runner (vendored)
3. Runtime + WorkflowContext (no approval, no persistence yet)
4. `workflow` LLM tool with approval flow + consent
5. Persistence: run JSONL writer
6. Saved workflows + slash commands
7. `/workflows` text list
8. TypeScript types polish + author docs + example workflows

Estimated: ~1.5–2 worker-weeks total.
