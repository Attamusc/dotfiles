# Live smoke: visible interactive completion

Run this smoke only from a persistent, interactive **main Pi session** with the installed `pi-interactive-subagents` tools and Herdr available. An autonomous worker must not run it.

Contract authority is the `pi-interactive-subagents` revision pinned in `.data/pi/agent/settings.json`. Before running the smoke, confirm the installed package checkout is at that revision and read its `pi-extension/subagents/index.ts` and `pi-extension/subagents/subagent-done.ts` lifecycle behavior. Do not validate against a newer uninstalled checkout.

## Bounds and preflight

- Launch at most one child and allow at most five minutes total.
- Use `pi-interactive-subagents` through its `subagent` tool with `agent: "scout"` and `interactive: true`; do not invoke Pi, Herdr, or a shell wrapper directly. Confirm the installed `scout` definition has `auto-exit: true` before launch. The explicit agent keeps the visible pane while making normal agent completion, rather than model compliance with `subagent_done`, the primary shutdown path.
- Use this read-only task exactly: `Read README.md from the current repository and report its first Markdown heading. Do not write files, run mutating commands, or launch another process. Then call subagent_done.`
- Use the current repository as `cwd` and a unique display name such as `control-cli-live-smoke`.
- Record the exact `details.id` run ID and `details.sessionFile` returned by launch. Do not substitute the display name, a pane ID, or a later session path for either identity.
- Retain only the launch result and the correlated final result/status as evidence. Do not read or copy the child transcript.
- Herdr and `pi-interactive-subagents` own cleanup. The expected exit signal is the owner-delivered successful `subagent_result`: at the installed revision, delivery occurs only after the surface closes and its running registration is released. The final payload identifies the launch session file but does not repeat the launch run ID or child PID.

## Procedure

1. Confirm the repository has a readable `README.md`. If it does not, stop with `unsupported`; do not change the task or create a fixture.
2. Declare the preflight above in the main session. The interaction is read-only, so no mutation approval is required. If the invocation changes to anything mutation-capable, show its exact target, mutation, timeout, and cleanup plan and obtain explicit user approval before launch.
3. Call `subagent` once with `agent: "scout"`, the declared name, task, `cwd`, and `interactive: true`.
4. Copy the returned run ID and session file verbatim into the smoke record. If either is absent, request termination by the exact available run ID and mark the smoke incomplete.
5. Wait for the automatically delivered `subagent_result`, up to four minutes. Do not treat `subagent_done`, a quiet pane, or an `agent-ended`/`completion-requested` fact as process exit.
6. If no correlated result arrives by four minutes, call `subagent_interrupt` with the exact recorded run ID. This only interrupts the active turn; its acknowledgement is not completion. Wait 15 seconds.
7. If no correlated terminal result arrives, call `subagent_terminate` with that same run ID. Its acknowledgement is only a termination request. Wait up to 45 seconds for the owner to report wrapper/process exit or confirmed process absence.
8. Stop after five minutes. Never launch a replacement child. Correlate the automatically delivered result to the one outstanding launch and confirm its `details.sessionFile` matches the recorded launch session file. Record `complete` only when it reports the expected heading and arrives through this package-native post-close/post-release boundary. Otherwise record `incomplete`, including whether interrupt or termination was requested and that cleanup remains unverified.

## Pass evidence

The smoke passes only when all of these are present:

- one launch record with the exact run ID and session file;
- the installed package pin and confirmed `scout` `auto-exit: true` setting;
- the automatically delivered result correlated to the sole launch, with the same session file;
- the expected first Markdown heading; and
- successful owner delivery at the installed package's post-surface-close, post-registration-release boundary.

The final result is not required to repeat the launch run ID or expose a child PID; this installed revision exposes neither field there. The recorded launch ID, launch session file, matching result session file, and package-native delivery boundary together provide the lifecycle evidence.

A launch acknowledgement, interrupt acknowledgement, terminate acknowledgement, completion request, pane disappearance, or transcript text alone is not a pass signal.
