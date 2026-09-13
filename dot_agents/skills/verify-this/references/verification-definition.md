# Verification Definition Contract

A project verification definition is a Markdown Agent Skill at `.agents/skills/verify-<scope>/SKILL.md`. Pi discovers directories containing `SKILL.md` recursively in trusted projects. The definition supplies project-specific values; this contract owns their meaning.

## Required document shape

The file MUST contain, in order:

1. Agent Skills YAML frontmatter.
2. `# Verification: <scope>`.
3. `## Scope` with a non-empty description of the target and boundary.
4. `## Prerequisites` with any setup assumptions, or `None`.
5. `## Checks` with one or more checks.
6. `## Report` instructing the runner to use the shared verification report contract.

Frontmatter MUST contain exactly one `name` and one `description`, with no other keys. The accepted YAML subset is deliberately strict: each key is unindented; values are plain, single-quoted, double-quoted, or a `>`/`|` block indented by at least two spaces. Double-quoted values support YAML escapes `\\0`, `\\a`, `\\b`, `\\t`, `\\n`, `\\v`, `\\f`, `\\r`, `\\e`, `\\ `, `\\"`, `\\/`, `\\\\`, `\\N`, `\\_`, `\\L`, `\\P`, `\\xNN`, `\\uNNNN`, and `\\UNNNNNNNN`; malformed escapes and invalid Unicode scalar values are rejected. This is a scalar subset, not a full YAML parser. Collections, tags, anchors, aliases, directives, YAML reserved indicators (including plain values beginning `@`), multiline keys, duplicate keys, unknown keys, and malformed quoting are invalid. Folded (`>`) lines resolve with spaces; literal (`|`) lines resolve with newlines. Plain descriptions use a deliberately narrower, discoverable subset: human prose beginning with an ASCII letter, followed by prose punctuation as needed (including apostrophes). Scalar-like numeric, null, and boolean values are invalid. Quoted and block descriptions remain available for strings outside that plain-description grammar. Validation applies the 1,024-character description limit to the resolved value.

`name` MUST use lowercase letters, digits, and single hyphens, with no leading or trailing hyphen. The skill directory SHOULD use the same name. Definitions MUST NOT embed credentials, sensitive session content, machine-specific absolute paths, home-relative paths, or parent traversal. A POSIX path beginning with `/` (including `/` itself) or a Windows slash- or backslash-based drive-rooted path is machine-absolute regardless of its first directory (including `/workspace`). Paths beginning with `~/`, `~\`, `../`, or `..\`, and paths containing a parent `..` component, are forbidden. URLs are not filesystem paths.

## Check schema

Each check starts with `### CHECK-<positive integer>: <purpose>`. Identifiers MUST be unique and stable within the definition. Checks execute in document order unless the definition explicitly describes a dependency.

Every check MUST declare each field below exactly once, in this order:

```markdown
### CHECK-1: Focused tests
- Target: contract parser and fixtures
- Safety: read-only
- Requires: node
- Command: `node --test test/example.test.mjs`
- Timeout: 60s
- Pass signal: exit status 0
- Failure means: implementation or fixture violates the contract
- Evidence: exit status and bounded output
- Cleanup: none
```

| Field | Required value |
|---|---|
| `Target` | Non-empty component, behavior, interface, or environment being checked. |
| `Safety` | Exactly `read-only` or `mutating`. |
| `Requires` | Comma-separated host capabilities, or the exclusive value `none`. Capability names describe executables or existing adapters such as `node`, `git`, `browser`, or `interactive-subagent`; they do not imply a fallback. |
| `Command` | One exact inline-code command, or `none` when `Procedure` is used. Commands MUST use project-relative paths. |
| `Procedure` | Required only when `Command: none`; one line in the exact shape `target \`<target>\`; action <action>; maximum <positive integer> <steps|attempts|seconds|minutes>; observe <signal>`. Otherwise it MUST be omitted. |
| `Timeout` | Positive integer followed by `s` or `m`, or `none` only when `Stopping condition` is present. |
| `Stopping condition` | Required only when `Timeout: none`; one line in the exact shape `stop after <positive integer> <steps|attempts|seconds|minutes> or when <signal> is observed`. Otherwise it MUST be omitted. |
| `Pass signal` | Objective observable condition that establishes success. It MUST name a concrete expected value or bounded condition using one of: exit status, command exit, process status, status, returned value, count, file state, process state, contains, equals, matches, present, absent, visible, shown, reported, observed, or appears. A generic noun such as `file`, `status`, or `process` alone is invalid. |
| `Failure means` | Non-empty interpretation of a failed pass signal. |
| `Evidence` | Evidence to retain using this closed grammar: `bounded <noun>`, or `<signal> and bounded <noun>`. `<noun>` is exactly `output`, `evidence excerpt`, `native runtime artifact`, or `native runtime record`. The optional `<signal>` is exactly `exit status`, `command exit`, `process status`, `returned value`, `result count`, `file state`, or `process state`. Nothing may follow the noun. For example, `exit status and bounded output` and `bounded evidence excerpt` are valid; bare `command output` and `bounded output is avoided` are invalid. It MUST NOT request secrets, complete transcripts, or unbounded output. |
| `Cleanup` | Exact cleanup action and proof, or `none` when the check creates no owned state or process. |

A required capability that is unavailable makes the check `unsupported`; it does not permit substitution with an undeclared runtime or adapter.

## Mutation metadata

A `mutating` check MUST add these fields immediately after `Safety`, in this order:

```markdown
- Target environment: disposable local fixture
- Mutation: creates `tmp/verification-output.txt`
- Approval: explicit user approval required before execution
```

`Target environment` and `Mutation` MUST identify the exact destination and expected state change. `Approval` MUST be exactly `explicit user approval required before execution`. The runner MUST show the command or procedure, target environment, mutation, timeout or stopping condition, and cleanup plan before requesting approval. A read-only check MUST NOT declare mutation metadata.

Every non-`none` cleanup, whether read-only or mutating, MUST begin with the exact action `remove`, `delete`, `restore`, `stop`, `terminate`, or `revert` followed by a concrete inline-code target, then require `prove`, `confirm`, or `verify` with that same target or its resulting state absent, gone, restored, stopped, or terminated, explicitly followed by `after cleanup`, `after removal`, or `after the action`. A proof naming a different inline-code target is invalid. `Cleanup: none` is invalid for a mutating check.

## Validation semantics

A definition is valid only when its frontmatter, required sections, check headings, field order, conditional fields, enumerated values, and non-empty values satisfy this contract. Unknown check fields are invalid so typos cannot silently weaken safety metadata. Markdown links and prose may supplement the required sections but cannot replace required fields.

Definition validity says that checks are well formed, not that their commands are safe or current. A runner MUST stop before executing checks when the definition is invalid. Staleness and command safety are separate verification concerns.
