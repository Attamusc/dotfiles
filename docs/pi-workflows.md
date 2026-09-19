# Pi workflows

The managed package source is pinned exactly as
`git:github.com/Attamusc/pi-workflows@1614faf29c6ad1d0fcc9fe6db86a770f34e2b129`.
It is active after independent review and integration validation passed.
Fresh-terminal smoke testing remains user-owned.

## Security and runtime boundary

Saved workflow TypeScript is trusted in-process code. Dynamic source alone is
permission-sandboxed. The managed Node 24 runtime therefore keeps `$workflow`
unavailable: there is no fallback runtime, and activation must not incidentally
upgrade Node.

Direct verification skills remain usable without the package. Workflow JSONL
and checkpoints provide audit and reconstruction evidence; they do not resume
work or continue execution across a Pi or host restart.

## Managed workflow disposition

Eight saved workflows are retained. The saved workflow owns `/deep-review`;
the direct structural-review prompt is `/deep-code-review`, avoiding duplicate
command registration. `report-validate` is the only automatic workflow. It discovers repository containment with inert filesystem inspection,
reports VCS status as unavailable, and never invokes Git, jj, hooks, fsmonitor,
filters, or another repository-configured program. `resume-status` is explicit
because collecting VCS status can execute such programs; it remains status-only
and never resumes work.

| Workflow | Disposition | Invocation / boundary |
|---|---|---|
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

## Candidate and activation status

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

The setup hook is content-addressed to public and private settings. When the
user eventually applies the gated change, it reconciles packages with
`pi update --extensions` before installing Herdr's managed Pi integration.
There is no second installer, package symlink, tmux/cmux fallback, lifecycle
manager, or status reporter.

User-only activation, package listing, Pi reload/startup, `/workflows`, and live
workflow smoke remain pending until the independent gates pass. The smoke must
run from a fresh terminal and expect exactly the eight retained workflows.
