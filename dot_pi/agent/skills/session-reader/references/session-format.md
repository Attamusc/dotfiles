# Pi Session JSONL Format

Pi stores one JSON object per line. The default root is `~/.pi/agent/sessions/`, with working-directory folders and timestamp/session-ID filenames. Storage can be configured elsewhere.

## Entries and messages

The `session` header holds the session ID, version, timestamp, and working directory. `model_change` and `thinking_level_change` record configuration changes.

A `message` entry nests its payload under `entry.message`, not `entry.content`:

```json
{
  "type": "message",
  "id": "assistant-entry",
  "parentId": "user-entry",
  "timestamp": "2026-10-01T12:00:00.000Z",
  "message": {
    "role": "assistant",
    "content": [{"type": "text", "text": "Response"}],
    "model": "model-id",
    "provider": "provider-id",
    "usage": {"input": 100, "output": 20, "cost": {"total": 0.001}}
  }
}
```

Content can be a string or typed blocks: `text`, `toolCall` (name, ID, arguments), `thinking`, and images. Tool results are separate messages with role `toolResult`, `toolName`, `toolCallId`, content, and optional `isError`/`details`. Usage and model metadata belong to the nested assistant message.

## Branches and compaction

Modern sessions are trees linked by entry `id` and `parentId`. File order contains recorded history across branches. Compaction preserves original entries and adds a `compaction` summary; branch navigation can add `branch_summary`. Neither means earlier recorded messages were deleted.

General analysis of file-order messages is different from rebuilding the active model context. The analysis script does not apply compaction boundaries, follow a selected leaf, or apply `context_edit` replacements. Label abandoned-branch and pre-compaction evidence when interpreting it.

## Subagents

Subagent tool-result metadata lives at `entry.message.details`, separately from content. The supported result shape has `mode` and a `results` array. Each result can include agent, task, model, exit code, usage, progress summary, skills, `sessionFile`, and `artifactPaths`.

Use recorded `sessionFile` or `artifactPaths.jsonlPath` values to inspect a child session with the same reader. Temporary paths may no longer exist. Parent and child costs are separate in the output; do not sum duplicate copies of the same run across an audit sample.

## Reader scope

The restored reader handles session headers, model/thinking events, and message entries. Other entry types, including standalone usage records, compaction/branch-summary entries, labels, extension state, and context edits, are not included in its turn/cost views. Image/base64 bodies are not rendered. Inspect raw entries separately when the question depends on those records; do not claim the message-only cost view is complete session accounting.

Read completed files or snapshots: a malformed or partially written JSON line causes a parsing error rather than being skipped. Subagent reports and child cost rows cover the whole file even when other views are paged by user turns.

For the current schema, consult the installed Pi documentation at `docs/session-format.md` and `docs/message-types.md`. The reader is a history-inspection tool, not a version-pinned context-reconstruction implementation.
