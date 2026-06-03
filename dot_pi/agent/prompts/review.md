---
description: Adversarial review of a change or research position. Proves the target wrong with cited evidence.
argument-hint: "[--scope <s>] [--steelman] [--emit-json] [<file|url|PR-URL|claim>]"
---

# Adversarial Review

Spawn an adversarial-reviewer agent to prove the target wrong. The reviewer does not validate, summarize, or improve — it finds what's wrong with cited evidence.

## Args

Raw args: `$@`

## Parse and Dispatch

Parse `$@` into:

- **target** — the thing to review (may be empty)
- **scope** — value after `--scope` flag, default: "entire artifact"
- **steelman** — present if `--steelman` flag appears
- **emit_json** — present if `--emit-json` flag appears

Infer mode from target:

| Target | Mode |
|--------|------|
| (empty) | change — default target is "working-tree diff vs main" |
| `.md` or `.txt` file path | research |
| `.diff` or `.patch` file | change |
| GitHub PR URL (`github.com/*/*/pull/*`) | change |
| Other URL | research |
| Quoted string with no path-like structure | research |

Build the task string for the agent:

```
Mode: <change|research>
Target: <resolved target or "working-tree diff vs main">
Scope: <scope or "entire artifact">
Flags: <steelman=true|false> <emit_json=true|false>
```

## Spawn

Call:

```typescript
subagent({
  name: "AR: $@",
  agent: "adversarial-reviewer",
  interactive: false,
  task: `Mode: <inferred>
Target: <resolved target>
Scope: <scope>
Flags: steelman=<true|false> emit_json=<true|false>`,
});
```

Replace placeholders with parsed values before executing. When `$@` is empty, use `"working-tree diff vs main"` as the target and `change` as the mode.

The agent writes its artifact to `~/.pi/agent/reviews/` and prints the path when done. Report the artifact path to the user when the subagent exits.
