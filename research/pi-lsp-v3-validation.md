# pi-lsp 0.3.0 / contract v3 validation

Date: 2026-09-08.
Published package revision: `9496ab5a4fd6309c5647e4f358d1b6a0b0ff8409` in private
`Attamusc/pi-lsp`. Replaces `a8a850ec8b660e239e0a1c84d0ede63b73f95120`.

## Completed scope

Rust and Ruby join TS/JS behind the same five-operation `lsp` tool. Three fixed
backend definitions share transport, process ownership, deadlines, output limits,
and session shutdown. No plugin registry, Job framework, Herdr changes, mutation,
automatic post-edit feedback, or shared telemetry service was added.

The implementation, Ruby launch asset, contracts, and tests remain in `pi-lsp`.
Dotfiles select the new SHA and document support; native runtime installation
remains optional and machine-owned.

## Tested runtimes and provisioning

| Runtime | Evidence |
|---|---|
| rust-analyzer | Official 2026-09-07 standalone release, `0.3.3041-standalone (9074e9b4c6 2026-09-06)` |
| Analyzer artifact | `rust-analyzer-aarch64-apple-darwin.gz`, published SHA-256 `16e9b2af9db7c0ce015ffe88f85db27669b05c84887a59c737d697d2c5f8d349` verified |
| Rust | Already-installed 1.97.1 selected only in test-process environment |
| rust-src | Official 1.97.1 component downloaded into temporary storage; SHA-256 `59f02b4f23fd8d7193a3cb17ea192255ccf02f1109783d7988521334891d27ae` verified |
| Ruby | Existing Ruby 4.0.1 |
| Ruby LSP | 0.26.11 and dependencies installed only in a dedicated temporary GEM_HOME |
| Pi / TS baseline | Pi 0.85.1, TS-LS 6.0.0 / TypeScript 6.0.2 |

The host's ordinary Rust selection remains 1.93.0, its rust-analyzer shim remains
unusable, and its normal Ruby gem environment still has no ruby-lsp. No global
server, component, toolchain-default, or gem changes were made. The temporary
native installations are validation fixtures, not production configuration.

## Rust decisions

- Advertised pull diagnostics and successful initialize are insufficient evidence
  of readiness: research observed empty results while analysis was busy and with
  an incompatible toolchain.
- Require the tested analyzer version before `initialized`, wait for observed
  busy-to-healthy quiescence, and reject degraded/error states. This is advisory
  state, not an atomic completion barrier.
- Rust diagnostics are explicitly `complete:false`, `scope:file`, `coverage:native`,
  with tool status `partial`. They are not cargo-check or clean-build evidence.
- Metadata uses `cargo.metadataExtraArgs:["--locked","--offline"]`; ordinary
  `cargo.extraArgs` would silently fail to forward these flags to metadata.
- Keep complete local metadata resolution (`noDeps:false`), allow guarded metadata
  reload, and disable cargo check, build scripts, and procedural-macro execution.
  Child Cargo is offline and rustup auto-install is disabled.
- Select Cargo manifests explicitly and let Cargo resolve workspace membership.
  Fingerprint the trusted workspace to cover parent manifests and sibling crates.

## Ruby decisions

- Normal Ruby LSP startup can compose/install a bundle and load workspace add-ons.
  The package instead requires an explicit Ruby executable and dedicated gem home,
  launches the raw gem executable, selects a static package-owned Gemfile, and
  constructs a fresh allowlisted child environment.
- Preflight rejects visible `ruby_lsp` directories/symlinks because upstream's
  add-on loading has no supported disable option. It also rejects glob characters
  in the workspace root and existing `.ruby-lsp/bundle_env` files, which upstream
  would otherwise read and delete.
- Index-dependent operations require indexing progress begin/end without an
  observed error. Parser diagnostics are independent and explicitly syntax-only.
- References are tagged best-effort: bare-name method matching can conflate
  unrelated receivers, and reference scanning covers `.rb` files.
- These controls are not a sandbox against concurrent filesystem replacement or
  untrusted executables/gem environments. No project Bundler, Rails add-on,
  RuboCop, or Ruby type-checking integration is promised.

## Verification gates

| Gate | Result |
|---|---|
| Baseline TS/JS suite | 56 passed before implementation |
| Final native-enabled `npm test` | **84 passed, 0 failed, 0 skipped** |
| `npm run typecheck` | Exit 0 |
| `npm run pack:check` | Exit 0; 14 production files including Ruby Gemfile and both contracts |
| Independent core publish gate | **PASS**, no blockers |
| Independent Ruby startup close-out | **PASS**, no blockers |
| Clean authenticated Git install of published revision | Exit 0; three client runtime dependencies |
| Actual Pi loader + Git-package semantic smoke | All five operations exercised for TS, Ruby, and Rust; 15 successful calls with v3 metadata |
| Portability check | Exit 0; Darwin/Linux rendered contracts pass |
| Targeted live Pi install | Exact published revision installed once |
| Live settings comparison | Only LSP pin changed; prior package order and every non-package value preserved |
| Protected local state | All four protected roots unchanged |

Native tests prove cross-file definitions/references/hover/symbols, UTF-16 Ruby
syntax locations, broken-to-fixed parser results, no project Gemfile execution,
no add-on execution, no Ruby bundle/cache-file deletion, no build-script/proc-macro
sentinel execution, and no Cargo.lock creation when locked metadata fails. The
proc macro is a declared dependency and is actually invoked in the fixture.
Project contents and existing lockfiles remain unchanged.

Fake-server tests cover backend switching/reaping, per-operation providers,
version checks before project loading, readiness sequencing/error/cancellation,
root containment, Ruby safety guards, workspace-wide Rust invalidation, and
normalization/coverage metadata. Two test-harness defects were corrected: an
unbounded readiness wait and logging a readiness marker after notifying the client.

## Read-only real-agent smoke

A synthetic mixed Rust/Ruby task ran with read/find/grep/lsp tools only, without
instructions to prefer LSP. The model made 12 successful LSP calls, distinguished
`Primary#compute` from the unrelated `Other#compute`, and correctly explained that
Ruby's empty syntax diagnostics and Rust's partial native report do not establish
complete type checking. Fixture files were unchanged. This is a usability and
contract check, not evidence of general performance improvement.

## Rollout and remaining work

The reviewed package is published and both public settings and the portability
assertion select the same full SHA. Live installation updated only that package;
no blanket package update or chezmoi apply ran. Reload is needed to replace the
running tool schema. Native use additionally requires the explicit runtime setup
in the package README; no temporary fixture paths were saved in dotfiles settings.

Broader real-code evaluation, native Fedora runtime/SSH checks, and any automatic
diagnostics experiment remain separate. Conservative failure-message edge cases
remain documented (busy-with-error Rust state may time out; Ruby error notifications
may be attributed to indexing). Neither can produce a false clean result.

Temporary supporting artifacts: `/tmp/pi-lsp-v3-native-tests.log`,
`/tmp/pi-lsp-v3-agent-summary.json`, `/tmp/pi-lsp-v3-git-smoke.mjs`,
`/tmp/pi-lsp-v3-git-smoke.log`, `/tmp/pi-lsp-v3-portability.log`, and
`/tmp/pi-lsp-v3-settings-check.json`.
