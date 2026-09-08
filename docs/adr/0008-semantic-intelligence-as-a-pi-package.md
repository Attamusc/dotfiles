# ADR-0008: Semantic intelligence is a standalone Pi package

**Status:** Accepted (implementation and rollout tracked separately)
**Date:** 2026-09-08
**Related:** ADR-0006 (Herdr selection), ADR-0007 (managed Pi integration)

## Context

The public Pi settings select Git-installed capability packages, including
`pi-interactive-subagents` and `pi-television` at commit revisions and
`pi-hunk-review` at a release tag. The local settings template merges personal
overlays; the ordered Pi setup hook reconciles package pins. Installed Pi 0.85.1 supports
package manifests, package-owned npm dependencies, local-path development, and
Git commit/tag pins without vendoring extensions into dotfiles.

LSP navigation requires JSON-RPC transport, document synchronization, subprocess
ownership, tests, and independent releases. These responsibilities outlive this
personal configuration and form one cohesive package.

## Boundary classification

| Capability | Owner | Reason |
|---|---|---|
| LSP service and model-facing `lsp` tool | Standalone `pi-lsp` package | Protocol dependencies, lifecycle, tests, independent use |
| LSP measurements and contract version | Initially `pi-lsp` | One proven consumer; no shared telemetry framework |
| Personal server choices | Dotfiles / machine configuration | Environment policy, not protocol implementation |
| LSP package revision | Dotfiles | Reproducible composition |
| Visible child agents | Existing `pi-interactive-subagents` package | Already owns visible delegated execution |
| Herdr selection and installation | Dotfiles | Supported-environment policy under ADR-0006/0007 |
| Generic jobs | Undecided; no implementation | No second demonstrated consumer yet |
| Workflow definitions | Dotfiles | Personal orchestration policy |
| Generic multi-turn controller | Undecided; no implementation | Similar phases alone do not establish a useful shared contract |

This classification precedes creation of the standalone package. Its source
belongs in its own checkout, not `dot_pi/agent/extensions` or a dotfiles vendor
directory. Development may use a local Pi package path; shared configuration
must use an explicitly published Git revision or release, never a host path or
an unresolvable placeholder.

## Decision

Start with TypeScript/JavaScript `definition` and `references` behind one `lsp`
tool. The extension is an adapter over a package-owned service using a maintained
JSON-RPC/LSP library. Mutation operations, automatic diagnostics, other language
backends, generic jobs, and workflow controllers are outside this vertical slice.

The service owns hidden language-server subprocesses directly. LSP requires
framed stdin/stdout, current disk documents, bounded requests, session reuse, and
shutdown/recovery. It does not require a PTY, operator takeover, visible topology,
or persistence independent of Pi. Herdr would add terminal state without meeting
an unmet LSP requirement. No Herdr dependency or status reporter is added.

**Language servers remain optional, machine-owned prerequisites on macOS and
Fedora.** Installing the Pi package does not guarantee any server executable or
silently expand the shared native/toolchain manifests. Missing executables must
produce an actionable tool error while ordinary Pi tools remain usable. Initial
support requires `typescript-language-server` and TypeScript; the package's own
real-server tests may install pinned development dependencies in its checkout.
Ruby and Rust provisioning will be decided when those backends are implemented.

Instrumentation starts as versioned, content-free measurements in the package.
No prompts, source, repository paths, arbitrary server error messages, or
credentials belong in telemetry. A separate telemetry/QA tool is not warranted
before ordinary result metadata and developer tests prove insufficient.

## Consequences

Dotfiles changes are limited to a package pin, documentation, and integration
contract tests. Existing package pins, Pi model/session configuration, editing
tools, Herdr integration, and subagent behavior stay unchanged.

Package correctness and usefulness are separate gates. A real-server fixture
and independent Pi load test establish operation and packaging; they do not
establish better agent reasoning or natural tool adoption. Comparative sessions
must use the same tasks without telling the model to use LSP.

## Evidence

- `.data/pi/agent/settings.json`: installed capabilities and explicit pins.
- `dot_pi/agent/settings.json.tmpl`: public/private composition boundary.
- `.chezmoiscripts/run_onchange_after_30-setup-pi.sh.tmpl`: package reconciliation
  followed by Herdr's managed Pi integration.
- `README.md`, Machine-local configuration: additional language servers are
  outside the shared baseline.
- `scripts/check-portability.sh`: isolated macOS/Fedora rendered pin checks.
- Installed Pi 0.85.1 `docs/packages.md` (under the Homebrew `0.84.3` directory):
  `pi.extensions`, runtime dependencies,
  local paths, Git pins, and package reconciliation semantics.
- Existing `pi-television`, `pi-hunk-review`, and `pi-interactive-subagents`
  manifests: separate capability repositories loaded via Pi package manifests.
