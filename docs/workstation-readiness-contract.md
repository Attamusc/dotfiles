# Observational workstation readiness, v1

## Decision and scope

Implement one repo-local command, not an installed helper:

```sh
python3 -I -S -B scripts/workstation-readiness.py
python3 -I -S -B scripts/workstation-readiness.py --json
```

Python 3.10+ standard library only. The supported invocation uses isolated mode
and disables site initialization (`-I -S`) to ignore Python environment/path hooks
and user/system site customizations before the helper starts; `-B` avoids bytecode
writes. A trusted Python executable/standard library remains a prerequisite.
No subprocesses, including version probes, Git, mise, Pi listing, authentication
probes, shell startup or third-party package imports.
No writes, downloads, installs, repair, reconciliation, hooks, server startup,
model/provider calls or lifecycle ownership. The report describes filesystem
observations, **not a healthy or fully configured workstation**. No general
plugin/diagnostics framework, selectable check sets or extra CLI switches.

Supported policy targets are Fedora 44 and macOS. `os.uname().sysname` selects
Darwin/Linux/other without running `uname`; only Linux reads the release file
below. macOS version and architecture compatibility are manual gates. Do not
infer supported native LSP artifacts from OS support.

## Exact checks and authorities

Emit checks in this order; expand command rows in the order shown. IDs and
classification are fixed in schema v1.

| IDs | Class | Observation / source of truth |
|---|---|---|
| `host.platform` | required | Darwin => present; Linux with `ID=fedora`, `VERSION_ID=44` => present; readable other identity => unsupported; unreadable/malformed identity => unknown. README supported targets and `.github/copilot-instructions.md`. |
| `command.<name>` for `herdr nvim hx pi opencode copilot gh jj just tv mosh spin go cargo rustc node npm npx` | required | Executable candidate on inspected PATH. Exact focused-smoke command set from README (deduplicate nvim). |
| `command.chezmoi`, `command.mise` | required | Same observation; bootstrap/apply and runtime authorities in README. |
| `command.pup` | optional | Same observation on Darwin; not-applicable elsewhere. macOS-only package exception; never a shared-baseline failure. |
| `optional-lsp.<name>` for `typescript-language-server tsc pi-lsp-rust-analyzer ruby ruby-lsp` | optional | Same PATH observation only; README optional LSP policy and ADR-0008. Dedicated Ruby launch configuration need not expose ruby-lsp on PATH. Missing is not a broken installation verdict. |
| `manual.compatibility` | manual | Compatible installed versions, runtime ownership and native build prerequisites unverified. |
| `manual.pi-packages` | manual | Configured pins, installed revisions, activation, workflows and MCP readiness unverified. |
| `manual.herdr` | manual | Managed integration, pane Session identity/status and detach/reattach unverified. |
| `manual.lsp` | manual | Native artifact integrity, selected runtime environment and actual language requests unverified. |
| `manual.credentials` | manual | Git/gh/provider authentication unverified. |
| `manual.editor` | manual | Neovim headless startup unverified. |

This is a focused baseline, not an exhaustive package audit. Native package
names are not executable names: `packages/Brewfile` and `packages/fedora.txt`
remain install authorities, not a generated command inventory.
`dot_config/mise/config.toml.tmpl` owns runtime/Pi pins (currently Pi 1.3.0).
`.data/pi/agent/settings.json` owns public package declarations;
`dot_config/pi-lsp/runtimes.json` owns optional native artifact pins.
These are source references, **not runtime input files** in v1. No installed
version/pin-match claim is possible within this allowlist.

`docs/pi-workflows.md` separates source pin, reconciliation and fresh-process
activation; its Pi 1.1.0 prose is stale relative to the mise template. Use the
template as pin authority; correcting that other document is outside this task.
ADR-0006/0007 require Herdr alone and its managed integration, not a generated
file or executable-presence heuristic. ADR-0008's initial TS-only slice is
historical; current README describes Rust/Ruby, still optional.

## Input, filesystem and privacy boundary

The following is the complete runtime allowlist (apart from Python loading its
own standard library and this script):

