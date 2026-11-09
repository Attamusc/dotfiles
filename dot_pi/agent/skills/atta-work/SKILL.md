---
name: atta-work
description: Route ordinary Atta investigations, recurring operational artifacts, playable POCs, features and bug fixes through bounded Pi/Copilot work; use for natural requests to investigate, make a report, try an idea, implement or explicitly push a PR.
---

# Atta work

## Choose the native lane

Recognize ordinary dictated/task text; do not demand slash commands, tokens or a phase approval loop for direct/visible work. Default ambiguous task text to investigation. Ask only when an unresolved choice changes the problem or introduces consequential effects.

Use direct Pi work or the existing `subagent` tool for visible collaboration. Herdr owns visible panes; pi-interactive-subagents owns child run/session delivery. Tool return is an acknowledgement, NOT completion. Await the native delivered result/help before consuming it; require separate native exit evidence where closure matters. Do not manufacture an awaitable bridge, timer, reporter or lifecycle controller. Missing capabilities mean stop/report unsupported, not fallback.

Use saved workflows only when deliberately selecting the coded engine. After parent activation, executable entries are:
- `/atta-investigate task text`: single read-tool-only repository investigation, automatic eligibility ONLY after runtime exact-version trust. No live telemetry commands.
- `/atta-task {"intent":"implement","task":"Fix the selected behavior","design":"established","acceptance":["focused project check"]}`: explicit engine; also accepts investigate, recurring and poc. Raw text means investigate. Recurring requires `reference` plus the specialist skill named in task.
- `/atta-push 123`: separate explicit existing-PR CI/readiness composition, with upstream APPROVE boundary. PENDING is partial; no merge/auto-merge. This is not initial PR creation.

An idle `$atta-task` or `$atta-push` request grants that saved entry once. Ordinary visible/direct work does not need a token. Never silently trust a script or project. Saved scripts are trusted Node code, not a sandbox. Review imported recipe bytes as well as entrypoint bytes before approval: native exact-version trust hashes the entrypoint, not its dependency graph. The push wrapper composes the authored iterate-pr workflow linked into this profile; no recursive workflow_run or child workflow commands.

## Assign roles and finish criteria

Use `github-copilot/gpt-6.1-sol`, high, for caller/maker/evidence working passes; `github-copilot/claude-opus-5.5`, high, for judge/prose; `github-copilot/gpt-6-luna`, high, for alternative facts. Parent provides evidence, maker, judge, checker, prose-checker definitions. Override models explicitly; never reroute provider to rescue availability.

Keep decomposition in the native caller. Each child gets one role, owned cwd, finish condition, bounded scope, tools and evidence request; no nested delegation. A concrete visible example:

```typescript
subagent({ name: "Evidence", agent: "evidence", interactive: false,
  model: "github-copilot/gpt-6.1-sol", tools: "read,bash,codemode",
  cwd: assignedWorkspace,
  task: "Investigate the stated symptom in one evidence pass. Read the relevant domain skill before commands. No mutation, delegation or repair. Return hypotheses with cited evidence, next checks/actions, exact argv/status/output and missing access. Stop after this bounded handoff; do not claim completion from unsupported checks." })
```

Thinking is set by the provided role definition; the visible subagent tool does not expose a thinking override. Read the installed native tool schema before supplying overrides; do not turn an unsupported option into a claimed restriction. Bash/MCP/codemode availability is not OS read-only enforcement. Direct live investigations require already approved domain access, unlike the automatic read-only file recipe.

- **Investigate:** one evidence role. Finish with hypotheses/evidence/next checks/actions; no forced repair/review or giant risk report.
- **Recurring:** maker reads the accepted reference and named specialist skill, produces the artifact; one checker checks evidence gaps/conformity only. Do not reopen format/renderer design. Missing reference/skill means blocked.
- **POC:** for an open UX/integration decision, two independent Opus/Luna alternatives, then judge selects one; established design skips alternatives. Maker produces the minimum playable `.artifacts/<native runId>/poc` experiment. Checker drives the central interaction once. Deliver exact launch, proof, limitations and a small iteration plan, not a production suite.
- **Implement:** open decisions use the same two alternatives/judge; routine established-pattern work skips them. One maker owns changes in assigned cwd. Checker runs declared/project-appropriate acceptance; independent judge checks correctness and prose-checker retains upstream prose review initially. Admit at most two targeted fix/recheck passes for concrete counterevidence only. Missing access, execution/protocol failure, repeated shared-premise failure or unresolved cap means explicit partial, preserving work. No validation marathon.

For investigate and recurring work, collect evidence to close the decision, not to fill a packet:
- When continuing, start from the existing report and missing acceptance. Reuse valid saved evidence; prioritize unresolved decision-changing required gaps and state the next distinguishing query for each.
- Headline compatible populations. Unrelated populations are diagnostic, not causal share; distinguish already-scored failures from unscored or missed customer impact.
- Record cited direct answers, remaining required reads and uncertainty in the existing report/gap list (maker only) or returned evidence handoff; do not create a new tracker or require a report for ordinary investigation. Required reads come from the task, acceptance or applicable domain contract; suggested human next checks do not make an investigation incomplete. No exhaustive packet unless required. Unresolved required reads cannot be complete.
- The recurring checker flags direct answers and remaining required reads against acceptance; only concrete changed claims warrant recheck. This adds no forced review to ordinary investigation or automatic recurring repair/recheck loop.

The saved recipe uses native per-child `timeoutMs`, workflow run ceiling and usage budget gates. Budget is checked between completed phases, not a hard dollar sandbox. Visible children do not inherit these saved-engine timers; do not claim a visible hard execution ceiling. Checkpoints are write-only, not restart resume.

## Preserve the useful handoff

Maintain owner, finish condition, direction, current revision, proof and blockers in the native report/checkpoint trail; do not add another controller/tracker. One writer retains dirty/partial work in assigned cwd. No isolation cleanup, automatic integration, reset, push or merge in task work.

Before a success handoff, inspect execution AND business outcome. In the saved engine require `ok` plus validated task_outcome status/code pairs; missing/malformed/blocked/incomplete remains partial. Keep phase proof from the current revision, exact artifact paths, command argv/status/output and omissions. Fixture control-flow tests are not real model/runtime evidence.

Read existing domain skills before commands: availability-review-comment/queue, kusto-analysis, incident-ops-review-content, dd-docs/dd-pup/dd-audit/dd-apm, github, write-like-me/avoid-ai-writing and frontend-design as relevant. Keep Datadog read-only; Slack public channels only. Use the project's npmrc, existing lockfile and installed dependencies; do not recreate dependencies or install to hide a missing capability. Respect live credential/service and publishing approval boundaries.
