---
name: blast-radius
description: "Map the impact scope of a proposed or implemented change: affected paths, direct consumers, integration contracts, migrations, rollback scope, and verification implications. Use for 'blast radius of X' or 'what could this affect'."
---

# Blast Radius

Map the evidence-backed impact scope of a change for planning or verification. This skill is the sole owner of blast-radius analysis. It does not review general code quality, execute checks, control processes, or decide a verification verdict.

## Method

1. **Define the change.** Read the supplied diff, plan, or named paths. Record every changed, generated, configuration, fixture, and documentation path in scope. If the target is ambiguous, state the assumed boundary.
2. **Find direct consumers narrowly.** For each changed public symbol, module, command, configuration key, or artifact, first locate matching files with scoped `rg -l` searches. Read only those files, then identify direct imports, calls, readers, writers, registrations, or generated outputs. Do not expand this into a general dependency graph or code-quality review.
3. **Inventory contracts before implementations.** Use the plan's Integration Contracts table when present. Otherwise identify contract surfaces touched by the change: API schemas and routes, database schemas, event or wire formats, configuration schemas, generated artifacts, and cross-language data. Read each source of truth before reading its consumer, then compare names, types, required fields, validation, serialization, and boundary behavior literally.
4. **Identify migrations.** State any data, database, configuration, schema, cache, deployment-order, or regeneration migration. Write `none` only when repository evidence supports that conclusion; otherwise label it unknown.
5. **Bound rollback.** Name the paths, generated artifacts, migrations, data repairs, configuration changes, or coordinated deployments that must be reversed together. Distinguish a code revert from an irreversible or forward-only data migration.
6. **Derive verification implications.** Name existing stable check IDs when available. Otherwise describe the narrow checks needed at each affected boundary. This is input to verification, not execution or a pass/fail decision.
7. **Label unknowns.** Static search cannot prove that dynamic registration, reflection, external services, deployed clients, runtime configuration, or out-of-repository consumers do not exist. List every unresolved category explicitly and never claim exhaustive consumer discovery.

Cite repository paths and the relationship found. Treat a search with no matches as bounded evidence, not proof that no runtime consumer exists.

## Output

Use this shape and keep every field:

```markdown
## Blast Radius
- Changed paths: `src/foo.ts`
- Direct consumers: `src/bar.ts` — imports `foo`
- Contracts: `schema/event.json` — payload shape may change
- Migrations: none
- Rollback scope: revert `src/foo.ts` and regenerated fixture
- Verification implications: run CHECK-API-1 and CHECK-EVENT-2
- Unknowns: runtime consumers not discoverable statically
```

Use `none found in <bounded scope>` when a scoped search found no item. Use `unknown — <reason>` when evidence is unavailable or static analysis cannot establish the answer.
