# Resource Entity Schema

Vault: `~/OneDrive/Obsidian/github-notes/`
Path: `atlas/notes/<Title>.md`

## Frontmatter Template

```yaml
---
is: "[[atlas/entities/resource|resource]]"
in:
  -
date: "YYYY-MM-DD"
subject:
  - "Topic1"
  - "Topic2"
---
```

## Field Reference

| Field                 | Type     | Required | Notes                                                      |
| --------------------- | -------- | -------- | ---------------------------------------------------------- |
| `is`                  | wikilink | yes      | Always `"[[atlas/entities/resource\|resource]]"`           |
| `in`                  | array    | yes      | Collections this note belongs to. Use `-` (empty) if none. |
| `date`                | string   | yes      | ISO date of creation (YYYY-MM-DD)                          |
| `subject`             | array    | no       | Topic tags for the note. 2-5 short descriptive terms.      |
| `period`              | string   | no       | Time period reference if applicable                        |
| `sharable_doc_source` | array    | no       | Links to sharable versions (e.g. Google Docs)              |
| `canonical_source`    | array    | no       | Links to canonical source (e.g. GitHub issue)              |

## Conventions

- `in:` is typically left as a bare `-` (empty list item) unless the note belongs to a specific collection.
- `subject:` values are short capitalized terms (e.g. "Rate Limiting", "API", "Reliability").
- Filename should be a human-readable title. Sanitize: remove `/\:*?"<>|`, collapse whitespace.
- Start body with `# Title` matching the filename.

## Example Notes From Vault

### Short resource

```yaml
---
is: "[[atlas/entities/resource|resource]]"
in:
  -
date: 2024-01-29
subject:
  - "Observability"
---
## How big a lift is adding attribution to the monolith
```

### Investigation resource

```yaml
---
is: "[[atlas/entities/resource|resource]]"
in:
  -
date: 2024-07-29
subject:
  - "Monolith Fitness"
  - "Reliability"
  - "Incident"
---
# Summary
# tl;dr
# Day 1
```
