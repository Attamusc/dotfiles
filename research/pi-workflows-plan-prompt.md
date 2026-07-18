# Planning prompt: `pi-workflows` extension

Plan a new pi extension called `pi-workflows` that adds a TypeScript-based workflow runtime to pi, closing the orchestration gap with Claude Code's new "Dynamic Workflows" feature while preserving pi's conversational, process-isolated, human-in-loop strengths.

This is a **full extension**, not a prototype. Plan it to a level where a worker agent can implement v1 across ~5–10 todos.

## Background — read these first

1. **Research report**: `/Users/attamusc/.local/share/chezmoi/research/claude-code-workflows-vs-pi-subagents.md`
   - Deep dive on CC Dynamic Workflows (released May 28, 2026, v2.1.154)
   - Side-by-side comparison with pi subagents
   - Optimization axes, what each gets right/wrong, when to use which
   - **Read this in full before planning.** It frames why this extension exists.

2. **Pi extension docs**: `/Users/attamusc/.local/share/mise/installs/node/25.8.1/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md`
   - Full reference for `ExtensionAPI`, `registerTool`, `registerCommand`, `appendEntry`, event lifecycle, `sendUserMessage`, `ctx.ui`, etc.
   - **Read at least: Quick Start, Events lifecycle overview, ExtensionAPI Methods, Custom Tools, Custom UI, Session replacement lifecycle.**

3. **Example extensions to study** (in `/Users/attamusc/.local/share/mise/installs/node/25.8.1/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/`):
   - `dynamic-tools.ts` — registering tools at runtime
   - `commands.ts` — slash command patterns
   - `handoff.ts` — `sendUserMessage` + `appendEntry` patterns
   - `custom-compaction.ts` — session-spanning state
   - `event-bus.ts` — cross-handler coordination

4. **Existing extensions in this repo** (`/Users/attamusc/.local/share/chezmoi/dot_pi/agent/extensions/`):
   - `todos/index.ts` — full-featured extension with state, commands, UI (~63KB, study its structure)
   - `smart-sessions/index.ts` — small, focused extension
   - `tuner/` — model-config patterns
   - Follow these conventions for file layout, naming, error handling.

5. **Pi's subagent infrastructure** — referenced in `/Users/attamusc/.pi/agent/AGENTS.md` (subagent, parallel_subagents, fork, agent definitions in `~/.pi/agent/agents/`). The workflow runtime wraps these — confirm during investigation how `subagent` is exposed (likely as a built-in tool the extension can invoke programmatically; investigate whether there's a direct API or whether we need to drive it via `sendUserMessage` + tool-call interception).

## The headline design (sketch — refine during planning)

A pi extension that exposes:

- **One LLM-callable tool**, `workflow`, that accepts a TypeScript script the LLM generates. Approval-gated via `ctx.ui.confirm` showing the script. Executes in a runtime that yields a `WorkflowContext` to the script.

- **Saved workflows** in `.pi/workflows/*.ts` (project) and `~/.pi/agent/workflows/*.ts` (user), surfaced as `/<name>` slash commands via `pi.registerCommand`.

- **`WorkflowContext` API** the script imports:
  ```ts
  wf.spawn(agentName, task, opts?) -> Promise<Result>        // wraps pi's subagent
  wf.parallel(specs[]) -> Promise<Result[]>                  // bounded concurrency
  wf.reviewBy(reviewerAgent, claim) -> Promise<Review>       // adversarial cross-check
  wf.vote(agents[], question) -> Promise<Decision>           // multi-angle voting
  wf.synthesize(agent, data) -> Promise<string>              // final report
  wf.ask(question) -> Promise<Answer>                        // KILLER: mid-run human-in-loop
  wf.report(data) / wf.checkpoint() / wf.log()               // ergonomics
  ```

- **Per-agent telemetry**: capture tokens/duration/model per spawn, surface in `/workflows` TUI view.

- **Restart-survivable resumability** via `pi.appendEntry` checkpoints — strictly better than CC's session-only resume.

- **`/workflows` command**: TUI view of current + past runs, restart failed agents, save current as named command.

## What you must figure out during planning

These are the real design decisions — don't paper over them, drive them to resolution:

1. **How does the extension actually spawn subagents?** Investigate pi's internals. Is there a programmatic `subagent()` API the extension can call, or only the LLM-facing tool? If the latter, what's the right pattern — `sendUserMessage` + tool-call interception, or something cleaner? **This is the riskiest unknown — resolve it first.**

