# Source-owned optional pi-lsp runtime setup

Date: 2026-09-08.

## Ownership

The runtime setup is authored in chezmoi source, not through edits to generated
home files:

- `dot_config/pi-lsp/runtimes.json`: single manifest for versions, URLs and SHA-256
  digests; deployed as `~/.config/pi-lsp/runtimes.json`.
- `dot_local/bin/executable_pi-lsp-setup`: explicitly invoked installer.
- `dot_local/bin/executable_pi-lsp-rust-analyzer.tmpl`: analyzer-only Rust
  toolchain selection.
- `dot_config/private_zsh/config/pi-lsp.zsh.tmpl`: exports consumed by pi-lsp,
  loaded by the existing zsh configuration loader.

No bootstrap hook invokes setup. Existing Ruby/Rust interpreters are prerequisites;
installation does not change global defaults or the global gem set. Artifacts,
download caches, and integrity receipts under `~/.local/share/pi-lsp/` are outputs.
The reusable LSP implementation remains in its external package, unchanged.

## Pinned inputs

- rust-analyzer release 2026-09-07, exact standalone version 0.3.3041.
  macOS arm64/amd64 and Fedora amd64 archive digests were obtained from the
  official GitHub release API.
- Rust 1.97.1 standard-library sources, from the official 2026-07-16 distribution
  manifest. The downloaded gzip tar SHA-256 matched
  `59f02b4f23fd8d7193a3cb17ea192255ccf02f1109783d7988521334891d27ae`.
- Ruby 4.0.1, Ruby LSP 0.26.11, language_server-protocol 3.17.0.6, logger 1.7.0,
  and RBS 4.2.0. All four gem downloads have pinned SHA-256 digests.
  The RBS Ruby-platform artifact was selected explicitly; the RubyGems v2 endpoint
  initially returned the different Java-platform digest for that version.

Primary metadata sources:

- https://api.github.com/repos/rust-lang/rust-analyzer/releases/tags/2026-09-07
- https://static.rust-lang.org/dist/2026-07-16/channel-rust-1.97.1.toml
- https://rubygems.org/api/v1/versions/rbs.json
- https://rubygems.org/api/v2/rubygems/ruby-lsp/versions/0.26.11.json

## Corrections made before installation

The first archive-layout report was wrong: the actual pinned Rust source gzip tar
contains the library tree directly, not a nested xz archive. The original extractor
failed closed on the real artifact. The corrected streaming extractor selected
3,483 regular files with no links, including all three required source roots.
Synthetic tests were changed to match the actual flat archive layout; no fallback
for the incorrect layout was retained.

Other pre-install corrections added bounded subprocesses, clean prerequisite
checks, absolute-only command lookup, ignored curl configuration, exclusive cache
files, per-component receipts, raw Ruby-LSP executable verification, and a
non-blocking setup lock. The installer refuses existing unowned/corrupt targets
rather than replacing them. A re-pin within the same directory name requires an
explicit operator move, as documented.

## Verification results

| Check | Observed result |
|---|---|
| Installer tests | 14 passed |
| `scripts/check-portability.sh` | Passed, including all three platform renders, zsh exports, launcher argument forwarding, and caller-environment preservation |
| Independent security/isolation review | PASS; archive-layout correctness issue identified |
| Independent archive close-out | PASS after real-artifact extraction verified |
| Targeted `chezmoi apply --exclude=scripts` | Applied the manifest directory, setup command, launcher and zsh config only |
| Applied source comparison | Installer and manifest match their repository sources |
| Actual `pi-lsp-setup` | Exit 0; persistent artifacts installed and verified |
| Three consecutive verification reruns | Exit 0; reported already installed and verified, without rebuilding |
| Fresh interactive zsh | Loaded all five source-managed `PI_LSP_*` settings |
| Persistent-runtime Pi SDK smoke | TS hover, Ruby hover/parser diagnostics, Rust definition/native diagnostics succeeded through the installed Pi package |
| Post-use setup verification | Exit 0; LSP usage did not invalidate installed-file receipts |
| Application runtimes | Ordinary Rust remains 1.93.0; Ruby remains 4.0.1; normal gem environment still has no ruby-lsp |
| Protected local state | All four protected roots unchanged; no `.localrc` edits |

The first targeted apply attempted the JSON child before its new parent existed.
The documented command now targets the managed `~/.config/pi-lsp` directory,
allowing chezmoi to create it without hand-creating generated directories or
applying unrelated parents.

Persistent runtime paths are versioned under `~/.local/share/pi-lsp/`. The Ruby
interpreter remains the existing mise-managed installation. The Rust launcher
selects already-installed 1.97.1 only for the analyzer and its descendants; the
calling shell's Rust choice is unchanged. No temporary test paths were placed in
the managed configuration.

## Remaining limits

Actual installation and native smoke ran on macOS arm64. macOS amd64/Fedora amd64
configuration and fixture tests passed, but native installs on those hosts remain
unverified. A new Pi process from a fresh shell is required to inherit environment
changes; `/reload` alone cannot update an existing process environment.

Supporting local logs (temporary): `/tmp/pi-lsp-setup-tests.log`,
`/tmp/pi-lsp-setup-portability.log`, `/tmp/pi-lsp-setup-install.log`,
`/tmp/pi-lsp-setup-rerun-{1,2,3}.log`, `/tmp/pi-lsp-setup-after-use.log`,
`/tmp/pi-lsp-persistent-smoke.log`, and `/tmp/pi-lsp-setup-archive-check.json`.
