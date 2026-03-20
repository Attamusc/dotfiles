---
name: obsidian-vault-conventions
description: "Obsidian vault conventions for this repo (EMS/Dataview/Templater). Use when creating or editing notes or when referencing vault files in responses: always format vault file references as Obsidian wikilinks (not inline code file paths), follow frontmatter patterns, and store/consult the canonical conventions note in the vault."
---

# Obsidian Vault Conventions

Canonical conventions note: `[[utilities/Assistant Conventions]]`.

## File References In Responses

1. Always use Obsidian wikilinks for vault files
   - Good: `[[atlas/notes/Welcome to the Room - Jeffrey Snover]]`
   - Good: `[[atlas/notes/Welcome to the Room - Jeffrey Snover|Welcome to the Room]]`
   - Avoid: inline code paths like `atlas/notes/Welcome to the Room - Jeffrey Snover.md`
2. Wikilink format rules
   - Use vault-relative paths, omit the `.md` suffix.
   - Prefer `[[path/to/note|Label]]` when the basename is long or ambiguous.
   - If you are not sure about the exact path, search first; do not guess.

## CLI-First Vault Operations

When Obsidian is running, prefer CLI commands over direct file manipulation. See the `obsidian-cli` skill for full command reference.

| Operation | Preferred | Avoid |
|-----------|-----------|-------|
| Create a note | `obsidian create path=...` | Write tool with manual YAML frontmatter |
| Set/read properties | `obsidian property:set/read` | Manually editing YAML frontmatter |
| Append/prepend content | `obsidian append/prepend` | Edit tool on frontmatter-containing files |
| Move or rename notes | `obsidian move/rename` | File system `mv` (breaks links) |
| Search vault content | `obsidian search` | Grep across vault files |
| Query a Base collection | `obsidian base:query` | Glob + Read + parse filters manually |
| Check backlinks | `obsidian backlinks` | Grep for wikilink patterns |
| Find broken links | `obsidian unresolved` | Manual link validation |

### Why CLI over file tools?

- **Property typing** — `property:set` stores dates as dates, numbers as numbers, links as links. Manual YAML assembly often produces strings instead.
- **Link awareness** — `move` and `rename` update all wikilinks across the vault. File system operations break links silently.
- **Frontmatter safety** — `append` and `prepend` are frontmatter-aware. Edit tool can corrupt frontmatter delimiters if not careful.
- **No hardcoded paths** — CLI uses vault-relative paths. No need for absolute path constants.

### When file tools are still appropriate

- **Bulk creation** (100+ files) — Node.js scripts with direct file writes are faster.
- **Reading note content** — The Read tool and `obsidian read` are both fine.
- **Non-vault files** — `.base` file editing, `entity-schemas.json`, scripts, etc. remain file-tool territory.

## Conventions Source Of Truth

- If this skill conflicts with `[[utilities/Assistant Conventions]]`, follow `[[utilities/Assistant Conventions]]`.
