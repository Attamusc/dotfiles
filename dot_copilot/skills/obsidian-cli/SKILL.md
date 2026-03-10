---
name: obsidian-cli
description: "Obsidian CLI patterns for vault operations. Use when creating notes, setting properties, searching, querying Bases, managing links, or running eval commands against the vault. Triggers: 'obsidian cli', 'vault command', 'run obsidian command', 'create note', 'set property', 'search vault', 'query base'."
---

# Obsidian CLI Reference

The Obsidian CLI (requires Obsidian 1.12+) provides native vault operations that replace file-system-level reads, writes, and frontmatter manipulation. **Obsidian must be running** for all commands to work. There is no file-based fallback.

## Setup

The CLI binary is bundled with Obsidian at `/Applications/Obsidian.app/Contents/MacOS/Obsidian`. It must be in PATH. If not, add to `~/.zprofile`:

```bash
export PATH="/Applications/Obsidian.app/Contents/MacOS:$PATH"
```

All commands below assume execution from the vault root directory (the working directory of this project). If running from elsewhere, add `vault=<name>` to target a specific vault.

## Core Commands

### Note Creation

```bash
# Create a new note with content
obsidian create path="atlas/notes/My Note.md" content="Body text here"

# Create with multi-line content (use shell quoting)
obsidian create path="atlas/notes/My Note.md" content=$'# Title\n\nBody paragraph.\n\n## Section\n\nMore content.'
```

After creating, use `property:set` to add frontmatter properties. Do NOT manually assemble YAML frontmatter in the `content=` argument — let the CLI handle property serialization.

### Property Manipulation

```bash
# Set a text property
obsidian property:set path="atlas/notes/My Note.md" name=title value="My Title"

# Set a date property
obsidian property:set path="atlas/notes/My Note.md" name=date value="2025-01-15" type=date

# Set a datetime property
obsidian property:set path="atlas/notes/My Note.md" name=due value="2025-01-15T14:30:00" type=datetime

# Set a number property
obsidian property:set path="atlas/notes/My Note.md" name=rating value="4.5" type=number

# Set a checkbox property
obsidian property:set path="atlas/notes/My Note.md" name=completed value="true" type=checkbox

# Set a wikilink property (entity type, collection membership, etc.)
obsidian property:set path="atlas/notes/My Note.md" name=is value="[[atlas/entities/resource]]"

# Set a list property
obsidian property:set path="atlas/notes/My Note.md" name=subject value="Topic1" type=list
obsidian property:set path="atlas/notes/My Note.md" name=subject value="Topic2" type=list

# Set a list property with a wikilink value
obsidian property:set path="atlas/notes/My Note.md" name=in value="[[atlas/collections/Resources.base]]" type=list

# Read a property
obsidian property:read path="atlas/notes/My Note.md" name=is

# Remove a property
obsidian property:remove path="atlas/notes/My Note.md" name=status
```

**Key behaviors:**
- `type=list` appends to an existing list; it does not replace it.
- Wikilink values like `[[path/to/note]]` are stored as proper Obsidian links, not plain strings.
- Omitting `type=` defaults to text. Always specify `type=` for non-text properties.

### Content Operations

```bash
# Read a note's content
obsidian read path="atlas/notes/My Note.md"

# Append to a note (adds after existing content)
obsidian append path="atlas/notes/My Note.md" content="## New Section\n\nAppended content."

# Prepend to a note (adds after frontmatter, before body)
obsidian prepend path="atlas/notes/My Note.md" content="Prepended paragraph."
```

**Important:** `prepend` inserts content after the frontmatter block, not before it. This is frontmatter-aware.

### Wikilinks in Tables

When inserting wikilinks with aliases into markdown tables, always escape the pipe character with a literal backslash:

```
| Link | Description |
| [[calendar/notes/2026-03-02 @joelhawksley\|Sean : Joel monthly]] | 1:1 with Joel |
```

Using `\|` ensures the table renderer doesn't break the link.

### Search