* Read only `HOME` and `PATH` from the environment. HOME is an absolute-path
  anchor, never a directory to enumerate or an output field. No other environment
  variables, shell functions or aliases are inspected. An absent/nonabsolute
  HOME makes all PATH observations unknown without inspecting candidates; never
  substitute passwd data. Resolve only bounded anchor metadata when needed to
  protect both lexical HOME/repo paths and their known symlink aliases.
* Read `/etc/os-release` on Linux only: regular file, at most 4096 bytes plus
  one overflow-detection byte. Permit the usual `/etc/os-release` symlink only
  if its normalized target is `/usr/lib/os-release`; require that target to be
  a nonsymlink regular file. Parse only ID and VERSION_ID, allowing unquoted or
  matching single/double quotes; no shell expansion. Duplicate keys, malformed
  selected keys, over-limit data or I/O failure => unknown. Never echo bytes.
* PATH: at most 16 KiB encoded and 128 colon-separated components. Ignore empty
  and relative components (never search CWD); deduplicate absolute components.
  Over-limit input => all PATH observations unknown, without partial success.
  Inspect only fixed command basenames above under those components, in order.
  No directory enumeration or contents read, executable hashing, shebang parsing,
  package cache traversal, settings reads or socket connections.
* Metadata only: lstat/stat and executable-access checks for exact candidates
  and their ancestor directories, plus bounded public-anchor metadata for HOME,
  the repo root and HOME `.config` needed to protect their known aliases.
  Never enumerate `.config` or inspect its excluded `opencode` child.
  Follow symlinks for these metadata checks,
  with at most 16 link hops and a 4096-byte path limit per candidate; detect
  loops. Never display link targets. A candidate must resolve to a regular file
  executable by the current user. Never open an executable or FIFO/device.
* Before traversing or following any candidate, lexically exclude paths under
  repo `.data-private`, repo `.local-skills`, HOME `.pi`, HOME `.agents`, HOME
  `.copilot`, HOME `.config/opencode`, HOME `.gitconfig.local` and HOME `.localrc`.
  Apply the same exclusions, including known resolved anchor aliases, to every
  symlink target/ancestor before inspecting it. Do not stat an excluded root;
  return an inconclusive candidate. This is not a filesystem sandbox: unknown
  mount aliases and hostile concurrent replacement are outside its guarantee.

The repo root is the script's parent directory's parent, not a Git query or
search of CWD. No recursive scans anywhere. Permission errors, forbidden paths,
link limits and races map to unknown if no later candidate proves presence.
A safe executable candidate proves `present`; otherwise `missing` requires a
complete inspected search with no inconclusive candidate. An absent PATH is
unknown; an explicitly empty PATH is missing (no search directories).

Output uses fixed strings and enumerations only: no raw exceptions, arbitrary
stderr, file contents, environment values, timestamps, host/user names, full
paths, symlink targets, credential presence, repositories or session identifiers.
Do not consult merged home assistant settings, credentials, private overlays,
local skills, package checkouts, history or sessions, even to prove absence.
No persistent output/cache/bytecode/log files. Filesystem reads may update atime;
non-mutation means no deliberate filesystem changes, not an atime guarantee.

## Stable output and exit contract

Human header is `Workstation readiness v1 (observational)` followed by one line
per check: `<id> <class> <status> <reason>`. Final line:
`baseline=<clear|blocked|inconclusive> runtime=unverified`.
JSON is one UTF-8 object plus newline; no progress text. Exact shape:

```json
{
  "schema_version": 1,
  "scope": "filesystem-only",
  "baseline": "inconclusive",
  "runtime": "unverified",
  "checks": [
    {"id": "host.platform", "class": "required", "status": "present", "reason": "supported-platform"},
    {"id": "command.herdr", "class": "required", "status": "unknown", "reason": "inspection-incomplete"}
  ]
}
```

Example is an abbreviated checks array; real output always contains every row.
Each check has exactly those four keys. Status is `present`, `missing`,
`unknown`, `unsupported`, `manual`, or `not-applicable`. Reasons are fixed:
`supported-platform`, `unsupported-platform`, `inspection-incomplete`,
`executable-candidate`, `no-executable-candidate`, `manual-verification`,
`platform-excluded`. Manual rows always use manual/manual-verification.
No version strings or installed package facts are emitted. Output <=16 KiB.

