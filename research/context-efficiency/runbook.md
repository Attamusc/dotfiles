# Context-efficiency paired pilot runbook

This directory defines the read-only pilot. The SDK launcher and offline parser live in `scripts/`; no production read guardrail is implemented.

## Protocol revision 2

Two revision-1 inventory attempts completed, but both used shell forms the evaluator cannot certify. Their outputs remain invalid attempts; they are not pooled with revision 2. Before rerunning, the same explicit inspection grammar was added to every shared task prompt. Corpus hashes, required facts, evidence anchors, model pins, and pair order are unchanged. The initial answers were not scored to select this change. Review is performed by named independent agents and is not represented as human ground truth.

Use `scripts/context-efficiency-run.mjs` with an explicit Pi 0.84.4 SDK root and the pinned subagent extension. Parent resources disable global extensions, skills, and context files; the scout retains its configured startup context. Record this asymmetry when generalizing results. The launcher emits `session_shutdown` before disposal so extension timers cannot keep completed runs alive. `--lifecycle-check` verifies shutdown without model calls.

## Operator-only boundary

The model must not read `manifest.json`, this runbook, task rubric data, prior run records, or results. For each task, extract only the text after `## Model prompt (use verbatim)` in its definition file, then append exactly one routing suffix from `manifest.json`. The extracted text already contains the explicit corpus allowlist and required output headings. Shared prompt bytes are identical within a pair; the routing suffix is the only variation.

Reviewer facts and anchors stay operator-only. Anchors are preregistered places a reviewer can confirm each fact; answers need not reproduce anchor strings. A final citation passes when the named reviewer finds that its allowlisted range semantically supports the mapped fact. Equivalent subranges, superranges, and overlapping ranges are acceptable when they contain the supporting code or event.

## Fixed strategy contracts

The parent is `openai-codex/gpt-6-astra` at `high` thinking in a fresh persisted session.

- **Direct:** parent tools are exactly `read` and `bash`; zero child sessions are permitted.
- **Scout-first:** parent tools are exactly `read`, `bash`, and `subagent`; exactly one child is required. It must use agent `scout`, `openai-codex/gpt-5.6-luna`, `low` thinking, and exactly `read` and `bash`. After that child completes, the parent may use only `read` and `bash`.

Scout startup, prompt, output, and child-session usage count toward scout-first latency and combined usage. If a pin cannot be satisfied, do not substitute; mark the run invalid.

Pair order alternates: implementation inventory direct-first; repeated patterns scout-first; large log direct-first; exact contract scout-first.

## Before each run

1. Run structural validation and confirm the operator-only pre-run review in `semantic-review.md` is current. Never expose that file to either model.
2. Confirm corpus and task hashes still equal the manifest.
3. Start a fresh persisted parent session; do not fork or reuse context.
4. Apply the exact strategy tool contract.
5. Build model input using only the task prompt extraction and one routing suffix. Record its SHA-256.
6. Record a sanitized quota-observation reference when available and note concurrent account activity without identifiers.

Do not edit files, run tests, inspect outside the prompt's allowlist, or make external network calls. Persist parent and child session JSONL.

## Run record contract

Write one JSON record with exactly the types and fields shown by `runRecordSchema.record`; do not encode explanatory descriptor strings as values. The forthcoming parser will validate:

- provider/model/thinking/tool pins, prompt hash, corpus hashes, child count, and pair position;
- UTC timestamps and nonnegative wall-clock `latencyMs`, from parent start through final answer;
- parent, child, and combined Pi-reported usage from session JSONL, with no child double-counting;
- `followUp` counts from parent tool calls after scout completion;
- quota references and `concurrency.status`; quota movement is account-wide context, not billing;
- correctness fact rows keyed to manifest fact IDs.

`observedConditions.child` always has agent/provider/model/thinking/tools keys. Scout-first records observed values; direct records null scalar values and an empty tools array. Direct also has an empty `scoutSessions` array and null/empty child-verification values.

### Exact-contract parent verification

