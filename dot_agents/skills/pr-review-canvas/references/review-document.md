# Review document schema version 1

The JSON object requires:

- `schemaVersion: 1`
- `pr`: explicit GitHub pull URL, number, title, author, state, base/head, additions/deletions, changed-file count
- `scope`, `summary[]`, and `sourceNotes[]`
- `fileCoverage`: total, represented, omitted, and complete; bound to PR changed-file count and unique grouped paths
- `changeGroups[]` in exact order `core`, `wiring`, `mechanical`; each file has path/status/non-negative integer counts/why/annotation/risk, a string or null patch, and optional bounded pseudocode
- `checks: {summary, items[]}`
- `feedback`: arrays for `high`, `medium`, `low`, `bot`, and `resolved`. Every item has a typed `source`: `conversation`, `review` (with `reviewState`), or `thread` (with parent `threadId`, path, explicit current line or null, optional original line, structured location status (`current`, `outdated`, or `unavailable`), required original-line key, an unavailable-location note when needed, and `isResolved`). Use `normalizeFeedbackSources()` to deduplicate globally before the 200-item cap and retain structured omission counts. These fields are retained in both projections.
- `iteration`: reason, maximum passes, and optional history rows containing pass, authoritative `legacyStatus`, derived `structuredStatus`, derived agreement, a lossless non-empty `diagnostics[]`, and outcome. Use `normalizeIterationReport()` for real iterate-pr workflow reports; it rejects contradictory precomputed fields.
- `blockers[]`, `nextAction`, and `limitations[]`
- `provenance`: upstream name, pinned commit, MIT license, and adaptation note

All prose fields are bounded to 8,000 characters, patches to 20,000 characters, files/checks to 100, feedback to 200, passes to six, and each complete Markdown or HTML projection to 256,000 bytes. Null or empty patches render as `Patch unavailable`.

The Markdown projection always contains PR and scope, summary, three grouped-change sections, checks, categorized feedback, iteration history and diagnostics, blockers and next action, limitations, evidence and source notes, and provenance. HTML contains the same evidence and verdict-relevant fields. Presentation status is not part of the review verdict.
