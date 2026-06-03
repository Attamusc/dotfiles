---
name: jujutsu
description: Guide to Jujutsu (jj) version control system. Use when working with commits, branches, pull requests, PRs, version control, rebasing, pushing, or when the user mentions jj, git, or version control operations.
---

# Jujutsu (jj) Version Control Guide

Jujutsu is a modern, Git-compatible version control system. This project uses jj colocated with git.

## Key Differences from Git

| Concept | Git | Jujutsu |
|---------|-----|---------|
| Staging area | Explicit `git add` | None - working copy IS a commit |
| Branches | Named refs | Bookmarks (auto-follow rewrites) |
| Stash | Separate stash stack | Not needed - just use commits |
| Amend | `git commit --amend` | Just edit files, or use `jj squash` |
| Identity | Commit ID only | Change ID (stable) + Commit ID |

## Essential Commands

| Task | Command |
|------|---------|
| Status | `jj status` or `jj st` |
| Diff | `jj diff` |
| Log | `jj log` |
| Commit & continue | `jj commit -m "message"` |
| Update message | `jj describe -m "message"` |
| New empty commit | `jj new` |
| Squash into parent | `jj squash -m "message"` |
| Undo last operation | `jj undo` |
| Fetch from remote | `jj git fetch` |
| Push to remote | `jj git push` |
| Create & push bookmark | `jj git push --named name=@` |
| Push existing bookmark | `jj git push --bookmark name` |

## Working Copy Model

The working copy (`@`) is always a commit. File changes are automatically tracked - no staging required.

```
parent commit
    ↓
@ (working copy) ← your edits go here automatically
```

## Quick Git-to-Jujutsu Translation

| Git | Jujutsu |
|-----|---------|
| `git status` | `jj st` |
| `git diff` | `jj diff` |
| `git log` | `jj log` |
| `git add . && git commit -m "msg"` | `jj commit -m "msg"` |
| `git commit --amend` | `jj squash -m "message"` |
| `git push` | `jj git push` |
| `git pull` | `jj git fetch` then `jj rebase -d main@origin` |
| `git checkout -b branch` | `jj new main` then `jj bookmark set branch` |
| `git branch` | `jj bookmark list` |
| `git stash` | `jj new` (just start new commit) |
| `git blame` | `jj file annotate` |

## ⚠️ Safe message passing

**Bash evaluates backticks and `$(...)` inside `-m "..."` strings BEFORE jj ever sees them — even when backslash-escaped.** Non-ASCII characters (em-dashes, smart quotes) can also get mangled by shell unescaping, especially across multiple `-m` flags.

Real failure mode: a commit body containing inline code like `` `cd foo && jj git init --colocate` `` will *execute* the inner command (creating a nested repo, breaking the surrounding snapshot), then ship a commit description with the backticks stripped out.

**Threshold:**

- **Short single-line subjects** (`jj commit -m "fix: typo in README"`) — fine.
- **Anything multi-line, anything containing backticks or `$(...)`, anything with em-dashes or non-ASCII punctuation** — go via a tempfile.

**Safe pattern:**

```bash
# Step 1: write the message using the agent's `write` tool to e.g. /tmp/jj-msg.txt.
# Do NOT use `cat <<EOF` — heredocs still expand backticks and $() unless the
# delimiter is quoted ('EOF'), and it's easy to forget.

# Step 2: apply it. Only `jj describe` supports --stdin; `jj commit` does not.
jj describe --stdin < /tmp/jj-msg.txt
jj new   # if you wanted `jj commit` semantics (advance @ to a new empty change)
```

For partial-file commits (where you'd normally write `jj commit <filesets> -m ...`):

```bash
jj commit <filesets> -m "placeholder"           # creates the split, with a throwaway message
jj describe @- --stdin < /tmp/jj-msg.txt        # rewrite the real description from the file
```

## Additional References

- [commands-reference.md](commands-reference.md) - Complete command reference
- [workflows.md](workflows.md) - Common development workflows
- [revsets.md](revsets.md) - Revision selection syntax
