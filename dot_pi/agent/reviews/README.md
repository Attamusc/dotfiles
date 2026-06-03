# Adversarial Reviewer Artifacts

This directory holds output from the `adversarial-reviewer` agent.

## Naming convention

```
<target-slug>-<YYYY-MM-DDTHH-MM-SSZ>.md       # primary artifact (always)
<target-slug>-<YYYY-MM-DDTHH-MM-SSZ>.json     # objection list sidecar (opt-in)
```

- `target-slug` is a kebab-case identifier derived from the review target (file basename, PR number, or first 6 words of a raw claim)
- Timestamp is UTC ISO-8601 with colons replaced by hyphens (filesystem-safe)

## When the JSON sidecar is written

- `/review --emit-json <target>` was used, OR
- The reviewer was spawned by another agent (not a human user) — sidecar enables programmatic chaining

## Contents (fixed sections — see grill artifact D6)

1. Header (verdict, target, mode, scope, timestamp, reviewer model)
2. Bottom Line (2–3 sentence verdict rationale)
3. Objections (numbered `O1, O2, …`)
4. Citation Shepardizing (research mode only)
5. Key Assumptions Surfaced
6. Pre-mortem Failure Modes (change mode only)
7. Competing Hypotheses / ACH matrix (research mode only)
8. Unfalsifiable / Out of Scope
9. What Would Change the Verdict (mandatory)

## Verdict scale

- `SURVIVES` — no material objections
- `SURVIVES WITH CAVEATS` — objections raised but none load-bearing
- `WOUNDED` — at least one load-bearing objection; rework recommended
- `DOES NOT SURVIVE` — central claim falsified or unsupported

## Provenance

Spec: `~/.pi/agent/grill/2026-06-03-adversarial-reviewer.md`
Plan: `~/.pi/agent/plans/2026-06-03-adversarial-reviewer.md`
Agent: `~/.pi/agent/agents/adversarial-reviewer.md`
