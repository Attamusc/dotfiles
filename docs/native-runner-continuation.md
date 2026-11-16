# Continue native runners with Claude Code

## Starting point

The first definition-driven native runner is Copilot CLI. Its source, shared execution contract, Pi-only workflow guard and private neutral task package are committed at the identities below. The macOS installation passed a real coding job and a same-conversation read-only resume. The next phase is one Claude Code vertical slice, not a generic multi-runner framework.

This continuation source is based on dotfiles public main `b191c08f7825ff0d0b64a83922e79503a706214a`. It includes the consumer implementation, reachable immutable package pins and the instruction repair that removes per-fixture approval loops and dedicated-test-per-criterion requirements. Unrelated workstation WIP is excluded.

| Repository | Visibility | Reachable ref | Required commit |
| --- | --- | --- | --- |
| `Attamusc/pi-agent-execution` | public | `native-runners` | `4f7e8e19e3112f9c05f678f92b7c7ca454be9534` |
| `Attamusc/pi-interactive-subagents` | public | `native-runners` | `ea874c8a01d4109ec0dd4eb372e44bef3b80442e` |
| `Attamusc/pi-workflows` | private | `native-runners` | `12a8c12005934c3409717c2fa91ce89e6906c2ca` |
| `Attamusc/agent-tasks` | private | `main`, tag `v0.1.0` | `c18c011d2631e1bed4fdba3da86adbd3411ccaea` |

Both Pi package commits pin execution contract `4f7e8e19...` with ordinary Git dependencies and lockfiles. There are no required local `file:` dependencies or development overlays. Use full clones if running historical parser-characterization tests; their old baseline revisions are intentional, not stale managed pins.

The private task release is `https://github.com/Attamusc/agent-tasks/releases/tag/v0.1.0`:

- Asset: `attamusc-agent-tasks-0.1.0.tgz`.
- SHA-256: `a3d28a57262a7d33bc6320f3257e54e2e209399eb0ee3e70d0ba38e11f85e661`.
- It bundles MCP dependencies for offline installation. Download through the destination machine's existing authorized `gh` login; never copy credentials from the originating machine.

No local `.pi/plans`, captures, user task data, native conversations, Core addresses, private overlays or originating-machine paths are required to continue. Those are not portable prerequisites and are deliberately absent from this document.

Destination prerequisites for the corresponding checks are the pinned Node toolchain, Pi SDK 1.3.0, existing GitHub access to the private source/release, and a working Core/`hc` host plus an authorized Claude Code CLI for live validation. Source implementation and offline checks can proceed independently of missing live capabilities. Do not bootstrap or apply workstation configuration automatically to satisfy a prerequisite.

## Source map

In **pi-agent-execution**:

- `src/definitions.ts`, `src/resolve.ts`, `src/capabilities.ts`: definition parsing, trusted origin and supported controls.
- `src/lifecycle.ts`, `src/output.ts`: run lifecycle, completion and capture contracts.
- `src/index.ts`: exported contract/API; current contract version is 2.

In **pi-interactive-subagents**:

- `pi-extension/subagents/native-job.ts`: Copilot policy materialization, version checks, argv and output capture. This is currently Copilot-specific; do not assume Claude flags have equivalent meanings.
- `pi-extension/subagents/native-session.ts`: caller-owned managed resume records.
- `pi-extension/subagents/native-skills.ts`: trusted host skill resolution/snapshots.
- `pi-extension/subagents/core-launch.ts`, `herdr-core.ts`: existing native host launch/control ownership.
- `pi-extension/subagents/index.ts`: visible tool dispatch, native observation, stop and closure, resume profile transitions.
- `test/native-*.test.ts`, `test/core-launch.test.ts`: existing seams for focused coverage.

In **pi-workflows**:

- `src/agents.ts`, `src/runner.ts`: fail-closed Pi-only workflow guard and trusted-native/project-shadow handling. Native runner support must not silently route into a Pi-only recipe.

In **dotfiles**:

- `.chezmoitemplates/native-agent-definitions/`: staged, non-discovered native profiles.
- `.chezmoitemplates/worker-body`: shared worker instructions; preserve proportionate evidence and approval continuity.
- `dot_pi/agent/extensions/todos/`: one installed task package shared by the Pi tool/UI and neutral MCP.
- `dot_local/bin/executable_install-pi-agent-tasks`, `executable_pi-agent-tasks-mcp`: private release verification/installation and explicit scope/actor binding.
- `dot_pi/agent/test/native-runner-guidance.test.mjs`, `task-consumer.test.mjs`, `task-install-mcp.test.mjs`, `task-bootstrap.test.mjs`: existing consumer checks.