```bash
# Full-text search (returns matching files)
obsidian search query="error handling" format=json

# Search with context (returns surrounding lines)
obsidian search:context query="error handling" format=json
```

Always use `format=json` when parsing results programmatically.

### Bases Querying

```bash
# Query a Base collection
obsidian base:query path="atlas/collections/People.base" format=json

# Query a specific view within a Base
obsidian base:query path="atlas/collections/Resources.base" view="By Subject" format=json
```

This is the preferred way to find entities matching Base filters — it evaluates the Base's own filter logic natively rather than replicating it with Glob+Read+parse.

### Link Graph

```bash
# Get backlinks to a note
obsidian backlinks path="atlas/notes/My Note.md" format=json

# Get outgoing links from a note
obsidian links path="atlas/notes/My Note.md" format=json

# Find unresolved (broken) links in the vault
obsidian unresolved format=json

# Find orphan notes (no incoming links)
obsidian orphans format=json
```

### Tags

```bash
# List all tags in the vault
obsidian tags format=json

# Find all notes with a specific tag
obsidian tag name="project" verbose format=json
```

### File Management (Link-Aware)

```bash
# Move a note (updates all links pointing to it)
obsidian move from="atlas/notes/Old Name.md" to="atlas/notes/New Location.md"

# Rename a note (updates all links)
obsidian rename path="atlas/notes/Old Name.md" to="New Name.md"

# Delete a note
obsidian delete path="atlas/notes/My Note.md"
```

Prefer these over file-system `mv`/`rm` — they update all wikilinks across the vault.

### Daily Notes

```bash
# Append to today's daily note
obsidian daily:append content="- Investigated incident #1234"

# Prepend to today's daily note
obsidian daily:prepend content="## Morning Tasks"

# Read today's daily note
obsidian daily:read

# Get the path to today's daily note
obsidian daily:path
```

### Tasks

```bash
# List all incomplete tasks in the vault
obsidian tasks format=json

# List tasks in a specific file
obsidian tasks path="atlas/notes/My Note.md" format=json

# Toggle a task's completion status
obsidian task path="atlas/notes/My Note.md" line=15
```

### Plugin API via `eval`

The `eval` command executes JavaScript in the running Obsidian instance, providing access to the full plugin API.

```bash
# Get all property info from the metadata cache
obsidian eval code="JSON.stringify(app.metadataCache.getAllPropertyInfos())"

# Find files by entity type via metadata
obsidian eval code="JSON.stringify(app.vault.getMarkdownFiles().filter(f => app.metadataCache.getFileCache(f)?.frontmatter?.is?.includes('person')).map(f => f.path))"

# Access entity-schema-manager plugin API
obsidian eval code="JSON.stringify(app.plugins.plugins['entity-schema-manager']?.api?.getEntityTypes())"
```

Use `eval` as an escape hatch for operations not covered by other CLI commands. Always `JSON.stringify` return values for machine-readable output.

## Patterns

### Template-as-Reference Pattern

Existing Templater templates in `utilities/templates/` use interactive prompts (`tp.system.prompt`, `tp.user.selectEntitiesForCollection`) that cannot be invoked from the CLI. Instead, skills should:

1. **Read the template** to discover the property schema (names, types, default values)
2. **Use `obsidian create`** to make the note with body content
3. **Use `obsidian property:set`** for each property the template defines

Example — creating a Resource entity note (from `utilities/templates/atlas/Resource.md`):

```bash
# Step 1: Create the note with body content
obsidian create path="atlas/notes/My Investigation.md" content=$'# My Investigation\n\n## Problem Statement\n\nWhat was investigated.\n\n## Findings\n\nKey discoveries.'

# Step 2: Set properties per the Resource template schema
obsidian property:set path="atlas/notes/My Investigation.md" name=is value="[[atlas/entities/resource]]"
obsidian property:set path="atlas/notes/My Investigation.md" name=in value="[[atlas/collections/Resources.base]]" type=list
obsidian property:set path="atlas/notes/My Investigation.md" name=date value="2025-02-26" type=date
obsidian property:set path="atlas/notes/My Investigation.md" name=subject value="Architecture" type=list
obsidian property:set path="atlas/notes/My Investigation.md" name=subject value="Investigation" type=list
```

