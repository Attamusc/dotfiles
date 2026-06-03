/**
 * github-copilot-dynamic — Dynamic model discovery for GitHub Copilot.
 *
 * Fetches the live /models list from the Copilot API at pi startup and
 * replaces the static github-copilot provider model list with whatever
 * GitHub actually serves for this account (including subscription-gated
 * and feature-flagged models not in pi-ai's static models.generated.js).
 *
 * Failure modes (all silent — static models remain):
 *   - No auth.json or missing github-copilot entry
 *   - JWT exchange fails (network, 401)
 *   - /models fetch fails (network, non-2xx)
 *   - /models response is malformed or produces an empty filtered list
 *
 * The refreshed JWT is kept in-memory only; auth.json is never written.
 *
 * Each model's `api` is derived from its id family (see `getApi`) to match
 * pi-ai's static registry — Claude models route to anthropic-messages, GPT-5
 * to openai-responses, and GPT-4 / Gemini / Grok to openai-completions.
 * Unknown id families default to openai-completions and emit a console
 * warning so novel models are visible rather than silently broken.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  githubCopilotOAuthProvider,
  getGitHubCopilotBaseUrl,
  refreshGitHubCopilotToken,
} from "@earendil-works/pi-ai/oauth";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Re-declared from pi-ai's COPILOT_HEADERS (not exported by pi-ai).
const COPILOT_HEADERS: Record<string, string> = {
  "User-Agent": "GitHubCopilotChat/0.35.0",
  "Editor-Version": "vscode/1.107.0",
  "Editor-Plugin-Version": "copilot-chat/0.35.0",
  "Copilot-Integration-Id": "vscode-chat",
};

const TAG = "[github-copilot-dynamic]";

interface AuthEntry {
  type: string;
  access: string;
  refresh: string;
  expires: number;
  enterpriseUrl?: string;
}

interface CopilotAuth {
  jwt: string;
  baseUrl: string;
  enterpriseUrl?: string;
}

interface RawModel {
  id: string;
  name?: string;
  model_picker_enabled?: boolean;
  policy?: { state: string } | null;
  capabilities?: {
    limits?: {
      max_context_window_tokens?: number;
      max_output_tokens?: number;
    };
  };
}

async function readCopilotAuth(): Promise<CopilotAuth | null> {
  const authPath = join(homedir(), ".pi", "agent", "auth.json");

  let raw: string;
  try {
    raw = readFileSync(authPath, "utf8");
  } catch {
    console.error(`${TAG} no auth.json found, skipping dynamic discovery`);
    return null;
  }

  let authData: Record<string, AuthEntry>;
  try {
    authData = JSON.parse(raw);
  } catch {
    console.error(`${TAG} failed to parse auth.json, skipping dynamic discovery`);
    return null;
  }

  const entry = authData["github-copilot"];
  if (!entry) {
    console.error(`${TAG} no github-copilot credentials in auth.json, skipping dynamic discovery`);
    return null;
  }

  // Use cached Copilot JWT if still valid.
  if (entry.expires > Date.now()) {
    return {
      jwt: entry.access,
      baseUrl: getGitHubCopilotBaseUrl(entry.access, entry.enterpriseUrl),
      enterpriseUrl: entry.enterpriseUrl,
    };
  }

  // JWT expired — exchange refresh token for a new Copilot JWT.
  try {
    const refreshed = await refreshGitHubCopilotToken(entry.refresh, entry.enterpriseUrl);
    return {
      jwt: refreshed.access,
      baseUrl: getGitHubCopilotBaseUrl(refreshed.access, entry.enterpriseUrl),
      enterpriseUrl: entry.enterpriseUrl,
    };
  } catch (err: unknown) {
    console.error(`${TAG} JWT refresh failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function fetchModels(auth: CopilotAuth): Promise<RawModel[] | null> {
  let response: Response;
  try {
    response = await fetch(`${auth.baseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${auth.jwt}`,
        Accept: "application/json",
        ...COPILOT_HEADERS,
      },
    });
  } catch (err: unknown) {
    console.error(`${TAG} /models fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }

  if (!response.ok) {
    console.error(`${TAG} /models returned HTTP ${response.status}, skipping dynamic discovery`);
    return null;
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    console.error(`${TAG} /models response is not valid JSON, skipping dynamic discovery`);
    return null;
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !Array.isArray((body as Record<string, unknown>).data)
  ) {
    console.error(`${TAG} /models response missing .data array, skipping dynamic discovery`);
    return null;
  }

  return (body as { data: RawModel[] }).data;
}

function isModelEligible(model: RawModel): boolean {
  if (model.model_picker_enabled === false) return false;
  if (model.policy?.state === "disabled") return false;
  return true;
}

/** Derive compat flags from model id to match pi-ai's static registry. */
function getCompat(id: string): Record<string, boolean> {
  // Adaptive-thinking models: claude-opus-4.6+, claude-sonnet-4.6+
  if (/^claude-(opus|sonnet)-4\.[6-9]/.test(id)) {
    return { forceAdaptiveThinking: true };
  }
  // Gemini / GPT / Grok: no streaming, no developer role, no reasoning effort
  if (/^(gemini|gpt-4|grok)/.test(id)) {
    return { supportsStore: false, supportsDeveloperRole: false, supportsReasoningEffort: false };
  }
  // Haiku / Sonnet 4.5: eager tool streaming off
  if (/^claude-(haiku|sonnet)-4\.5/.test(id)) {
    return { supportsEagerToolInputStreaming: false };
  }
  return {};
}

