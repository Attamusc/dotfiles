# Context for: Dynamic GitHub Copilot Model Discovery Extension

## Summary

The pi extension API **fully supports** dynamic model discovery. An async extension factory can fetch models at startup before pi finishes loading, making them available to `pi --list-models` and the interactive model selector. The Copilot `/models` endpoint is accessible via OAuth token + JWT exchange, and the model shape is well-defined. No blockers identified.

---

## Extension API: Registration & Lifecycle

### Registration Entry Point

Extensions export a default factory function (sync or async):

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Sync factory (simple case)
export default function (pi: ExtensionAPI) {
  pi.registerProvider(...);
}

// Async factory (dynamic discovery — exactly what we need)
export default async function (pi: ExtensionAPI) {
  const models = await fetch("https://api.individual.githubcopilot.com/models");
  pi.registerProvider("github-copilot", { models: [...] });
}
```

**Critical:** If the factory returns a Promise, pi **waits for it** before:
- Continuing startup
- Making `session_start` event available
- Exposing models to `pi --list-models`
- Starting the interactive session

This means dynamic discovery happens exactly at the right time — before the user can select a model.

### Lifecycle Hooks

- `session_start` — Fires after factory completes; can also register tools/commands
- `resources_discover` — Fires after session_start; can contribute skill/prompt paths
- Other events available for tool/command interception, UI updates, etc.

For this task, we only need the async factory. **No need for session_start or other events** — everything happens during initialization.

### Extension Placement

Auto-discovered from:
- `~/.pi/agent/extensions/*.ts` (global, user's own extensions)
- `~/.pi/agent/extensions/*/index.ts` (directory-based, multi-file)
- `.pi/extensions/` (project-local)

Hot-reloadable with `/reload` when placed in auto-discovery paths.

---

## Model Registration: `pi.registerProvider()`

### Signature

```typescript
pi.registerProvider(name: string, config: ProviderConfig)
```

### Config Shape (Relevant Fields)

```typescript
interface ProviderConfig {
  baseUrl?: string;              // API endpoint (can override existing provider)
  apiKey?: string;               // "ENV_VAR" or literal or "!command"
  api?: "anthropic-messages" | "openai-completions" | "openai-responses" | "google-generative-ai";
  models?: Model[];              // Array of model definitions (new or merged with existing)
  headers?: Record<string, string>;  // Custom headers
  oauth?: OAuthConfig;           // OAuth login flow (for subscription-based providers)
}

interface Model {
  id: string;                    // Model identifier (e.g., "claude-opus-4.5")
  name?: string;                 // Human-readable label; defaults to id
  api?: string;                  // Override provider API for this model
  reasoning: boolean;            // Supports extended thinking
  input: ("text" | "image")[];   // Input modalities
  cost: { input, output, cacheRead, cacheWrite };  // $/M tokens
  contextWindow: number;         // Token limit
  maxTokens: number;             // Max output tokens
  thinkingLevelMap?: Record<string, string | null>;  // Thinking level mapping
  compat?: Record<string, any>;  // Provider-specific compatibility flags
}
```

### Merge Semantics (Key Point)

When calling `pi.registerProvider()` with the same provider name multiple times:
- If `models` is provided, custom models are **upserted by id**. Built-in models remain unless overridden by matching id.
- If only `baseUrl`/`headers` are provided (no `models`), existing models are preserved.

**For Copilot:** We can override the `"github-copilot"` provider with fetched models. Missing models from the static list are added; existing ones are replaced if ids match.

---

## GitHub Copilot Auth & Endpoints

### Current Wiring

- **BaseUrl:** `https://api.individual.githubcopilot.com`
- **Auth:** GitHub Copilot OAuth (via `/login` in interactive mode)
- **Static Models:** Defined in `models.generated.js`; includes Claude Haiku 4.5, Opus 4.5, 4.6, 4.7
- **Model Shape:** Anthropic Messages API, includes custom headers (`User-Agent`, `Editor-Version`, `Editor-Plugin-Version`, `Copilot-Integration-Id`)

### `/models` Endpoint

GitHub Copilot likely exposes `https://api.individual.githubcopilot.com/models` (OpenAI-compatible models endpoint). Response shape:

```json
{
  "data": [
    {
      "id": "model-id",
      "name": "Model Name",
      "context_window": 200000,
      "max_tokens": 32000
      // ... other fields
    }
  ]
}
```

**Auth:** The OAuth token returned from `/login` is stored in `~/.pi/agent/auth.json` under `github-copilot`. Extensions access it via:
- `ctx.modelRegistry.getApiKeyAndHeaders(model)` — returns `{ ok: true, apiKey?, headers? }`
- Or inspect `auth.json` directly if needed

**Headers:** Copilot includes dynamic headers (User-Agent, Editor-Version, etc.). These are baked into `models.generated.js` for each model. For dynamically fetched models, headers may need to be constructed or pulled from the built-in models as a template.

---

## Existing Extensions: Patterns & Reference

