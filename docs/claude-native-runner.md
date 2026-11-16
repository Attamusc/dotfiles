# Claude Code native slice

## Scope

The staged `worker-claude` and `worker-claude-readonly` templates are separate
from the legacy `cli: claude` review seats. They do not change default Pi roles,
activate global definitions, or execute in Pi-only workflows. Copilot retains
its existing native path.

Claude reuses Core launch, literal stdout capture, stop/exit proof, trusted skill
snapshots and caller-owned managed-session records. A host-generated UUID
identifies the conversation. An explicit resume profile recompiles permissions
and instructions while retaining the UUID, task scope and managed task actor.
No additional supervisor, streaming transport or runner framework is introduced.

## Controls

These profiles target the Claude Code 2.1.325 interface:

- Model, effort, instructions and selected skills come from trusted definitions.
  Unsupported call overrides fail closed.
- `native-tools` selects built-in tools; `native-allow` grants approval and
  `native-deny` supplies denials. An approval list alone is not a tool allowlist.
  Coding permits shell and writes; the reader exposes Read/Glob/Grep and
  read-only task MCP actions.
- Unattended jobs use `--permission-prompts none`: operations requiring an
  unanswered approval are denied rather than waiting for an absent SDK host.
  The reader uses `dontAsk`. Neither profile grants permission bypass or accepts
  trust. Blocked work requires an explicit policy decision, not broader retries.
- Print mode skips Claude's trust dialog, so the adapter requires saved native
  trust for the canonical cwd or its nearest verified Git root. Repeated runs
  and child directories reuse that decision. Nested repositories, submodules
  and worktrees require their own trust; arbitrary ancestor trust is not inferred.
  No trust record is created or edited. Keep approved roots narrow, particularly
  when HOME itself is a repository. Root verification requires `/usr/bin/git`;
  failure blocks reuse rather than installing or substituting an executable.
- `--safe-mode` suppresses explicit MCP too, so this path instead sends empty
  setting sources, strict explicit MCP configuration and controls disabling
  hooks, ambient memory, CLAUDE.md discovery, slash skills and account connectors.
  Managed/admin policy is not removed or certified.
- MCP uses current trusted host Node/HOME and captured literal scope/store/actor.
  The host rejects task-force flags and unknown actions; the consumer fixes
  assignment-force authority off. Records never supply executable policy.

These are cooperative CLI controls, not an OS/path sandbox. A coding shell can
write beyond cwd. Administrator/global plugins, detached descendants and
exclusive memory are not certified. Trust-file and version checks are
prepare-time observations, not locks against same-user changes before launch.
Core runtime trust-store overrides are checked again before exec.

## Verification

Use the execution contract and dependent package revisions selected together by
their Git dependency pins and lockfiles. A normal locked install must supply the
Claude-enabled contract; do not commit local `file:` dependencies or development
overlays as release dependencies. The continuation guide describes the earlier
Copilot baseline, not a compatible Claude deployment by itself.

Existing package commands:

```sh
# execution contract and workflow consumer, in each checkout
npm ci
npm run check

# native subagent consumer
npm ci
env -u PI_DENY_TOOLS TMPDIR="$(node -p 'require("node:fs").realpathSync(require("node:os").tmpdir())')" npm test
```

Consumer checks use the verified task release, installed SDK root and source-root
variables documented in `native-runner-continuation.md`. Stage the bundled task
package under `.artifacts/task-consumer/staging/node_modules/@attamusc/agent-tasks`
with its archive prefix removed, then run the guide's sequential consumer checks
and `scripts/check-portability.sh`. No global apply or profile activation is
needed. The historical parser fixture uses Node's strip-only TypeScript mode.

Measured checks for this slice: execution contract 81 tests, native subagents
446 tests, workflow guard 391 tests, task consumers/guidance 17 tests, and neutral
task package 27 tests passed. Public portability checks passed. A fixture-only
`--noprofile --norc` repair isolates completion tests from shell startup files;
production shell behavior is unchanged.

A bounded live fixture exercised the registered launch/resume handlers, Core
capture/cleanup, Claude and installed task MCP. Parent ExtensionAPI callback
plumbing used the existing integration-test seam; the native processes and
managed-session records were real. Coding read/claimed/updated a synthetic task,
edited source, ran tests and committed. An explicit read-only resume retained
conversation UUID and actor, recalled a prior-turn token, and left source, task
record and Git HEAD unchanged. Both native entries were absent and Core terminals
removed afterward. Saved trust was reused without another prompt.

A child-directory launch/resume was verified at preparation time without creating
child trust. A deliberately attempted native file write during the model's
read-only turn was not exercised; unchanged files are not adversarial-denial
proof. Installed MCP mutation/force denial was checked separately. Independent
read-only review approved the supported source/trust boundaries and distinguished
these live observations from unverified sandbox or negative-permission claims.

## Rollout remains separate

Publication does not update installed runner pins or activate these templates.
Install compatible task/execution/subagent/workflow consumers in an approved
order, reload consuming owners, verify the Pi-only guard, then explicitly render
profiles into a trusted resource root. Reuse valid evidence and the same approved
disposable fixture unless changed runtime/package revisions invalidate it. New
repositories still require a human native trust decision.

Deactivate owned native definitions before downgrading consumers. Never retarget
legacy Claude review seats or weaken the workflow guard to accommodate old pins.
