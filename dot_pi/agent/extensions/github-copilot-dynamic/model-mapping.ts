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
