# Pi 0.84.4 Session Contract

Pi sessions are JSONL trees. The installed `@earendil-works/pi-coding-agent` 0.84.4 executable—not forward-looking documentation—is authoritative for supported reconstruction.

## Tree

A v3 file has one `session` header. Every other structural entry has a unique `id` and `parentId` (null at the root). Reconstruction requires an explicit leaf and follows only its parents to the root. Unknown leaves, duplicate IDs, orphaned parents, self-parents, and cycles fail closed before invoking behavior that could fall back to the final file entry.

Blank lines are ignored. Malformed JSON is skipped; diagnostics contain bounded line numbers only.

## Context-bearing entries

- `message`: user, assistant, and tool-result messages; content is under `message.content`.
- `bash_execution`: shell execution context unless excluded by its runtime shape.
- `custom_message`: a context message.
- `branch_summary`: a derived summary of an abandoned branch. Its underlying sibling entries are not selected.
- `compaction`: a derived compaction summary.

Plain `custom`, `label`, `session_info`, model/thinking changes, and unknown entries do not produce rendered context items. Model/thinking changes can remain on the structural path. Thinking blocks, image/base64 blocks, raw environment dumps, and nested subagent transcript details are never rendered.

## Compaction

The latest compaction on the selected path is emitted first. For the 0.84.4 `firstKeptEntryId` contract, it is followed by path entries from that pre-compaction boundary through the entry before the compaction, then all entries after it. If the boundary is missing, 0.84.4 emits the compaction and post-compaction entries; the reader matches that result and adds `missing-first-kept-boundary`.

Although installed documentation describes `retainedTail`, Pi 0.84.4 exports and types do not implement it. A selected path whose latest compaction contains `retainedTail` returns exactly `unsupported-session-contract`, with no excerpts.

## Disclosure and provenance

Rendered items carry `session:<header-id>#entry:<entry-id>` and one source kind:

- `message (original)`
- `custom-message (original)`
- `branch-summary (derived)`
- `compaction-summary (derived)`

Recognizable private keys, authorization credentials, token prefixes, URL credentials, and secret-like environment assignments are replaced with `[REDACTED:<kind>]`. Absolute session paths are never emitted; selection uses a sessions-root-relative path. Complete output is at most 16 KiB UTF-8 and records omitted item counts.