For `exact-integration-contract` scout-first, every citation accepted in the final answer must be backed by an actual completed parent `read` after child completion and before the final answer. Record:

- session ordering in `childCompletedSequence`, each read's `completedSequence`, and `finalAnswerSequence`;
- each completed parent read's tool-call ID, normalized corpus path, and actual returned line interval;
- one `factRangeMappings` row per accepted fact/citation, linking that range to covering parent read tool-call IDs.

The parser must reject the run unless the linked read interval, or union of linked intervals, fully covers each final cited range and satisfies `childCompletedSequence < completedSequence < finalAnswerSequence`. A scout citation, parent bash excerpt, or read issued before child completion does not satisfy this contract.

## Correctness scoring

Structural validation does **not** establish semantic correctness. Before any run, the named reviewer must inspect every `requiredFacts[].reviewerAnchors` range and record in `semantic-review.md` that the frozen range supports the fact text. Stop and amend the preregistration before running if any anchor is wrong.

After a run, score each fact with binary `factScore` and `citationScore`, accepted citations, and a reviewer note. `correct` is true only when every fact receives both scores, no contradiction exists, and exact-contract verification passes when applicable. Do not change facts or anchors after observing outputs.

## Findings boundary

For every pair, report validity/correctness, parent/scout/combined input-output-cache-total telemetry, latency, follow-up counts, quota references, and concurrency classification. Show every pair and outlier. Never present API telemetry as subscription billing. Mixed evidence calls for repetition or voluntary routing guidance; a guardrail requires a separate plan.

## Validation

From repository root, validate the frozen preregistration first:

```bash
python3 research/context-efficiency/validate.py
```

Expected output explicitly labels this as structural validation and reminds the operator that semantic anchor review remains manual.

After all eight operator-authored run records exist, validate them without writing a report:

```bash
python3 scripts/context-efficiency-pilot.py validate \
  --records research/context-efficiency/results/*.json \
  --output-json /tmp/context-efficiency-validation.json
```

Generate machine JSON and the Markdown report only from actual records:

```bash
python3 scripts/context-efficiency-pilot.py report \
  --records research/context-efficiency/results/*.json \
  --output-json /tmp/context-efficiency-report.json \
  --output-markdown research/context-efficiency/report.md
```

Both commands accept `--manifest PATH`. They parse prompt text internally only to compare its SHA-256 and never include prompt, answer, scout task, or tool-result prose in output. Canonical Pi user content may be a string or an array of text blocks; array text is concatenated in block order with no inserted separator. Images and other block types invalidate this text-only pilot.

Read and citation paths are resolved from each persisted session header's `cwd` and must resolve to the exact frozen corpus files. This permits equivalent prescribed repository-relative and absolute paths while rejecting outside paths, traversal escapes, and symlink escapes; reports retain manifest-relative names. Read results are reconstructed against the installed Pi 0.84.4 read contract and compared with the frozen corpus, including truncation notices; caller-supplied range metadata is not evidence. Bash validation deliberately supports only unchained `rg`, `grep`, `wc`, and `sha256sum` commands that name explicit allowlisted corpus files. Supported options are limited to boolean line-number, file-match, case, fixed/extended-regexp, word-regexp, line-count, and ripgrep no-config forms (`-n`, `-l`, `-i`, `-F`, `-E` for grep, `-w`, `-l` for wc, and their allowlisted long equivalents); safe short flags may be clustered and `--` may terminate options. `sha256sum` accepts no options. Unknown or value-taking options, directories, globs, stdin/indirect-file inputs, shell operators, substitutions, redirections, newlines, other commands, or paths outside the corpus invalidate the run because their scope cannot be established without interpreting a shell program. This validates the recorded command grammar; it does not claim to sandbox shell startup configuration.

Invalid, incomplete, duplicate, or mismatched runs remain invalid rather than receiving zero usage. Recorded timestamps, latency, child/final boundaries, and follow-up counts must match session evidence. The report keeps Pi usage telemetry separate from account-wide quota references and does not convert either to billing.
