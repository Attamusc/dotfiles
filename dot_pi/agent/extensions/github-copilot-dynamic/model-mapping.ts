export type CopilotApi = "anthropic-messages" | "openai-completions" | "openai-responses";

/** Prefer the wire protocols advertised by Copilot's live model metadata. */
export function getApi(model): CopilotApi {
  const endpoints = Array.isArray(model.supported_endpoints) ? model.supported_endpoints : [];
  if (endpoints.includes("/v1/messages")) return "anthropic-messages";
  if (endpoints.includes("/responses")) return "openai-responses";
  if (endpoints.includes("/chat/completions")) return "openai-completions";

  // Older Copilot responses did not include supported_endpoints.
  if (/^claude-/.test(model.id)) return "anthropic-messages";
  if (/^gpt-(5|6)/.test(model.id)) return "openai-responses";
  return "openai-completions";
}

/** Derive provider compatibility flags from live model capabilities. */
export function getCompat(model) {
  if (
    model.capabilities?.supports?.adaptive_thinking === true ||
    /^claude-(opus|sonnet)-4\.[6-9]/.test(model.id)
  ) {
    return { forceAdaptiveThinking: true };
  }
  if (/^(gemini|gpt-4|grok)/.test(model.id)) {
    return { supportsStore: false, supportsDeveloperRole: false, supportsReasoningEffort: false };
  }
  if (/^claude-(haiku|sonnet)-4\.5/.test(model.id)) {
    return { supportsEagerToolInputStreaming: false };
  }
  return {};
}

/** Expose Pi's xhigh level when Copilot advertises an equivalent effort. */
export function getThinkingLevelMap(model) {
  const efforts = model.capabilities?.supports?.reasoning_effort;
  if (!Array.isArray(efforts)) return undefined;
  if (efforts.includes("xhigh")) return { xhigh: "xhigh" };
  if (efforts.includes("max")) return { xhigh: "max" };
  return undefined;
}