Required missing/unsupported => blocked, exit 1. Otherwise required unknown =>
inconclusive, exit 2. Otherwise clear, exit 0. Optional/manual rows never change
baseline or exit. Clear means only that these required observations succeeded.
Invalid arguments/internal failure before emission => exit 2, fixed
`readiness: usage-error` or `readiness: internal-error` on stderr, no traceback or
partial report. Help (`--help` or `-h`) exits 0. Output write/flush failure also exits 2 with the
fixed internal-error diagnostic on a best-effort basis; failed pipes/devices may
physically contain partial bytes, and failed stderr cannot guarantee a diagnostic.
Suppress shutdown retries rather than exposing raw I/O exceptions.
Normal reports leave stderr empty. New IDs/semantics require schema-version bump;
changing declared source pins alone does not.

## Implementation and verification handoff

Refine downstream **TODO-2d54608b** to own only
`scripts/workstation-readiness.py`, `tests/test_workstation_readiness.py`, and
`tests/fixtures/workstation-readiness/` (synthetic public fixture data only).
Implement the contract above; expose small testable observation functions with
explicit HOME/PATH/system/release-file inputs for unit tests, not extra public
flags. Use direct filesystem operations; do not reuse a subprocess-based helper.

Before implementation, write failing tests for exact IDs/order/schema, human
format, all exit outcomes, optional isolation and every input boundary. Proposed
verification commands from repo root:

```sh
python3 -I -S -B -m unittest discover -s tests -p 'test_workstation_readiness.py'
python3 -I -S -B scripts/workstation-readiness.py --json
```

The second command is a real host observation, not a required exit-0 test on an
unsupported/incomplete host. Retain bounded output and exit status. Run macOS
and Fedora simulations through injected unit inputs, not fake real-host claims.
Fixtures must use temporary HOME/PATH and a public-only temporary source layout.
Cover executable/nonexecutable files, broken links/loops, executable directories,
shims that would write sentinels if run, denied paths, forbidden symlink targets,
empty/relative PATH, oversize PATH/release data, malformed/duplicate release
keys, unsupported Linux and Darwin. Include names/paths containing secret canary
strings; assert neither output stream reveals them. Test synthetic private roots,
merged settings, credential files and FIFOs with read/stat tripwires: none may be
visited. Deny subprocess/process-spawn/socket APIs and nonallowlisted opens in
unit tests; sentinel executables alone do not prove no subprocess was attempted.
Use a synthetic PYTHONPATH/sitecustomize canary in a CLI test to show the supported
isolated invocation does not load it. Unit instrumentation and fixture construction
are test-runner behavior, not additional reads granted to the production helper.

Compare fixture contents, modes, symlink targets and directory entries before
and after both success/error paths; assert no cache/bytecode/report writes.
Use `scripts/protected-local-state.py` snapshot/compare only against synthetic
HOME and temporary source trees if useful; it recursively reads protected state
and must not be called against live private roots for this check. The production
CLI must not import it. Test instrumentation may write test-runner artifacts
outside observed fixture roots. Keep expected JSON/human snapshots deterministic.

Refine downstream **TODO-da744725** to own README documentation of the new
command and its exit/privacy limitations, plus focused portability-test wiring
only after the unit suite exists. Reuse `scripts/check-portability.sh`'s isolated
public-source test boundary; do not duplicate its render/pin contract tests or
invoke live readiness as a portability success criterion. Do not install a home
helper, add setup hooks, or turn optional LSP probes into baseline requirements.
Both downstream changes need independent Claude-seat review under parent policy.

## Manual gates and evidence status

Only the user, with separately approved commands, can establish installed
versions/ownership, `pi list`, package activation and eight retained workflows,
provider authentication, native LSP requests, Neovim startup, and a real Pi child
inside Herdr with managed Session identity/status and SSH detach/reattach.
Fresh terminal/fresh Pi is necessary after environment changes. macOS must be
verified on actual macOS; synthetic Darwin fixtures prove report policy only.
No second Herdr manager/reporter or tmux fallback is introduced.

Specification source revision: `9d7be0a`. Evidence here is bounded inspection of
public README/manifests/settings, ADR-0006–0008, workflow docs and existing helper
code. Portability already passed in the parent session; it was not rerun here.
No runtime host readiness, installed pin matching, activation or macOS smoke was
measured. This document is the only artifact of this discovery task.