## Next vertical slice

1. Inspect the destination's actual Claude Code version, local help/documentation and existing authentication readiness without printing secrets. Installed does not mean authenticated. Do not install/update software, start a login or expand permissions implicitly.
2. Add definition-driven Claude execution using the existing native host, capture, stop/cleanup, skill and managed-session seams. Let a concrete Claude mismatch justify a contract change; do not pre-build adapters for hypothetical runners.
3. Support one coding task and a same-conversation read-only follow-up with an explicit policy transition. Verify actual Claude permission behavior; do not mechanically translate Copilot grants or treat cooperative CLI controls as an OS/path sandbox.
4. Preserve captured literal task scope, stable managed actor, current trusted host Node/HOME, declared task actions, and no-force MCP authority. Project shadows and unsupported controls must fail closed.
5. Keep existing Copilot behavior and default Pi worker/reviewer roles working. Existing opt-in read-only `cli: claude` review seats are not the new general native runner; do not silently retarget them.
6. Stage any new Claude definitions outside discovery. Publication, installed-pin changes, host apply and global activation are separate from implementation and isolated validation.

A Claude-only destination does not need Copilot installed just to implement this slice; retain existing offline Copilot coverage. Missing destination baseline capabilities should be reported as exact prerequisites, not bypassed through another host or silently installed.

Use a disposable source/task fixture for a bounded real CLI check when the destination's account and native host are ready. Native host identity belongs to that machine; do not reuse an old socket, terminal, session ID or executable approval packet. The host owns processes, panes and status. Do not add a supervisor, watcher, mailbox, transcript relay or lifecycle manager.

## Verification

Reuse valid baseline evidence and run the existing checks relevant to changed behavior. This is not a requirement to rerun every historical harness before coding.

Baseline checks at the listed package commits: shared dependency clean installs; subagents 437 passed / 3 skipped; workflows typecheck and 391 passed. The originating macOS installation independently checked the single todo registration/renderer, real neutral MCP read, coding result/commit, same-conversation resume, actual permission argv, unchanged fixture files and known native entry exit. Fedora had public rendering evidence, not a live runtime rollout. No universal sandbox, plugin, descendant/MCP-child exit or exclusive-memory certification is implied.

Useful package commands (in the corresponding checkout, after its normal locked dependency setup):

```sh
# Shared execution contract and workflow guard
npm run check

# Subagents offline suite. Isolate inherited Pi tool filtering and macOS /var aliases.
env -u PI_DENY_TOOLS TMPDIR="$(node -p 'require("node:fs").realpathSync(require("node:os").tmpdir())')" npm test
```

For the dotfiles consumer suite, set:

- `TASK_TEST_ARTIFACT`: downloaded, SHA-verified private release archive.
- `PI_TEST_SDK`: destination's installed `@earendil-works/pi-coding-agent` package root containing `dist/core/extensions/loader.js` (tested SDK 1.3.0; Node is pinned by mise).
- `PI_WORKFLOWS_GUARD_ROOT`, `PI_EXECUTION_SOURCE`, `PI_SUBAGENT_SOURCE`: the corresponding source checkouts above, with their normal dependencies available.

Then use the existing sequential consumer checks:

```sh
node --test --test-concurrency=1 \
  dot_pi/agent/test/task-consumer.test.mjs \
  dot_pi/agent/test/task-install-mcp.test.mjs \
  dot_pi/agent/test/task-bootstrap.test.mjs \
  dot_pi/agent/test/native-runner-guidance.test.mjs
scripts/check-portability.sh
```

Do not create a dedicated harness or red test for every prose criterion. Use existing seams, focused commands, inspected artifacts and proportionate live evidence. A failed local fixture/pin/check or exhausted attempt counter does not create a new human gate; reassess and repair within the approved objective. Pause for unsafe mutation, conflicting ownership, missing required capability or a genuinely changed external/privacy/permission/destructive effect. Preserve native permission/trust prompts; do not accept them automatically.

## Suggested skills

Use `atta-work` and `learn-codebase` for the scoped continuation, `commit` before commits, and `github` for repository operations. Use `codebase-design`, `diagnosing-bugs`, `tdd` or `verify-integration` when their actual trigger applies, not as compulsory phases. Existing independent reviewer/validator roles remain the appropriate bounded code/security/contract checks; do not turn optional findings or self-authored artifacts into a new approval chain.
