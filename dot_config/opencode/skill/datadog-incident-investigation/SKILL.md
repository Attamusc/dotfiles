---
name: datadog-incident-investigation
description: "Systematic Datadog investigation of production incidents (SLO breaches, monitor fires) followed by an Obsidian vault write-up. Use when asked to investigate an incident, dig into a monitor firing, find the root cause of an SLO breach, or write up findings from a production issue. Triggers include: 'investigate this incident', 'what caused the SLO breach', 'write up what happened', 'dig into why [monitor] fired', 'find the root cause of [incident]', 'document the [date] outage'."
---

# Datadog Incident Investigation

## Overview

This skill guides a two-phase workflow: (1) systematic Datadog investigation to reconstruct the full causal chain of an incident, and (2) an Obsidian vault write-up following the established format.

**Prerequisite:** Obsidian must be running (CLI commands require it). See the `obsidian-cli` skill for setup.

## Phase 1: Investigation

Read `references/investigation-playbook.md` for the full six-phase playbook. The phases in order:

1. **Identify** — Get the monitor, alert time, recovery time, PagerDuty ID
2. **Bound** — Find the exact customer-visible impact window (may be wider than monitor window)
3. **Find the trigger** — What changed just before impact? (Puppet, deploy, traffic spike)
4. **Trace the causal chain** — Work forward layer by layer from trigger to customer impact
5. **Scope and differentiate** — Which hosts/regions were affected? Why not others?
6. **Rule out alternatives** — Confirm root cause; eliminate other plausible explanations

### Key investigation principles

- Always query metrics `by {host}` to isolate which specific entity is driving the anomaly
- Use `raw_data=true` on `get_datadog_metric` when you need 20-60s resolution for precise timing
- Work backwards from impact to find the trigger, then forward to confirm the causal chain
- Find a peer entity that received the same trigger without impact — compare their pre-incident state
- Check `*.max` vs `*.count` to distinguish exhaustion from disruption (if count << max, not exhaustion)
- Puppet events: search `search_datadog_events(query="puppet host:<host>")` with a +/-30 min window around impact start

## Phase 2: Write-Up

After completing the investigation, create the note using the Obsidian CLI. The property schema comes from `[[utilities/templates/atlas/resources/Investigation]]` (Investigation template).

### Create the note

```bash
# Step 1: Create the note with body content
obsidian create path="atlas/notes/Availability Incident - <monitor-name> <YYYY-MM-DD>.md" content="<body>"

# Step 2: Set properties per the Investigation template schema
obsidian property:set path="atlas/notes/Availability Incident - <monitor-name> <YYYY-MM-DD>.md" name=is value="[[atlas/entities/resource]]"
obsidian property:set path="atlas/notes/Availability Incident - <monitor-name> <YYYY-MM-DD>.md" name=in value="[[atlas/collections/Investigations.base]]" type=list
obsidian property:set path="atlas/notes/Availability Incident - <monitor-name> <YYYY-MM-DD>.md" name=date value="<YYYY-MM-DD>" type=date
obsidian property:set path="atlas/notes/Availability Incident - <monitor-name> <YYYY-MM-DD>.md" name=subject value="Reliability" type=list
obsidian property:set path="atlas/notes/Availability Incident - <monitor-name> <YYYY-MM-DD>.md" name=subject value="Incident" type=list
# Add service-specific subject tags as needed:
obsidian property:set path="atlas/notes/Availability Incident - <monitor-name> <YYYY-MM-DD>.md" name=subject value="<ServiceName>" type=list
```

### Property schema (from Investigation template)

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `is` | link | yes | `[[atlas/entities/resource]]` |
| `in` | list | yes | `[[atlas/collections/Investigations.base]]` |
| `date` | date | yes | Incident date |
| `subject` | list | yes | Always includes "Reliability" and "Incident"; add service names |

### Note body sections

Fill in all sections:

| Section | What to write |
|---------|--------------|
| Executive Summary | Single paragraph: what fired, root cause, mechanism, impact, resolution |
| Customer Impact | Scope (region/protocol/shard), error type, SLO breach value, PagerDuty ID |
| Detection | Which monitor fired first, lead time before SLO breach, monitor IDs |
| Timeline | Full chronological table, timestamps to the second for trigger, minutes for intermediate steps |
| Root Cause Analysis | Mechanism explanation + why-this-host comparison table + causal chain diagram |
| Pre-Incident State | Metrics with values from the hour before the trigger; explain the vulnerable condition |
| Disruption Detail | Optional deep-dive table (e.g., conntrack count at 20s intervals) |
| Prevention | 3-6 concrete, specific measures ordered by impact |
| Repair Items | Short term (actionable now) and long term (structural) |
| Key Monitors | Table of all monitors that fired, with IDs, thresholds, fire/recover times |

### Write-up style rules

- This is a personal investigation note, not an official review — write in detailed technical narrative style
- The causal chain section should include a code-block ASCII diagram showing the flow
- Explain *why* each step propagated to the next (don't just list events)
- When ruling out alternatives, state explicitly why the evidence rules each one out
- Be specific with numbers: use actual metric values, not vague descriptions

### Optional: Append summary to daily note

After creating the investigation note, optionally append a brief summary to today's daily note:

```bash
obsidian daily:append content="- Investigated [[atlas/notes/Availability Incident - <monitor-name> <YYYY-MM-DD>]]: <one-line summary>"
```

## Resources

- `references/investigation-playbook.md` — six-phase playbook with query patterns and per-layer metric guidance
- `[[utilities/templates/atlas/resources/Investigation]]` — Templater template (vault); property schema reference