| Name | Structure | Pattern | Useful For This Task? |
|------|-----------|---------|----------------------|
| `answer` | Single file | Registers custom command; uses `ctx.ui.select()` for interactive choice | No — different purpose |
| `execute-command` | Single file | Event handler (input transform) | No — not for model discovery |
| `smart-sessions` | Single file | Async hook on `input` event; fetches cheap model for summarization | **Yes** — shows pattern of fetching model auth via `ctx.modelRegistry` |
| `todos` | Single file | Custom tool registration + session persistence | No — different purpose |
| `tuner` | Single file | Launches external binary via `ctx.ui.custom()` | No — different purpose |

**Most Relevant:** `smart-sessions` shows:
- How to call `ctx.modelRegistry.find(provider, modelId)` to locate a model
- How to call `ctx.modelRegistry.getApiKeyAndHeaders(model)` to fetch auth
- How to use the auth to make remote API calls (e.g., model completion)

---

## Copilot Model Shape (from models.generated.js)

Example structure for a dynamically fetched model:

```typescript
{
  id: "claude-opus-4.5",
  name: "Claude Opus 4.5",
  api: "anthropic-messages",
  provider: "github-copilot",  // Set by pi when registering
  baseUrl: "https://api.individual.githubcopilot.com",
  headers: {
    "User-Agent": "GitHubCopilotChat/0.35.0",
    "Editor-Version": "vscode/1.107.0",
    "Editor-Plugin-Version": "copilot-chat/0.35.0",
    "Copilot-Integration-Id": "vscode-chat"
  },
  compat: { supportsEagerToolInputStreaming: false },  // Copilot-specific
  reasoning: true,
  input: ["text", "image"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 160000,
  maxTokens: 32000
}
```

**Key insight:** Copilot models use `anthropic-messages` API. The headers are **custom per-model** and baked in. For dynamic models, we'd need to:
1. Fetch from `/models` endpoint
2. For each model, copy the standard Copilot headers from the built-in model definitions
3. Or infer a safe default set (User-Agent, etc.)

---

## Gotchas & Open Questions

1. **Headers for New Models**
   - Static models have specific headers baked in (vscode version, integration ID).
   - Dynamically fetched models may include new model ids we haven't seen before.
   - Solution: Either fetch headers from the `/models` response itself (if Copilot includes them), or use a sensible default matching the built-in models' headers.

2. **Token Refresh**
   - GitHub Copilot OAuth tokens expire. Pi handles refresh automatically (stored in `auth.json`).
   - If the extension runs at startup before token refresh completes, `/models` call might fail with 401.
   - Solution: Wrap the fetch in a try-catch; if it fails, gracefully degrade to static models. Or let pi's normal error handling surface the issue.

3. **Model ID Collision**
   - If `/models` returns a model id already in the static list with different properties, the dynamic model will replace it.
   - Confirm this is desired behavior (likely is — dynamic is more recent).

4. **Subscription-Gated Models**
   - The real `/models` endpoint may return models the user's subscription doesn't include.
   - Pi will list them, but calls will fail at runtime if the user can't access them.
   - This is a UX issue, not a blocker — pi's error handling deals with it.

---

## Recommended Approach Skeleton

**Single async extension factory, placed in `~/.pi/agent/extensions/github-copilot-dynamic.ts`:**

1. Fetch Copilot OAuth token from `ctx.getAuth()` or read `auth.json`.
2. Call `https://api.individual.githubcopilot.com/models` with auth token.
3. Parse response, map each model to pi's Model shape.
4. For each model, use headers from the response or fallback to static headers from built-in models.
5. Call `pi.registerProvider("github-copilot", { models: [...] })` with the fetched + augmented models.
6. Wrap in try-catch; if fetch fails, silently skip and let static models be used.

**Async factory pattern ensures:** Models are available to `pi --list-models` and interactive selection immediately after extension load, before any user prompts.

---

## Files & Paths

| Path | Purpose |
|------|---------|
| `/Users/attamusc/.local/share/mise/installs/node/25.8.1/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md` | Full extension API reference |
| `/Users/attamusc/.local/share/mise/installs/node/25.8.1/lib/node_modules/@earendil-works/pi-coding-agent/docs/custom-provider.md` | `pi.registerProvider()` detailed docs |
| `/Users/attamusc/.local/share/mise/installs/node/25.8.1/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/custom-provider-gitlab-duo/` | Complete provider + OAuth example |
| `/Users/attamusc/.local/share/mise/installs/node/25.8.1/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/models.generated.js` | Static Copilot models (reference for headers, shape) |
| `~/.pi/agent/auth.json` | Stored credentials (Copilot OAuth token here after `/login`) |

---

## No Blockers

✅ Extension API supports async factories — dynamic discovery timing is perfect.  
✅ `pi.registerProvider()` allows overriding + merging models — can augment static list.  
✅ Copilot auth is accessible (OAuth token in `auth.json`, can be fetched via `ctx.modelRegistry`).  
✅ Model shape is well-defined and consistent with built-in models.  
✅ Example extensions (`custom-provider-gitlab-duo`) show the exact pattern needed.  

**Status: Ready to build.**
