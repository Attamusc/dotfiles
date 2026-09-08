# pi-lsp 0.2.0 / contract v2 validation

Date: 2026-09-08.
Package revision: `a8a850ec8b660e239e0a1c84d0ede63b73f95120` in private
`Attamusc/pi-lsp`. Previous revision: `22a4ece9a673d6db00fbba3f8c162cc62c073397`.

## Scope completed

Added TS/JS `hover`, `workspace_symbols`, and explicit `diagnostics` to the
existing `lsp` tool. Definition/reference result shapes remain unchanged.
The implementation and tests remain in the standalone package. Dotfiles only
change the pin, its portability assertion, and documentation.

No Ruby/Rust backend, automatic post-edit feedback, semantic mutation, DAP,
Herdr/subagent changes, Job abstraction, workflow controller, or shared telemetry
service was added. Language-server executables remain machine-owned.

## Decisions established by server evidence

- TS-LS 6.0.0 supports hover and workspace symbols, but not standard pull
  diagnostics. A symbol query without an opened anchor produced `No Project`.
- Push diagnostics have neither a completion marker nor document versions.
  Research observed an empty notification followed by 15,000 semantic errors.
  Waiting for the first event, or for a quiet interval, cannot establish clean
  diagnostics.
- Explicit diagnostics use the documented `typescript.tsserverRequest` bridge:
  `projectInfo`, synchronous syntax/semantic/suggestion queries, and active-config
  semantic plus locationless compiler-option queries. All share one deadline.
- Disabled, failed, malformed, cancelled, or observably stale checking is an
  error, never partial clean output. Outer custom-command cancellation is not
  forwarded to tsserver, so the owning generation is also terminated.
- A successful diagnostic result describes the requested file and its active
  config, not every workspace file. It explicitly identifies configured versus
  inferred projects. Inferred projects do not collect program-level option
  diagnostics or certify a nearby config that excludes the file.
- TS-LS chooses a most-recently-used document for symbol search. Reopening the
  requested anchor restores the intended project after other lookups.
- Config canonicalization must not replace the server's project identifier.
  A real symlinked-config regression failed until server identity was retained
  separately from the canonical display/trust/digest path.

The package's `docs/contract-v2.md` records the interface and primary-source
references; its README documents checking modes, bounds, and freshness limits.

## Verification

| Gate | Result |
|---|---|
| `npm test` in standalone checkout | **56 passed**, 0 failed |
| `npm run typecheck` | Exit 0 |
| `npm run pack:check` | Exit 0; nine production files, including contract documentation |
| Clean production tarball install / actual Pi loader (in suite) | Passed; no test dependencies installed |
| Independent core contract/security review | **PASS**, no blocking findings |
| Independent provider-schema close-out | **PASS**, no blocking findings |
| Authenticated clean Git install of published SHA | Exit 0; three runtime dependencies |
| Pi loader + exact semantic assertions against Git install | All five operations passed with contract-version-2 metrics |
| `scripts/check-portability.sh` with updated pin | Exit 0; Darwin/Linux rendered checks passed |
| Targeted live `pi install` and installed checkout HEAD | Exact new SHA installed once |
| Live settings comparison | Only the old LSP pin replaced; all other packages/order and non-package values unchanged |
| Protected local-state comparison | All four protected roots unchanged |

Tests cover real TS/JS signatures, symbol discovery, source and config errors,
locationless diagnostics, syntax/suggestions, checking modes, inferred projects,
broken-to-fixed results, config symlinks, and anchor selection. Failure tests
cover unsolicited push data, later-category timeout/cancellation/crash recovery,
metadata-preserving source/config edits, malformed responses, capability gating,
conditional inputs, UTF-8 result bounds, completeness metadata, and content-free
measurements.

## Real-agent test caught a provider-facing schema problem

Same prompt and fixture before/after the schema correction, Pi 0.85.1,
`github-copilot/gpt-5.6-sol`, low thinking. The prompt asked for a resolver's
signature and caller diagnostics; it did not instruct the model to use LSP.

Initially, the model populated irrelevant query/coordinate fields and all eight
LSP calls failed validation. It completed the task using `tsc` instead. The
schema allowed omission but provided no null value for provider paths that
populate every property. Responses-style strict schema normalization is a
relevant constraint; the effective remote strict-mode setting was not captured.

The correction permits explicit null for unused fields and converts it to
absence in a cloned argument object. Non-null irrelevant values, missing required
values, and unknown fields still fail. A new schema/execution regression went
red before the change and green after it.

The repeated task then made five successful LSP calls: hover, references, and
three explicit diagnostic requests. It correctly reported TS18048 at
`src/caller.ts:4:10` and TS2345 at `src/caller.ts:6:35`. No fixture files changed.
This proves usability on that provider/task, not general performance superiority.

## Rollout and remaining limits

The reviewed package was pushed to the existing private repository. Both public
settings and the exact portability assertion now select its full SHA. Live Pi
was updated with a targeted install rather than a blanket package update or
chezmoi apply. No server executable was installed or upgraded in this phase;
normal host PATH already supplied TS-LS 6.0.0 and TypeScript 6.0.2.

A session reload is needed to replace the running tool schema. Broader real-code
usefulness evaluation and real Fedora/SSH runtime checks remain separate work.
The bounded metadata scan still excludes documented dependency/cache trees;
there is no atomic project-version barrier. The existing rare stream-errno
classification edge remains documented in the prior validation record.

Local supporting artifacts (temporary, not a durable benchmark suite):
`/tmp/pi-lsp-v2-tests.log`, `/tmp/pi-lsp-v2-agent-before-nullable.json`,
`/tmp/pi-lsp-v2-agent-summary.json`, `/tmp/pi-lsp-v2-git-smoke.mjs`,
`/tmp/pi-lsp-v2-git-smoke.log`, `/tmp/pi-lsp-v2-portability.log`, and
`/tmp/pi-lsp-v2-settings-check.json`.