/**
 * Derive the API protocol from a model id. Mirrors the static github-copilot
 * registry in pi-ai's models.generated.js — Copilot proxies multiple upstream
 * providers behind one base URL, and each model family speaks a different
 * wire protocol.
 */
type CopilotApi = "anthropic-messages" | "openai-completions" | "openai-responses";

function getApi(id: string): CopilotApi {
  if (/^claude-/.test(id)) return "anthropic-messages";
  if (/^gpt-5/.test(id)) return "openai-responses";
  if (/^(gpt-4|gemini|grok)/.test(id)) return "openai-completions";
  console.error(
    `${TAG} unknown model id family for "${id}", defaulting api to "openai-completions"`,
  );
  return "openai-completions";
}

function toPiModel(raw: RawModel) {
  return {
    id: raw.id,
    name: raw.name ?? raw.id,
    api: getApi(raw.id),
    headers: { ...COPILOT_HEADERS },
    compat: getCompat(raw.id),
    reasoning: true,
    input: ["text", "image"] as ("text" | "image")[],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: raw.capabilities?.limits?.max_context_window_tokens ?? 128000,
    maxTokens: raw.capabilities?.limits?.max_output_tokens ?? 16000,
  };
}

export default async function (pi: ExtensionAPI) {
  try {
    const auth = await readCopilotAuth();
    if (!auth) return;

    const rawModels = await fetchModels(auth);
    if (!rawModels) return;

    const eligible = rawModels.filter(isModelEligible);
    if (eligible.length === 0) {
      console.error(`${TAG} /models returned no eligible models after filtering, skipping registerProvider`);
      return;
    }

    const models = eligible.map(toPiModel);
    // baseUrl + oauth are required by pi's registerProvider validation when
    // `models` is set. Per-model `api` (set by getApi above) satisfies the
    // per-model api requirement, so no provider-level `api` fallback is needed
    // — omitting it makes the multi-protocol shape explicit. Re-registering
    // the same OAuth provider is idempotent (keyed by id), and
    // oauth.modifyModels rewrites each model's baseUrl from the live JWT
    // after our models are pushed.
    pi.registerProvider("github-copilot", {
      baseUrl: auth.baseUrl,
      oauth: githubCopilotOAuthProvider,
      models,
    });
  } catch (err: unknown) {
    console.error(`${TAG} unexpected error: ${err instanceof Error ? err.message : String(err)}`);
  }
}
