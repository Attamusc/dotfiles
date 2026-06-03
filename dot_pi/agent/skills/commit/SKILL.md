---
name: commit
description: "Read this skill before making commits"
license: From mitsuhiko/agent-stuff
---

Create a commit for the current changes using Conventional Commits format with a **polished, highly descriptive** message.

## Format

`<type>(<scope>): <summary>`

- `type` REQUIRED. Use `feat` for new features, `fix` for bug fixes. Other common types: `docs`, `refactor`, `chore`, `test`, `perf`.
- `scope` OPTIONAL. Short noun in parentheses for the affected area (e.g., `api`, `parser`, `ui`).
- `summary` REQUIRED. Short, imperative, <= 72 chars, no trailing period.

## Notes

- Body is **strongly encouraged** — always include one unless the change is trivially obvious (e.g., fixing a typo). The body should explain **what** changed, **why** it changed, the approach taken, and any notable decisions. A reader of the log should understand the change without looking at the diff.
- Do NOT include breaking-change markers or footers.
- Do NOT add sign-offs (no `Signed-off-by`).
- Only commit; do NOT push.
- If it is unclear whether a file should be included, ask the user which files to commit.
- Treat any caller-provided arguments as additional commit guidance. Common patterns:
  - Freeform instructions should influence scope, summary, and body.
  - File paths or globs should limit which files to commit. If files are specified, only stage/commit those unless the user explicitly asks otherwise.
  - If arguments combine files and instructions, honor both.

## VCS Detection

Detect which VCS to use **before** doing anything else:

1. Check if `.jj/` exists in the repo root → use **jj** (even if `.git/` also exists — colocated repos have both)
2. Otherwise check if `.git/` exists → use **git**

**Prefer jj whenever available.**

## Steps (jj)

Use these steps when the repo has `.jj/`:

1. Infer from the prompt if the user provided specific file paths/globs and/or additional instructions.
2. Review `jj st` and `jj diff` to understand the current changes (limit to argument-specified files if provided).
3. (Optional) Run `jj log --no-graph -r 'ancestors(@, 50)' -T 'description.first_line() ++ "\n"'` to see commonly used scopes.
4. If there are ambiguous extra files, ask the user for clarification before committing.
5. Commit. **Choose the path based on the body:**

   - **Trivial single-line subject, no body** (e.g. `fix: typo`):
     - All changes: `jj commit -m "<subject>"`
     - Specific files: `jj commit -m "<subject>" <filesets>`

   - **Multi-paragraph body, OR any body containing backticks / `$(...)` / em-dashes / non-ASCII punctuation** — go via a tempfile to avoid shell injection (see the `jujutsu` skill's "Safe message passing" section for the full rationale):
     1. Use the agent's `write` tool to put the full commit message (subject line, blank line, body paragraphs) into `/tmp/jj-commit-msg.txt`. **Do not** use `cat <<EOF` — heredocs still expand backticks and `$()`.
     2. Apply it:
        - All changes:
          ```bash
          jj describe --stdin < /tmp/jj-commit-msg.txt
          jj new
          ```
        - Specific files only (`jj commit` does not support `--stdin`, so use a placeholder then rewrite):
          ```bash
          jj commit <filesets> -m "placeholder"
          jj describe @- --stdin < /tmp/jj-commit-msg.txt
          ```

   Avoid `jj commit -m "<subject>" -m "<body>"` for anything non-trivial — each `-m` is a separate shell-evaluated argument, and prose bodies have repeatedly triggered backtick execution and Unicode mangling.

> **jj mental model:** There is no staging area. The working copy (`@`) IS a commit.
> `jj commit` describes the current working copy and creates a new empty `@` on top.
> When file paths are given, only those files stay in the committed change — everything else moves to the new `@`.

## Steps (git)

Use these steps when the repo only has `.git/`:

1. Infer from the prompt if the user provided specific file paths/globs and/or additional instructions.
2. Review `git status` and `git diff` to understand the current changes (limit to argument-specified files if provided).
3. (Optional) Run `git log -n 50 --pretty=format:%s` to see commonly used scopes.
4. If there are ambiguous extra files, ask the user for clarification before committing.
5. Stage only the intended files (all changes if no files specified).
6. Run `git commit -m "<subject>"` (and `-m "<body>"` if needed).
