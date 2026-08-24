import {
  parseAnthropicUsage,
  parseCodexUsage,
  type UsageSnapshot,
} from "./usage.ts";

const REQUEST_TIMEOUT_MS = 10_000;

export const PROVIDER_IDS = ["openai-codex", "anthropic"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export function providerName(providerId: ProviderId): string {
  return providerId === "openai-codex" ? "Codex" : "Claude";
}

export interface ProviderRuntime {
  resolveAccessToken(providerId: ProviderId): Promise<string | undefined>;
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
}

function codexAccountId(accessToken: string): string | undefined {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return undefined;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const accountId = claims?.["https://api.openai.com/auth"]?.chatgpt_account_id;
    return typeof accountId === "string" && accountId.length > 0 ? accountId : undefined;
  } catch {
    return undefined;
  }
}

async function requestJson(
  url: string,
  headers: Record<string, string>,
  runtime: ProviderRuntime,
) {
  const requestSignal = runtime.signal
    ? AbortSignal.any([runtime.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
    : AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const response = await (runtime.fetch ?? globalThis.fetch)(url, {
    headers,
    signal: requestSignal,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function fetchProviderUsage(
  providerId: ProviderId,
  runtime: ProviderRuntime,
): Promise<UsageSnapshot> {
  const accessToken = await runtime.resolveAccessToken(providerId);
  if (!accessToken) throw new Error("not signed in");

  if (providerId === "anthropic") {
    if (!accessToken.startsWith("sk-ant-oat")) {
      throw new Error("subscription OAuth is not configured");
    }
    const data = await requestJson(
      "https://api.anthropic.com/api/oauth/usage",
      {
        Authorization: `Bearer ${accessToken}`,
        "anthropic-beta": "oauth-2025-04-20",
        Accept: "application/json",
      },
      runtime,
    );
    return parseAnthropicUsage(data);
  }

  const accountId = codexAccountId(accessToken);
  if (!accountId) throw new Error("account id is unavailable");
  const data = await requestJson(
    "https://chatgpt.com/backend-api/wham/usage",
    {
      Authorization: `Bearer ${accessToken}`,
      "ChatGPT-Account-Id": accountId,
      Accept: "application/json",
      "User-Agent": "pi-subscription-usage/1.0",
    },
    runtime,
  );
  return parseCodexUsage(data);
}
