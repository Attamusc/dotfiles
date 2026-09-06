# ADR-0007: Herdr manages the Pi integration

**Status:** Accepted
**Date:** 2026-08-19
**Supersedes:** The external `pi-herdr` reporter decisions in ADR-0001 and ADR-0002
**Superseded by:** —
**Related:** ADR-0006 (Herdr is the sole supported multiplexer)

## Context

The pinned `Attamusc/pi-herdr` package reports `idle`, `working`, and `blocked` state under source `pi-herdr`, but it does not report Pi Session identity. It also targets an older Herdr request shape: its tool-status field is `custom_status`, while Herdr protocol 19 expects `message`, and it reacts to `agent_end` rather than Pi's later `agent_settled` event.

Herdr 0.8.0 ships a managed Pi integration. A live control installed integration version 8, started a fresh Pi TUI in Herdr, and observed `agent_session.source = herdr:pi`, `kind = path`, and a value equal to `PI_SESSION_FILE` while status remained `working`. A separate identity-only reporter received successful RPC responses but did not become recognized Session evidence, so splitting status and identity across unrelated sources is not a supported assumption.

## Decision

**This repository installs Herdr's managed Pi integration and does not install the external `Attamusc/pi-herdr` package.**

- `.data/pi/agent/settings.json` contains no `pi-herdr` package entry.
- The ordered Pi setup hook runs `herdr integration install pi` after reconciling Pi packages on macOS and Fedora.
- Chezmoi does not copy or edit `~/.pi/agent/extensions/herdr-agent-state.ts`; Herdr owns and may replace that generated file.
- Runtime consumers depend on Herdr's protocol evidence (`source = herdr:pi`, `agent = pi`, `kind = path`), not on the generated extension's implementation.
- No second Pi status reporter is retained as a fallback. Rollback is an explicit version-control decision, consistent with ADR-0006.

## Consequences

Pi status and pane-to-Session identity now have one reporting owner aligned with the installed Herdr version. Session start, resume, fork, reload, retries, compaction, and reconnect refresh use Herdr's maintained lifecycle hooks and monotonic report sequence.

The managed integration listens for semantic `herdr:blocked` events. Extensions that need to expose blocked child work should publish that event rather than add another Herdr status reporter.

Applying the dotfiles requires the managed Herdr binary before the Pi setup stage. Integration-install failure stops the apply instead of silently leaving Pi without Session evidence. Updating Herdr may update the generated integration on the next content-triggered setup run or explicit reinstall.
