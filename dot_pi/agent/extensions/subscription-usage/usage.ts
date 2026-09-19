export interface UsageWindow {
  id: string;
  label: string;
  usedPercent: number;
  resetsAt?: number;
  scope?: string;
  modelId?: string;
}

export interface UsageSnapshot {
  providerId: "openai-codex" | "anthropic";
  providerName: string;
  plan?: string;
  windows: UsageWindow[];
  details: string[];
  footerStatus?: {
    text: string;
    level: "success" | "warning" | "error";
  };
}

function windowLabel(seconds: number): string {
  if (seconds % 86400 === 0) return `${seconds / 86400}d`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

function planLabel(plan: unknown): string | undefined {
  if (typeof plan !== "string" || plan.length === 0) return undefined;
  if (plan === "prolite") return "Pro Lite";
  return plan
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function appendCodexWindow(
  windows: UsageWindow[],
  id: string,
  raw: any,
  scope?: string,
  modelId?: string,
): void {
  if (!raw || !Number.isFinite(Number(raw.used_percent))) return;
  const seconds = Number(raw.limit_window_seconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return;

  windows.push({
    id,
    label: windowLabel(seconds),
    ...(scope ? { scope, modelId: modelId ?? scope.toLowerCase() } : {}),
    usedPercent: Math.max(0, Math.min(100, Number(raw.used_percent))),
    ...(Number.isFinite(Number(raw.reset_at)) ? { resetsAt: Number(raw.reset_at) } : {}),
  });
}

function unixSeconds(value: unknown): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const milliseconds = typeof value === "number" && value < 100_000_000_000
    ? value * 1000
    : new Date(value).getTime();
  return Number.isFinite(milliseconds) ? Math.floor(milliseconds / 1000) : undefined;
}

function appendAnthropicWindow(
  windows: UsageWindow[],
  id: string,
  label: string,
  raw: any,
  scope?: string,
): void {
  if (!raw || !Number.isFinite(Number(raw.utilization))) return;
  const resetsAt = unixSeconds(raw.resets_at);
  windows.push({
    id,
    label,
    ...(scope ? { scope, modelId: scope.toLowerCase() } : {}),
    usedPercent: Math.max(0, Math.min(100, Number(raw.utilization))),
    ...(resetsAt === undefined ? {} : { resetsAt }),
  });
}

export function parseCodexUsage(data: any): UsageSnapshot {
  const windows: UsageWindow[] = [];
  appendCodexWindow(windows, "codex-primary", data?.rate_limit?.primary_window);
  appendCodexWindow(windows, "codex-secondary", data?.rate_limit?.secondary_window);

  for (const additional of data?.additional_rate_limits ?? []) {
    const scope = typeof additional?.limit_name === "string" ? additional.limit_name : undefined;
    const feature = typeof additional?.metered_feature === "string"
      ? additional.metered_feature.replace(/^codex_/, "codex-").replaceAll("_", "-")
      : "codex-additional";
    const modelId = typeof additional?.normal_model_slug === "string"
      ? additional.normal_model_slug.toLowerCase()
      : undefined;
    appendCodexWindow(
      windows,
      `${feature}-primary`,
      additional?.rate_limit?.primary_window,
      scope,
      modelId,
    );
    appendCodexWindow(
      windows,
      `${feature}-secondary`,
      additional?.rate_limit?.secondary_window,
      scope,
      modelId,
    );
  }

  const details: string[] = [];
  if (data?.credits?.unlimited === true) {
    details.push("Credits: unlimited");
  } else if (data?.credits?.has_credits === true && data.credits.balance != null) {
    details.push(`Credits: ${data.credits.balance}`);
  }
  if (data?.spend_control && typeof data.spend_control.reached === "boolean") {
    details.push(`Spend cap: ${data.spend_control.reached ? "reached" : "OK"}`);
  }
  const resetCredits = Number(data?.rate_limit_reset_credits?.available_count);
  if (Number.isInteger(resetCredits) && resetCredits > 0) {
    details.push(`Reset credits: ${resetCredits} available`);
  }

  return {
    providerId: "openai-codex",
    providerName: "Codex",
    plan: planLabel(data?.plan_type),
    windows,
    details,
  };
}

function shortScope(scope: string): string {
  const codexName = scope.match(/codex-(.+)$/i)?.[1];
  return codexName ?? scope;
}

function formatResetTime(timestamp: number, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(timestamp * 1000));
}

export function formatDashboardLines(
  snapshots: UsageSnapshot[],
  timeZone?: string,
): string[] {
  if (snapshots.length === 0) return ["SUBSCRIPTION USAGE", "", "No usage data available."];

  const lines = ["SUBSCRIPTION USAGE", ""];
  snapshots.forEach((snapshot, snapshotIndex) => {
    if (snapshotIndex > 0) lines.push("");
    lines.push(snapshot.plan ? `${snapshot.providerName} · ${snapshot.plan}` : snapshot.providerName);

    for (const window of snapshot.windows) {
      const label = `${window.scope ? `${shortScope(window.scope)} ` : ""}${window.label}`;
      const remaining = Math.round(100 - window.usedPercent);
      const filled = Math.round(remaining / 5);
      const bar = `${"█".repeat(filled)}${"░".repeat(20 - filled)}`;
      lines.push(`  ${label.padEnd(17)}${bar} ${remaining}% left`);
      if (window.resetsAt) {
        lines.push(`${"".padEnd(19)}resets ${formatResetTime(window.resetsAt, timeZone)}`);
      }
    }
    lines.push(...snapshot.details.map((detail) => `  ${detail}`));
  });
  return lines;
}

export function selectFooterWindows(
  snapshot: UsageSnapshot,
  activeModelId: string,
): UsageWindow[] {
  const normalizedModelId = activeModelId.toLowerCase();
  return snapshot.windows
    .filter((window) => !window.modelId || normalizedModelId.includes(window.modelId))
    .sort((left, right) => right.usedPercent - left.usedPercent)
    .slice(0, 1);
}

export function formatFooterStatus(
  snapshot: UsageSnapshot,
  activeModelId: string,
): string | undefined {
  const closest = selectFooterWindows(snapshot, activeModelId)[0];
  if (!closest) return snapshot.footerStatus?.text;

  const remaining = Math.round(100 - closest.usedPercent);
  const scope = closest.scope ? `${shortScope(closest.scope)} ` : "";
  return `${scope}${closest.label} ${remaining}%`;
}

export function parseAnthropicUsage(data: any): UsageSnapshot {
  const windows: UsageWindow[] = [];
  appendAnthropicWindow(windows, "claude-five-hour", "5h", data?.five_hour);
  appendAnthropicWindow(windows, "claude-seven-day", "7d", data?.seven_day);
  appendAnthropicWindow(
    windows,
    "claude-seven-day-sonnet",
    "7d",
    data?.seven_day_sonnet,
    "Sonnet",
  );
  appendAnthropicWindow(
    windows,
    "claude-seven-day-opus",
    "7d",
    data?.seven_day_omelette ?? data?.seven_day_opus,
    "Opus",
  );

  const details: string[] = [];
  const extra = data?.extra_usage;
  let footerStatus: UsageSnapshot["footerStatus"];
  if (extra?.is_enabled === false) {
    details.push("⚠ Extra usage disabled for third-party apps");
    footerStatus = { text: "extra usage disabled", level: "warning" };
  } else if (
    extra?.is_enabled === true &&
    Number(extra.monthly_limit) > 0 &&
    Number.isFinite(Number(extra.used_credits))
  ) {
    const used = Number(extra.used_credits) / 100;
    const limit = Number(extra.monthly_limit) / 100;
    const usedPercent = Number.isFinite(Number(extra.utilization))
      ? Number(extra.utilization)
      : (used / limit) * 100;
    const remaining = Math.round(Math.max(0, Math.min(100, 100 - usedPercent)));
    const level = remaining <= 10 ? "error" : remaining <= 25 ? "warning" : "success";
    const currency = typeof extra.currency === "string" ? ` ${extra.currency}` : "";
    details.push(`Extra usage: $${used.toFixed(2)} of $${limit.toFixed(2)}${currency}`);
    footerStatus = { text: `extra usage ${remaining}% left`, level };
  }

  return {
    providerId: "anthropic",
    providerName: "Claude",
    windows,
    details,
    ...(footerStatus ? { footerStatus } : {}),
  };
}
