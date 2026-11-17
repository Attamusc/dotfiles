# Pi task consumer

Pi owns this extension's tool/TUI, session actor, `PI_TODO_PATH`, scope/layout
migration and startup GC policy. Store parsing, mutations, settings and locks
come exclusively from `@attamusc/agent-tasks/core`; the consumer MCP launcher
calls `@attamusc/agent-tasks/mcp` in-process. There is no old-backend fallback,
bridge daemon or additional lifecycle manager. The UI uses `list-all` so its
closed tab and completions retain closed tasks; the model's `list` excludes them.

## Pin and installation

`package-pin.json` identifies the same immutable tarball for both consumers.
The published private release is `Attamusc/agent-tasks` `v0.1.0`, asset
`attamusc-agent-tasks-0.1.0.tgz`, SHA-256
`a3d28a57262a7d33bc6320f3257e54e2e209399eb0ee3e70d0ba38e11f85e661`.
Installed-host rollout and native profile activation remain separate operations. The ordered after-17 hook
runs after mise/Node and before the after-30 Pi package reconciliation. Each hook
is a separate process: after-17 resolves mise through Homebrew on macOS or the
managed home path on Fedora, selects the canonical global config from HOME and
uses `mise exec -- python3` so npm and Node are available without activated shims.
It does not install mise or upgrade tools.

**Apply through the approved ordered rollout.** Chezmoi writes destination files
before after-scripts. A failed capability install can therefore partially
reconcile files, then fail closed at after-17 and disable todo until
the pinned capability is installed. Explicit unpublished pins are refused before
any remote attempt, not before those earlier file writes.
There is no legacy fallback. Do not run full after-30 setup to test this consumer.

The capability-specific installer uses native `gh auth status`, verifies private
repository visibility and the downloaded SHA, then runs npm offline with a fresh
cache and `--ignore-scripts --no-audit --fund=false --package-lock=false`.
The home-relative prefix is `~/.local/share/pi-agent-tasks/<sha256>` regardless
of cwd or XDG environment. Its two tiny generated ESM entries import the public
package exports (the package has import-only exports, not CommonJS exports).
Both adapters load those entries. Exact existing installations are verified
against their file/mode/link inventory; collisions or drift stop without repair
or overwriting. Prefix upgrades are separate immutable directories, not in-place
replacement. No global npm linking, registry setup or consumer-side build.

## Explicit MCP scope

The installed `~/.local/bin/pi-agent-tasks-mcp` requires the mise-pinned Node
25.8.1: its shared scope helper is TypeScript and depends on native TS stripping.
The neutral package's Node>=22 declaration alone is not this consumer's runtime
contract. Native bindings must use the current trusted host's **absolute Node
executable**, not rely on the launcher's convenience `env node` shebang or child
PATH. No runtime install/version fallback is attempted. Required arguments:

```
--scope-cwd /absolute/captured/parent/cwd
--store-override=<captured literal PI_TODO_PATH, empty when unset>
--actor <stable opaque caller-managed identity>
--actions get,claim,update,append,release
```

The override is **one argv token**, including `--store-override=` when unset.
Spaces remain inside that token. Relative overrides resolve against captured
parent cwd, not the native client's code cwd. Ambient child `PI_TODO_PATH` and
XDG values are ignored. Package/history roots are home-relative, so HOME is an
explicit shared-consumer precondition. Native MCP bindings must set `env.HOME`
from the **current trusted Pi host's home**, including on resume, not a saved
record, model argument or assumed environment inheritance. The wrapper rejects
unset/nonabsolute HOME and a HOME inconsistent with its installed launcher
location before loading the capability or accessing a task store; it never
switches homes or falls back to the OS account home. This is a startup binding
check, not protection against same-user filesystem tampering. The host captures
scope literals and preserves the actor across resume; this launcher does not
serialize native runner config or manage sessions. There is no assignment-force switch and no stale-break tool.
An existing store is required; startup never creates/migrates/collects it.

An explicit override is authoritative, not proof it is still the intended
store. Pi displays the actual override in its tool scope label. A stale captured
override or a different checkout requires a human to reconcile the displayed
scope and ticket before writes: never silently accept, copy tasks, change scope,
or retry a mutation in another store. Missing bound stores fail startup. The
launcher cannot infer a human's intended ticket store from task IDs. Startup
stderr uses bounded JSON error codes and allowlisted static messages; it never
echoes exception text, input paths, stacks or secrets. Retry domain errors after
a confirmed stale break use the same Pi code/message mapping as initial errors.

## Locks, records and output limits

The unchanged `<id>.lock` wx namespace interoperates with legacy holders.
Pi maps typed domain errors to its existing tool output and retains the exact
"Todo locked" / "Steal the lock?" confirmation. Assignment force does not
bypass it. Only explicit confirmation calls the separate `breakStaleLock` API,
then retries once; decline/no UI leaves the lock untouched. An observed changed
lock blocks the retry. This is check-then-unlink, **not atomic takeover**:
concurrent manual stale breaks, including delayed legacy dialogs, can delete a
fresh lock. The ordinary acquisition one-winner guarantee excludes those races.

Supported writes are ordinary single-user regular records. Linked, nonregular
and multiply-linked replacement targets are refused, including no-op updates,
appends, claims and releases. Atomic replacement preserves ordinary mode but
not ACLs, xattrs or foreign ownership; no full filesystem-metadata parity is
claimed. No live task files are moved by this change; existing migration and
GC run only under Pi's existing startup policy.

MCP results have a 64 KiB limit and no pagination. An oversized completed result
can report `operationCompleted:true` without a new ID: do not blindly retry
mutations. Pi's existing output/rendering remains separate from that MCP limit.

## Isolated verification

First verify the coordinator-approved tarball SHA and stage it with:

```
npm install --prefix .artifacts/task-consumer/staging \
  --cache .artifacts/task-consumer/empty-cache --offline --ignore-scripts \
  --no-audit --fund=false --package-lock=false /absolute/approved/package.tgz
```

Then set `TASK_TEST_ARTIFACT` to that same tarball and `PI_TEST_SDK` to the
installed Pi 1.3.0 package root (not a credential/profile directory):

```
node --test dot_pi/agent/test/task-consumer.test.mjs \
  dot_pi/agent/test/task-install-mcp.test.mjs \
  dot_pi/agent/test/task-bootstrap.test.mjs
node --test dot_pi/agent/test/configuration.test.mjs \
  dot_pi/agent/test/planning-workflow.test.mjs
scripts/check-portability.sh
```

New tests use synthetic stores, scratch HOME/XDG, mocked private `gh` download,
real offline npm installs, installed public exports, the real Pi SDK loader and
real MCP stdio clients. Rendered hooks use mocked mise and scratch homes to test
clean PATH without initial node/npm and unpublished refusal before gh. No actual
mise installation or host tool upgrade occurs. A hand-written JSON fixture checks empty and
space-containing argv values. No model/native/paid job, active-host install,
private overlay or full chezmoi apply is involved. These checks do not certify
final release availability, Fedora native runtime or native profile permissions.
