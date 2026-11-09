# Pi workflows

The managed package source is pinned exactly as
`git:github.com/Attamusc/pi-workflows@1614faf29c6ad1d0fcc9fe6db86a770f34e2b129`.
Host package reconciliation and fresh-Pi smoke are separate gates. The pin
in source does not establish whether a particular host has activated it.

## Atta ordinary-work route

`atta-work` is the default skill for investigations, recurring deliverables, POCs,
features and fixes. It uses direct Pi work or the existing visible Herdr subagent
lane; it does not require a separate planner/todo activation. Explicit planning,
approved todo work and general reviewer/validator contracts remain available.
The five phase roles are `evidence`, `maker`, `checker`, `judge` and `prose-checker`.
The existing specialist skills, packages, MCP configuration and private settings
are preserved. Atta is a locally authored workflow, not an upstream plugin.

Saved recipes are a separate optional headless lane, not a bridge to visible
children. `atta-task` accepts structured intent/acceptance; raw task text means
investigation. Recurring work needs an accepted reference and named domain skill.
`atta-push` handles an existing PR, not initial PR creation; APPROVE and no-merge
boundaries remain. New sources are untrusted until their exact versions receive
native approval. Installing them does not authorize automatic execution.

Saved runs preserve the package's existing 60-minute run ceiling; this migration
does not export a timeout override. The managed mise environment limits saved
helper concurrency to 2 per Pi process; additional helpers wait for a slot. Start
a fresh Pi process with that environment after deployment. These limits do not
govern visible Herdr children, open chats or review-pass counts. Per-phase budgets
and outcome reports do not provide OS containment or a hard dollar guarantee.
An execution success without a valid completed task outcome remains partial.
Ordinary investigation may finish with useful evidence and human next checks;
optional follow-up ideas do not make that outcome incomplete.

## Security and runtime boundary

Saved workflow TypeScript is trusted in-process code. Dynamic source alone is
permission-sandboxed. Node 24 does not by itself disable `$workflow`: the
extension probes absolute Node 25+ executables on PATH as well as its current
runtime. A working permission probe is required; there is no unsandboxed
fallback, and activation must not change the host's Node selection implicitly.

Direct verification skills remain usable without the package. Workflow JSONL
and checkpoints provide audit and reconstruction evidence; they do not resume
work or continue execution across a Pi or host restart.

## Managed workflow disposition

Eleven saved workflows are managed: the original eight plus three Atta recipes.
The saved workflow owns `/deep-review`; the direct structural-review prompt is
`/deep-code-review`, avoiding duplicate command registration. `report-validate`
is the original tool-free automatic validator: it discovers repository containment
with inert filesystem inspection, reports VCS status as unavailable, and never
invokes Git, jj, hooks, fsmonitor, filters or another repository-configured program.
`atta-investigate` is additionally automatic-eligible only after native exact-source
trust; its intended read-tool pass is not universal read-only containment or live
query authorization. `resume-status` remains explicit and status-only because VCS
status can execute repository-configured programs; it never resumes work.

| Workflow | Disposition | Invocation / boundary |
|---|---|---|
| `atta-investigate` | Atta | automatic-eligible after exact-source trust; bounded repository evidence, intended read tool; no live-query grant |
| `atta-task` | Atta | explicit; one writer, task-outcome checks, at most two concrete implementation fix passes; no integration/push/merge |
| `atta-push` | Atta | explicit; existing-PR composition of `iterate-pr`, APPROVE before effects; never merge |
| `deep-review` | retained | explicit; bounded read-only review |
| `diagnose-and-fix` | deferred | Package isolation exposes mutable jj identities and cannot guarantee that reviewed bytes equal integrated bytes. Use the `diagnosing-bugs` skill directly. |
| `investigate` | retained | explicit; bounded read-only investigation |
| `iterate-pr` | retained | explicit per-run approval names repository, PR, network/credential use, and commit/push/reply effects |
| `jungle-book` | retained | explicit; bounded read-only classification |
| `mine-workflows` | retained | explicit; bounded transcript-as-data analysis; proposals only |
| `portability-phase` | deferred | Package isolation cannot faithfully materialize every captured Git/jj tree entry without a second VCS serializer. Run `scripts/check-portability.sh` directly and use the normal review/commit workflow. |
| `report-validate` | retained | automatic; one bounded tool-free validator over contained artifact bytes |
| `resume-status` | retained | explicit; bounded status report only |
| `verify-claims` | retained | explicit; bounded read-only verification; document content is untrusted data |

No retained workflow calls package isolation, integration, or isolation cleanup.
`iterate-pr` preserves its approval boundary before network, credential, commit,
push, or reply effects. Denial leaves the invoking tree unchanged.

## Candidate checks and host activation

API, dynamic, and package harnesses accept only a real clean detached Git
worktree whose full `HEAD` equals the exact pin. Every harness requires the
candidate-owned TypeScript compiler. Modified tracked files and untracked
non-ignored files fail closed; ignored `node_modules` installed inside the
candidate is permitted. Marker-only directories and archives are rejected.
Prepare the disposable candidate without changing the source checkout:

```sh
git -C "$PKG" worktree add --detach "$TEST_ROOT" "$PIN"
node scripts/check-pi-workflows-package.mjs \
  --candidate "$TEST_ROOT" --revision "$PIN"
```

Pi 1.3.0 is pinned through mise's npm backend on both macOS and Fedora;
Homebrew owns Herdr on macOS, not Pi. Built-in MCP reads the merged
`mcpServers` configuration without the adapter package. The setup hook is
content-addressed to public and private settings. If its execution is
separately approved on a host, it reconciles configured Git pins
with per-package `pi update --extension` calls before installing Herdr's
managed Pi integration. Unpinned checkouts are left for a separate update.
On a fresh host, the first online Pi startup installs missing declared packages;
that first install can run package lifecycle scripts. Existing unpinned checkouts
are not refreshed merely by starting Pi. The pinned-package update command also
installs a missing configured checkout.
There is no second installer, package symlink, tmux/cmux fallback, lifecycle
manager, or status reporter.

Each host needs separately approved reconciliation, followed by a fresh-Pi
package listing, `/workflows` check, and live workflow smoke. Run that smoke
from a fresh terminal and expect the eleven managed user workflows; project
workflows can add or shadow names. Source validation does not substitute for host
verification. Check the effective package source rather than silently replacing a
machine-local checkout. A resource reload alone does not refresh process environment.

The candidate's 24 checks covered mocked control flow and native resource discovery;
its real investigation cook-off exercised the visible lane. Those results do not
certify every saved effectful POC/implementation/push path or live permission boundary.
The migration retains explicit trust and source/behavior distinctions rather than
promoting an old smoke result into acceptance of a new source hash.