2. **Sandbox boundary.** Workflow scripts are arbitrary TS the LLM wrote. What does `WorkflowContext` expose, and what does it deny? No raw `fs`/`child_process` — everything goes through subagent spawns (whose tool perms are already gated). Confirm jiti can load workflow scripts in a restricted scope.

3. **`wf.ask()` semantics.** When a workflow asks a question, where does it go?
   - (a) Inject as `pi.sendUserMessage` to the parent agent (`deliverAs: followUp`), let the parent reason and answer
   - (b) Pop a `ctx.ui.input` dialog directly to the user
   - (c) Configurable per-call: `wf.ask(q, { audience: "agent" | "user" })`
   - Pick (c) probably, but think through how the workflow runtime waits for the response without blocking the event loop, and how this interacts with checkpoint/resume.

4. **Approval flow.** Mirror CC's UX: show planned phases (extracted statically from the script? or just show the raw script?), offer "yes / yes-always-for-this-script / view raw / no". Where's the consent record stored — `pi.appendEntry` keyed by script hash?

5. **Concurrency model.** `wf.parallel()` with bounded concurrency (default 8?). How does this map onto pi's subagent spawning — is there a real limit on concurrent cmux panes? Investigate.

6. **Checkpoint format.** What gets persisted via `pi.appendEntry` after each completed phase, and how does resume reconstruct state when the script re-runs from a checkpoint? Consider: stable phase identifiers, content-addressed result caching, what happens if the script source changes between runs.

7. **`/workflows` TUI design.** What does the view look like? Use `ctx.ui.custom()` or static widgets? Per-agent drill-in?

8. **Coexistence with existing slash commands.** `/plan`, `/bbq`, `/review` are prompt templates today. Should they be migrated to workflows, kept as prompts that invoke workflows, or left alone? Plan for coexistence in v1, migration as separate work.

9. **TypeScript types for workflow authors.** Where does `@earendil-works/pi-workflows` live so workflow scripts can `import type { WorkflowContext }`? Probably exported from the extension itself with a stable `.d.ts`.

10. **Failure modes.** Workflow script throws. Subagent crashes. User aborts. Process exits mid-run. Walk each one.

## Constraints

- **Live in chezmoi**: extension lives at `dot_pi/agent/extensions/workflows/` (deploys to `~/.pi/agent/extensions/workflows/`). Follow existing conventions in `dot_pi/agent/extensions/todos/` and `smart-sessions/`.
- **Multi-file structure**: this is too big for a single `index.ts`. Plan the file layout (runtime, api, ui, persistence, approval, commands).
- **TypeScript, no compilation step**: jiti loads `.ts` directly. Use `typebox` for tool schemas.
- **Preserve pi's strengths**: fork mode, live cmux visibility (each subagent is still a real pi session), heterogeneous model routing, skills, mid-run human-in-loop, conversational flexibility. The extension should not gate or hide pi's existing primitives — it adds on top of them.
- **Think forward**: no backwards-compat shims, no "what if we want to also support YAML workflows later" hedges. Build the clean version.

## Deliverable from the planning session

- **Investigation notes**: especially the answer to "how does the extension spawn subagents programmatically" and any other surprises uncovered while reading docs/code.
- **High-level design doc** at `/Users/attamusc/.local/share/chezmoi/research/pi-workflows-design.md` covering: architecture, file layout, `WorkflowContext` API spec, persistence schema, approval flow, `/workflows` UI sketch, key decisions made and the reasons behind them.
- **A premortem**: top 3–5 ways this fails. For each, the mitigation.
- **Ordered todos** (`todo` tool) for v1 implementation. Each todo should be a worker-shaped chunk with clear acceptance criteria, references to specific files/examples to mirror, and the integration contract with adjacent todos. Roughly 5–10 todos targeting ~1.5–2 weeks of worker time.
- **Honest scope cut for v1 vs v2**: e.g., does v1 include `/workflows` TUI? `wf.vote()`? Resumability across restarts? Cut what's not essential to prove the design works.

## Style

Grill the user (me, Sean) on the open questions before committing. I'd rather answer 5 sharp questions than read a plan that papered over them. Use `/answer` to batch questions when you have several.

When you've drafted the design doc and todos, present them and ask for sign-off before exiting.
