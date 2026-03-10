---
name: obsidian-article-capture
description: "Capture a web article from a URL into an Obsidian vault as an EMS Article entity note: fetch page, extract main body, create note via Obsidian CLI with article properties (`is`, `url`, `title`, `author`, `publisher`, `published`, `date`). Use when user says 'save this article', provides a URL to download, or wants the body saved as Markdown."
---

# Obsidian Article Capture (EMS)

Capture a web article into your Obsidian vault as an EMS `Article` entity note.

When referencing vault files in responses, use wikilinks per `[[utilities/Assistant Conventions]]`.

**Prerequisite:** Obsidian must be running (CLI commands require it). See the `obsidian-cli` skill for setup.

## Workflow

1. **Fetch**
   - Use `functions.webfetch` with `format: markdown`.

2. **Extract**
   - Keep: title, lede, body paragraphs, meaningful lists, blockquotes.
   - Drop: menus, share links, post navigation, "leave a reply", and comments.

3. **Pick a path**
   - Default: `atlas/notes/<Title> - <Author or Publisher>.md`.
   - Sanitize filename: remove `/\:*?"<>|`, collapse whitespace.
   - If a note already exists for the same URL, update it instead of creating a duplicate.

4. **Ensure EMS wiring exists**
   - `entity-schemas.json` includes an `Article` entry (required: `is`, `in`, `date`, `url`; `propertyValues.is` = `atlas/entities/article`).
   - `atlas/entities/article.md` exists (stub OK; matches other entity notes).

5. **Create the note via CLI**

   ```bash
   # Create the note with body content (no frontmatter — CLI handles properties)
   obsidian create path="atlas/notes/<Title> - <Author>.md" content="<body>"
   ```

6. **Set properties via CLI**

   ```bash
   obsidian property:set path="atlas/notes/<Title> - <Author>.md" name=is value="[[atlas/entities/article]]"
   obsidian property:set path="atlas/notes/<Title> - <Author>.md" name=in value="[[atlas/collections/Web Articles.base]]" type=list
   obsidian property:set path="atlas/notes/<Title> - <Author>.md" name=date value="<YYYY-MM-DD>" type=date
   obsidian property:set path="atlas/notes/<Title> - <Author>.md" name=url value="<url>"
   obsidian property:set path="atlas/notes/<Title> - <Author>.md" name=title value="<title>"
   obsidian property:set path="atlas/notes/<Title> - <Author>.md" name=author value="<author>"
   obsidian property:set path="atlas/notes/<Title> - <Author>.md" name=publisher value="<publisher>"
   obsidian property:set path="atlas/notes/<Title> - <Author>.md" name=published value="<date>" type=date
   obsidian property:set path="atlas/notes/<Title> - <Author>.md" name=status value="unread"
   obsidian property:set path="atlas/notes/<Title> - <Author>.md" name=saved_via value="webfetch"
   obsidian property:set path="atlas/notes/<Title> - <Author>.md" name=canonical_source value="<url>" type=list
   ```

   - Skip optional properties (`author`, `publisher`, `published`) if the data is not available.
   - `date` is always today's date (capture date). `published` is the article's original publication date.

7. **Format body**
   - Start with `# <Title>`.
   - Preserve blockquotes as `>` blocks.
   - Add `## Source` at the end with the URL.

## Property Schema

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `is` | link | yes | `[[atlas/entities/article]]` |
| `in` | list | yes | `[[atlas/collections/Web Articles.base]]` |
| `date` | date | yes | Capture date (today) |
| `url` | text | yes | Source URL |
| `title` | text | yes | Article title |
| `author` | text | no | Author name |
| `publisher` | text | no | Publisher/site name |
| `published` | date | no | Original publication date |
| `status` | text | no | Default: `unread` |
| `saved_via` | text | no | Default: `webfetch` |
| `canonical_source` | list | no | Canonical URL(s) |

## Guardrails

- Do not include comments unless asked.
- Do not overwrite existing properties; only add missing fields.
- If the note already exists (check with `obsidian read`), update properties with `property:set` rather than recreating.