### Entity Note Creation Pattern

All entity notes in this vault follow the same structure: create the file, then set `is`, `in`, `date`, and type-specific properties. The `is` property links to the entity definition in `atlas/entities/`, and `in` links to the relevant `.base` collection.

```bash
# Generic pattern
obsidian create path="atlas/notes/<Title>.md" content="<body>"
obsidian property:set path="atlas/notes/<Title>.md" name=is value="[[atlas/entities/<type>]]"
obsidian property:set path="atlas/notes/<Title>.md" name=in value="[[atlas/collections/<Collection>.base]]" type=list
obsidian property:set path="atlas/notes/<Title>.md" name=date value="<YYYY-MM-DD>" type=date
# ... additional type-specific properties
```

### Property Validation Pattern

Use `property:read` to verify properties were set correctly:

```bash
obsidian property:read path="atlas/notes/My Note.md" name=is
obsidian property:read path="atlas/notes/My Note.md" name=date
```

### Error Handling

All CLI commands fail if Obsidian is not running. Check for this condition:

```bash
# Quick health check — if this fails, Obsidian is not running
obsidian daily:path 2>/dev/null || echo "ERROR: Obsidian is not running. Start Obsidian and try again."
```

## Workflow Patterns

### Post-Action Daily Note Logging

After creating investigation notes, capturing articles, or completing other vault-write tasks, optionally append a summary to today's daily note for an activity trail:

```bash
# After an incident investigation
obsidian daily:append content="- Investigated [[atlas/notes/Availability Incident - <name> <date>]]: <one-line summary>"

# After capturing an article
obsidian daily:append content="- Saved [[atlas/notes/<Article Title> - <Author>]]: <brief description>"
```

### Vault Health Checks

Use link graph commands for periodic vault maintenance:

```bash
# Find all broken/unresolved links
obsidian unresolved format=json

# Find orphan notes (no incoming links — may need linking or cleanup)
obsidian orphans format=json

# Check what links to a specific note (before considering deletion)
obsidian backlinks path="atlas/notes/Some Note.md" format=json
```

### Task Review

Query tasks across the vault or within specific notes:

```bash
# All incomplete tasks in the vault
obsidian tasks format=json

# Tasks in today's daily note
obsidian daily:path  # get path first
obsidian tasks path="<daily-note-path>" format=json

# Toggle a task complete
obsidian task path="<note-path>" line=<line-number>
```

## Vault Structure Reference

| Path | Purpose |
|------|---------|
| `atlas/notes/` | All entity instance notes |
| `atlas/entities/` | Entity type definitions |
| `atlas/collections/` | `.base` collection files |
| `atlas/maps/` | Map views |
| `utilities/templates/` | Templater templates (property schema reference) |
| `utilities/Assistant Conventions.md` | Canonical vault conventions |
| `entity-schemas.json` | Entity type schemas for the entity-schema-manager plugin |

## When to Use CLI vs Other Tools

| Operation | Use CLI | Use File Tools |
|-----------|---------|----------------|
| Create a single note | `obsidian create` | - |
| Set/read/remove properties | `property:set/read/remove` | - |
| Bulk-create 100+ notes | - | Node.js scripts (performance) |
| Search vault content | `obsidian search` | - |
| Query a Base collection | `base:query` | - |
| Move/rename notes | `obsidian move/rename` | - |
| Read note content | `obsidian read` | Read tool (also fine) |
| Append/prepend content | `obsidian append/prepend` | - |
| Advanced plugin queries | `obsidian eval` | - |
| Find unresolved links | `obsidian unresolved` | - |
| Check backlinks | `obsidian backlinks` | - |

## References

- [Obsidian CLI Documentation](https://help.obsidian.md/cli)
- `[[utilities/Assistant Conventions]]` — canonical vault conventions
