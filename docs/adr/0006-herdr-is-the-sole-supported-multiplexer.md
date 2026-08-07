# ADR-0006: Herdr is the sole supported multiplexer

**Status:** Accepted
**Date:** 2026-08-07
**Supersedes:** ADR-0001; the cmux-preservation and rollback invariants in ADR-0002
**Superseded by:** —
**Related:** ADR-0002 (fork lineage), ADR-0003 (editors in dedicated Herdr tabs),
`.pi/plans/2026-08-06-fedora-dotfiles-portability/plan.md`

## Context

ADR-0001 deliberately kept cmux and Herdr side by side while the Herdr path
was being proved. The current macOS session has repeatedly opened visible Pi
child panes through Herdr, and the repository now renders one Herdr-based
contract for both supported targets. Fedora runtime behavior and SSH-oriented
detach/reattach remain final rollout gates rather than evidence already
claimed here. Keeping cmux configured, documented, and tested would preserve
two product paths after the decision has moved to one.

The external `Attamusc/pi-interactive-subagents` package remains generally
multi-backend. Its reusable backend support is a package concern; it does not
obligate this dotfiles repository to configure or guarantee every backend.

## Decision

**This repository configures, tests, documents, and guarantees Herdr as its
sole multiplexer for Pi and visible subagent sessions.**

- The repository does not install or configure pi-cmux, expose CMUX paths,
  carry a cmux skill, or direct agents to a cmux workflow.
- `Attamusc/pi-interactive-subagents` may retain generic cmux, tmux, zellij,
  and WezTerm backend code. This repository selects and supports Herdr only.
- tmux remains a shared interactive terminal tool; it is not a repository-
  supported Pi/subagent fallback contract.
- Herdr keeps its automatic per-user server model. No systemd unit or second
  lifecycle manager is introduced.
- Editors and Pi continue to run in dedicated adjacent Herdr tabs as decided
  by ADR-0003.
- Rollback is version-control-based. A regression is handled by reverting the
  relevant configuration decisions, not by retaining an in-repository cmux
  shim, dormant package entry, or runtime fallback.

## Consequences

The shared macOS/Fedora target has one pane model, one integration boundary,
and one runtime smoke contract to maintain. Active managed configuration can
reject cmux references without rewriting historical ADR evidence or removing
generic backend code from external packages.

The former guarantee that cmux continues to work no longer applies. A Herdr
regression therefore blocks rollout or triggers an explicit revert; silently
routing to another mux would violate this decision. Final host verification
must open a real Pi child in a Herdr pane and confirm detach/reattach behavior.
