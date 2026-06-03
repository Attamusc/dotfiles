# Plan: Dynamic GitHub Copilot Model Discovery Extension

**Date:** 2026-05-26
**Status:** Draft
**Directory:** `/Users/attamusc/.local/share/chezmoi/dot_pi/agent/extensions/github-copilot-dynamic/`
**Materialized to:** `~/.pi/agent/extensions/github-copilot-dynamic/`

## Intent

A private pi extension that fetches the live list of Copilot models from `/models` at pi startup and overwrites the static `github-copilot` provider's model list. Models gated by subscription/feature flags (not in pi-ai's `models.generated.js`) become visible to `pi --list-models` and usable with `pi --model <id>`.

Reference: <https://github.com/earendil-works/pi/issues/4599>

## User Story

As a Copilot subscriber whose entitlement includes models pi doesn't ship statically (e.g. preview models, feature-flagged models), I want `pi --list-models` to show every model GitHub actually serves me, so that I can pick any of them without hand-editing pi-ai internals.

## Behavior

### Happy Path

1. Pi starts.
2. Extension factory runs (async); pi awaits it before continuing startup.
3. Extension reads `~/.pi/agent/auth.json`, finds the `github-copilot` entry.
4. If `expires > Date.now()`, use `.access` directly. Else call `refreshGitHubCopilotToken(.refresh)` to mint a fresh JWT (in-memory only — don't write back to auth.json).
5. Derive baseUrl from the JWT via `getGitHubCopilotBaseUrl(jwt)`.
6. `GET {baseUrl}/models` with `Authorization: Bearer {jwt}` + the 4 standard Copilot headers.
7. Parse `response.data[]`. For each entry, filter: skip if `policy.state === "disabled"` OR `model_picker_enabled === false`.
8. Map each surviving entry to pi's `Model` shape, copying the 4 standard headers and matching `compat`/shape conventions of the static Copilot models.
9. Call `pi.registerProvider("github-copilot", { models: [<all fetched models>] })` — fully replaces the static list (Q6 answer: option a).
10. Pi finishes startup; `pi --list-models` now shows the dynamic set.

### Edge Cases & Error Handling

- **No auth.json or no github-copilot entry**: log one-line warning to stderr (`[github-copilot-dynamic] no copilot credentials, skipping dynamic discovery`), do NOT call `registerProvider`. Static models remain.
- **JWT exchange fails (network, 401, etc.)**: log one-line warning with status code, do NOT call `registerProvider`. Static models remain.
- **`/models` fetch fails (network, 401, 5xx)**: log one-line warning, do NOT call `registerProvider`. Static models remain.
- **`/models` response malformed (not JSON, missing `.data`)**: log one-line warning, do NOT call `registerProvider`.
- **`/models` returns empty list after filtering**: log warning, do NOT call `registerProvider` with empty array (would wipe static models). Static models remain.
- **Token refreshed in-memory only**: we never write auth.json. Pi's own token-refresh logic handles persistence on its next request.

## Scope

### In Scope

- Single async extension at `~/.pi/agent/extensions/github-copilot-dynamic/index.ts`.
- Read auth from `~/.pi/agent/auth.json` directly.
- JWT exchange via pi-ai's exported `refreshGitHubCopilotToken`.
- baseUrl derivation via pi-ai's exported `getGitHubCopilotBaseUrl`.
- Replace `github-copilot` provider's model list with the fetched set.
- opencode-style filter (`policy.state !== "disabled" && model_picker_enabled !== false`).
- Graceful degradation: any error path falls back silently (warning to stderr) to static models.

### Out of Scope

- Generalizing for other providers (Q5: github-copilot only).
- Persistent caching of the model list across pi runs.
- Persisting refreshed JWT back to auth.json (pi handles its own refresh).
- A CLI subcommand or `/copilot-models` slash command for ad-hoc refresh.
- Pricing data (Copilot static models all use `cost: { input:0, output:0, … }`; we do the same).
- GitHub Enterprise support beyond what pi-ai's helpers already give us (it should work transparently — both helpers handle the enterprise domain).

## Effort & Quality

- **Level:** MVP (single user, private, no distribution).
- **Tests:** smoke — one manual run of `pi --list-models` showing dynamic models. No automated tests; extension is small and side-effect-only.
- **Docs:** inline — a short header comment in the extension file explaining what it does and the failure modes.

## Constraints

- Must not break `pi --list-models` under any failure mode. Always fall back to static list.
- Must use `@earendil-works/*` package names (current pi version 0.75.5).
- Must not write to `~/.pi/agent/auth.json` (avoid races with pi's own writes).
- No network calls beyond the JWT exchange (rare) and the single `/models` GET.
- Extension load latency should be < 500 ms in the typical case (cached JWT + one HTTP GET).

## Ideal State Criteria

### Core Functionality

- [ ] ISC-1: Extension file exists at `dot_pi/agent/extensions/github-copilot-dynamic/index.ts`.
- [ ] ISC-2: Async default factory exports a function taking `ExtensionAPI`.
- [ ] ISC-3: Reads `~/.pi/agent/auth.json` and extracts `github-copilot` credential entry.
- [ ] ISC-4: Uses cached JWT from `auth.access` when `auth.expires > Date.now()`.
- [ ] ISC-5: Calls `refreshGitHubCopilotToken` to mint a new JWT when cached one is expired.
- [ ] ISC-6: Derives baseUrl from the JWT via `getGitHubCopilotBaseUrl`.
- [ ] ISC-7: Sends `GET {baseUrl}/models` with the 4 standard Copilot headers + Bearer auth.
- [ ] ISC-8: Filters out models where `policy.state === "disabled"`.
- [ ] ISC-9: Filters out models where `model_picker_enabled === false`.
- [ ] ISC-10: Maps surviving entries to pi's `Model` shape with `api: "anthropic-messages"` (matching static Copilot models) and the 4 standard Copilot headers.
- [ ] ISC-11: Calls `pi.registerProvider("github-copilot", { models: [...] })` exactly once when the fetch succeeds and the filtered list is non-empty.
- [ ] ISC-12: After `chezmoi apply` and pi restart, `pi --list-models | grep github-copilot` shows at least the previously-static models (proving we didn't wipe them).

### Edge Cases

- [ ] ISC-13: Missing `~/.pi/agent/auth.json` — extension logs warning to stderr and exits cleanly, static models remain.
- [ ] ISC-14: `auth.json` missing `github-copilot` key — extension logs warning and exits cleanly.
- [ ] ISC-15: JWT refresh failure — extension logs warning and exits cleanly.
- [ ] ISC-16: `/models` returns non-2xx — extension logs warning and exits cleanly.
- [ ] ISC-17: `/models` returns empty/all-filtered list — extension logs warning, does NOT call `registerProvider` (would wipe static).

### Anti-Criteria

- [ ] ISC-A-1: Extension does NOT write to `~/.pi/agent/auth.json`.
- [ ] ISC-A-2: Extension does NOT throw or call `process.exit` on any error path.
- [ ] ISC-A-3: Extension does NOT depend on `@mariozechner/*` package names.
- [ ] ISC-A-4: Extension does NOT abstract over multiple providers — github-copilot only, hardcoded.
- [ ] ISC-A-5: Extension does NOT register any tools, commands, hooks, or events — only `registerProvider`.

## Prior Decisions

- **Scout context:** `.pi/plans/2026-05-26-copilot-dynamic-models/scout-context.md` (used as starting point; corrected on merge-vs-replace semantics).
- **User decisions captured this session:**
  - Q1: Header strategy → use whatever the current Copilot provider does → **4 hardcoded headers from pi-ai's `COPILOT_HEADERS`**.
  - Q2: `/models` fetch failure → log warning, fall back to static.
  - Q3: JWT caching → use what pi already caches in `auth.json`; re-exchange only if expired, in-memory only.
  - Q4: Filtering → match opencode (`policy.state !== "disabled" && model_picker_enabled !== false`).
  - Q5: Scope → github-copilot only, hardcoded.
  - Q6: Merge strategy → **(a) replace fully**, `/models` is source of truth.

## Integration Contracts

| Surface | Source of Truth | Verified |
|---|---|---|
| `ExtensionAPI`, `registerProvider` signature | `node_modules/@earendil-works/pi-coding-agent/docs/extensions.md` and `docs/custom-provider.md` | yes — read |
| `Model` shape (id, name, api, headers, compat, reasoning, input, cost, contextWindow, maxTokens) | `node_modules/@earendil-works/pi-ai/dist/models.generated.js` (lines 3741+ for github-copilot static entries) | yes — read |
| `refreshGitHubCopilotToken`, `getGitHubCopilotBaseUrl` exports | `node_modules/@earendil-works/pi-ai/dist/utils/oauth/github-copilot.js` | yes — read |
| `COPILOT_HEADERS` constant values (User-Agent, Editor-Version, Editor-Plugin-Version, Copilot-Integration-Id) | same file as above (not exported; we re-declare the 4 string literals) | yes — read |
| `auth.json` schema (`{ type, access, refresh, expires }` per provider) | live `~/.pi/agent/auth.json` inspected | yes — read |
| `/models` response shape (`{ data: [{ id, ... }] }`) | issue #4599 example + opencode behavior | ✅ verified — curl confirmed `data[]` array; `model_picker_enabled` is a direct boolean field; `policy` can be `null` (not just `{state: 'disabled'}`); `capabilities.limits.{max_context_window_tokens,max_output_tokens}` present; `name` and `vendor` fields present. 44 total / 20 eligible models on this account. |

## Approach

### Key Decisions

- **Decision 1:** Read `auth.json` directly instead of using `ctx.modelRegistry.getApiKeyAndHeaders` — because the factory runs before `session_start`, no `ctx` is available, only the `pi: ExtensionAPI` arg.
- **Decision 2:** Import `refreshGitHubCopilotToken` and `getGitHubCopilotBaseUrl` from `@earendil-works/pi-ai` to avoid reimplementing the JWT exchange + baseUrl parsing.
- **Decision 3:** Re-declare the 4 `COPILOT_HEADERS` string literals in the extension (not exported by pi-ai). Trivial duplication; acceptable for a private extension.
- **Decision 4:** Hardcode every model's `api: "anthropic-messages"` because all static github-copilot models use it. If GitHub later ships a non-Anthropic Copilot model and we hit it, pi will fail at request time — visible failure, easy to fix.
- **Decision 5:** Default `compat`, `reasoning`, `input`, `cost`, `contextWindow`, `maxTokens` from a sensible per-model template (mirroring static models). For unknown fields in the response, use safe defaults: `reasoning: true`, `input: ["text", "image"]`, `cost: 0`, `contextWindow: model.capabilities?.limits?.max_context_window_tokens ?? 128000`, `maxTokens: model.capabilities?.limits?.max_output_tokens ?? 16000`.

### Architecture

Single TypeScript file. Three internal helpers + one exported default factory:

```
index.ts
├─ const COPILOT_HEADERS                  // 4 literal strings
├─ readCopilotAuth(): { jwt, baseUrl } | null
│    ├─ reads ~/.pi/agent/auth.json
│    ├─ if expires > now: returns { access, derived baseUrl }
│    └─ else: calls refreshGitHubCopilotToken, returns fresh JWT + baseUrl
├─ fetchModels({ jwt, baseUrl }): RawModel[]
│    └─ GET {baseUrl}/models, returns response.data
├─ toPiModel(raw): Model                  // shape mapping + headers
└─ default async function (pi: ExtensionAPI) {
     try { ... registerProvider on success ... }
     catch (e) { console.error("[github-copilot-dynamic] ...", e.message); }
   }
```

### Data Flow

```
~/.pi/agent/auth.json
   │ (read + parse)
   ▼
{ access: jwt, refresh, expires }
   │ (if expires > now use access, else refresh)
   ▼
{ jwt }
   │ (getGitHubCopilotBaseUrl)
   ▼
{ jwt, baseUrl }
   │ (GET /models with COPILOT_HEADERS + Bearer)
   ▼
{ data: [raw, raw, ...] }
   │ (filter: policy.state, model_picker_enabled)
   ▼
[raw_passing]
   │ (toPiModel: shape + headers)
   ▼
[Model]
   │ (pi.registerProvider("github-copilot", { models }))
   ▼
pi startup continues, models visible to --list-models
```

## Dependencies

- `@earendil-works/pi-coding-agent` (type `ExtensionAPI`)
- `@earendil-works/pi-ai` (functions `refreshGitHubCopilotToken`, `getGitHubCopilotBaseUrl`; types `Model`, `Api`)
- `node:fs` (read `auth.json`)
- `node:path`, `node:os` (resolve `~/.pi/agent/auth.json`)

No new npm deps. No `package.json` next to extension needed.

## Risks & Open Questions

### Premortem — Riskiest Assumptions

| Assumption | If Wrong | Mitigation |
|---|---|---|
| `/models` response has `data[].policy.state` and `data[].model_picker_enabled` at these exact paths | Filter is a no-op or wrong — surplus/missing models | At impl time, do one manual fetch (curl with the JWT) and log raw JSON of one model. Adjust paths before shipping. |
| `auth.access` is the JWT (not a placeholder needing exchange) | Every startup makes a network call | Verified: the access field is 482 chars and `proxy-ep=…` regex matches it. |
| `refreshGitHubCopilotToken` is exported from `@earendil-works/pi-ai` at runtime | ImportError, extension fails to load | Verified by `grep export` on the dist file — both functions are exported. |
| All Copilot models use `api: "anthropic-messages"` | Some model fails at request time with cryptic error | Accepted — easy to detect and fix; mark as known limitation in inline comment. |
| Empty filtered list is a real edge case | Wipes static models, breaks user | Mitigated by ISC-17 guard: don't call `registerProvider` on empty list. |

### Failure Modes

- **Built the wrong filter:** if we filter on wrong field names, either all models pass (no-op) or all are filtered (ISC-17 guard prevents wipe). Detect via first manual run.
- **Token race**: pi might refresh the token between our read and our use. Worst case: we use a stale-but-still-valid token (5-min buffer means we get 5 min of warning). Acceptable.

Risks accepted as-is. No additional mitigation needed beyond what's already in the design.

## Verification Plan

After implementation, on the dev box:

1. `chezmoi apply` to materialize extension.
2. `pi --list-models 2>&1 | head -40` — confirm github-copilot section shows ≥ the static count.
3. `pi --list-models 2>&1 | grep github-copilot | wc -l` — note the count.
4. Compare against `curl -H "Authorization: Bearer $JWT" -H 'Copilot-Integration-Id: vscode-chat' ... /models | jq '.data | length'`.
5. Try a previously-hidden model: `pi --model github-copilot/<new-model-id> -p "say hi"`.
6. Break auth.json (rename it) → `pi --list-models` should still show static github-copilot models + a stderr warning. Restore after.
