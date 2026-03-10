# Datadog Incident Investigation Playbook

## Table of Contents
1. [Phase 1: Identify the Incident](#phase-1-identify)
2. [Phase 2: Bound the Impact Window](#phase-2-bound)
3. [Phase 3: Find the Trigger](#phase-3-trigger)
4. [Phase 4: Trace the Causal Chain](#phase-4-causal-chain)
5. [Phase 5: Scope and Differentiate](#phase-5-scope)
6. [Phase 6: Rule Out Alternatives](#phase-6-rule-out)
7. [Query Patterns](#query-patterns)

---

## Phase 1: Identify the Incident {#phase-1-identify}

**Goal:** Get the authoritative record — monitor, alert time, recovery time, PagerDuty.

1. Use `search_datadog_monitors` with the monitor name or ID from the user's description.
2. Use `search_datadog_incidents` to find any linked PagerDuty/DD incidents (filter: `state:active` or recent window).
3. Record:
   - Monitor ID and threshold
   - Exact fired time and recovery time
   - Breach value vs. threshold
   - Scope tags (service, host, env, shard)

---

## Phase 2: Bound the Impact Window {#phase-2-bound}

**Goal:** Establish the precise start and end of customer-visible impact, which may be wider than the monitor's alert window.

1. Look at **GLB 5xx metrics** (e.g., `avg:glb.http.5xx{*} by {backend}`) in the ±30 min around the monitor fire time.
2. Check **babeld/fs-connect failures** if the monitor is babeld-related.
3. Check **SLO error budget metrics** (`slo:*`) for the breached SLO.
4. Record: first spike time, peak time, recovery time — these bound your investigation window.

---

## Phase 3: Find the Trigger {#phase-3-trigger}

**Goal:** Find what changed just before the impact started. Work backwards from impact start.

### Check Puppet/Deploys (most common for infra incidents)
```
search_datadog_events(query="puppet", from="impact_start - 30m", to="impact_start + 5m")
search_datadog_events(query="deploy OR deployment OR rollout", from=..., to=...)
```
- Look for Puppet version hashes applied to impacted hosts/roles in the 5–30 min window before impact
- Note which hosts received which version and at what time
- Multiple hosts may receive different versions — correlate carefully

### Check for Configuration Changes
```
search_datadog_events(query="config change OR sysfs", ...)
search_datadog_events(query="host:<impacted-host>", ...)
```

### Check for Traffic Spikes
- Query request rate metrics for the impacted service in the pre-impact window
- Compare to the same window 1 day/1 week prior

---

## Phase 4: Trace the Causal Chain {#phase-4-causal-chain}

**Goal:** Show step-by-step how the trigger propagated to customer impact. Work forward from trigger.

For each layer between trigger and impact, get a metric timeline:

| Layer | Metric to query | What to look for |
|-------|----------------|-----------------|
| Kernel/OS | `system.net.conntrack.count`, `system.net.conntrack.drop`, `system.load.1`, `system.cpu.*` | Sudden drops, spikes, or instability after trigger |
| Application queue | `governor.<app>.queued.*` | Queue growth after trigger; hard cap saturation |
| Application errors | `<app>.errors`, `<app>.5xx` | Error rate rise |
| Service mesh | `spokes.replica.repo.global.bad`, babeld fs-connect metrics | Replica marked bad |
| GLB/frontend | `glb.http.5xx`, `glb.http.503` | 503 spike timing |
| SLO | SLO breach value | Correlates with GLB 5xx peak |

Always query with `by {host}` to isolate which specific host(s) are driving the anomaly.

**Timeline construction:** Build a precise timeline table with timestamps accurate to seconds for the trigger, and minutes for intermediate steps. Use `raw_data=true` on metrics for 20–60s resolution when needed.

---

## Phase 5: Scope and Differentiate {#phase-5-scope}

**Goal:** Determine exactly which hosts/regions/services were affected and why — especially why others were not.

1. **Identify all impacted hosts:** Query queue/error metrics `by {host}` and find which hosts show anomalies.
2. **Find peer hosts that received the same trigger but were unaffected:**
   - Query the same metrics for peer hosts in the same role/rack/region
   - Compare load, connection counts, and other state metrics *before* the trigger
3. **Quantify the difference:** What was different about the impacted host(s)?
   - Higher load average? More tracked connections? Different rack? Already in broken state?
4. **Check rack-level infrastructure** if host-specific: query TOR switch metrics (`switch.load.*`) to rule out network-level causes.
5. **Check maintenance/broken state:** Events for `maintenance_state:broken` on related hosts.

---

## Phase 6: Rule Out Alternatives {#phase-6-rule-out}

**Goal:** Confirm the identified root cause and eliminate other plausible explanations.

Common alternative hypotheses to check:

| Hypothesis | How to rule out |
|-----------|----------------|
| Table/resource exhaustion | Check `*.max` vs. `*.count` — if count << max, exhaustion is not the cause |
| Network failure | Check switch metrics; check if impact is isolated to one host vs. entire rack |
| Traffic surge | Check request rate metrics pre-incident; compare to baseline |
| Unrelated broken host | Check if host was already in broken/maintenance state before the trigger |
| Code deploy | Check for app deploys (not just Puppet) in the trigger window |

For each alternative: state clearly why the evidence rules it out.

---

## Query Patterns

### Conntrack disruption detection
```
get_datadog_metric(
  queries=["avg:system.net.conntrack.count{host:<host>}"],
  from="incident_start - 30m", to="incident_start + 60m",
  raw_data=true
)
```
Compare count vs. max. A sudden drop (not gradual) with no `insert_failed` or `drop` spike = resize disruption, not exhaustion.

### gitrpcd queue saturation
```
get_datadog_metric(
  queries=["avg:governor.gitrpcd.queued.githttp{host:<host>}"],
  from=..., to=..., raw_data=true
)
```
Hard cap of 4097 = fully saturated.

### Host load comparison (affected vs. unaffected)
```
get_datadog_metric(
  queries=[
    "avg:system.load.1{host:<affected-host>}",
    "avg:system.load.1{host:<peer-host>}"
  ],
  from="incident_start - 1h", to="incident_start + 30m"
)
```

### Puppet event correlation
```
search_datadog_events(
  query="puppet host:<host>",
  from="impact_start - 30m",
  to="impact_start + 10m",
  sort="timestamp"
)
```
Look for version hash, exact timestamp, and which resources were applied.

### Spokes bad replica detection
```
get_datadog_metric(
  queries=["sum:spokes.replica.repo.global.bad{host:<host>}"],
  from=..., to=..., raw_data=true
)
```

### GLB 503 spike isolation
```
get_datadog_metric(
  queries=["sum:glb.http.5xx{service:dotcom,backend:default} by {host}"],
  from=..., to=..., raw_data=true
)
```
