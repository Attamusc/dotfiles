import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatDashboardLines,
  formatFooterStatus,
  parseAnthropicUsage,
  parseCodexUsage,
} from "../extensions/subscription-usage/usage.ts";
import { LatestRequestGate } from "../extensions/subscription-usage/refresh-state.ts";
import { fetchProviderUsage } from "../extensions/subscription-usage/providers.ts";
import { registerUsageEvents } from "../extensions/subscription-usage/register.ts";
import { createQuotaObservation } from "../extensions/subscription-usage/history.ts";

test("extension registers the usage command and refresh lifecycle", async () => {
  const events = new Map();
  const commands = new Map();
  const calls = [];
  const handlers = {
    sessionStart: () => calls.push("session_start"),
    modelSelect: () => calls.push("model_select"),
    agentSettled: () => calls.push("agent_settled"),
    sessionShutdown: () => calls.push("session_shutdown"),
    usage: async () => calls.push("usage"),
  };

  registerUsageEvents({
    on: (name, handler) => events.set(name, handler),
    registerCommand: (name, command) => commands.set(name, command),
  }, handlers);

  assert.deepEqual([...events.keys()], [
    "session_start",
    "model_select",
    "agent_settled",
    "session_shutdown",
  ]);
  assert.equal(commands.get("usage").description, "Show Codex and Claude subscription usage");

  for (const [name, handler] of events) handler({}, {});
  await commands.get("usage").handler("", {});
  assert.deepEqual(calls, [
    "session_start",
    "model_select",
    "agent_settled",
    "session_shutdown",
    "usage",
  ]);
});

test("quota observations copy only approved normalized fields", () => {
  const canarySecrets = {
    accessToken: "canary-access-token",
    accountId: "canary-account-id",
    accountHash: "canary-account-hash",
    authorization: "Bearer canary-authorization",
    cwd: "/canary/private/cwd",
    prompt: "canary-private-prompt",
    rawPayload: { jwt: { claims: { subject: "canary-jwt-subject" } } },
  };
  const snapshot = {
    providerId: "openai-codex",
    providerName: "Codex canary-provider-name",
    plan: "Pro",
    windows: [{
      id: "codex-primary",
      label: "5h",
      usedPercent: 12.5,
      resetsAt: 1788582583,
      scope: "Spark",
      modelId: "gpt-5.3-codex-spark",
      rejected: canarySecrets,
    }],
    details: ["canary-detail", canarySecrets],
    footerStatus: { text: "canary-footer", level: "success", rejected: canarySecrets },
    rejected: canarySecrets,
  };

  const sourceBeforeCopy = structuredClone(snapshot);
  const observation = createQuotaObservation(snapshot, {
    observedAt: new Date("2026-09-06T18:22:03.456Z"),
    runtimeSeriesId: "runtime-550e8400-e29b-41d4-a716-446655440000",
    refreshReason: "agent_settled",
  });

  assert.deepEqual(observation, {
    schemaVersion: 1,
    observedAt: "2026-09-06T18:22:03.456Z",
    runtimeSeriesId: "runtime-550e8400-e29b-41d4-a716-446655440000",
    refreshReason: "agent_settled",
    providerId: "openai-codex",
    plan: "Pro",
    windows: [{
      id: "codex-primary",
      label: "5h",
      usedPercent: 12.5,
      resetsAt: 1788582583,
      scope: "Spark",
      modelId: "gpt-5.3-codex-spark",
    }],
  });
  assert.deepEqual(snapshot, sourceBeforeCopy);
  assert.notEqual(observation.windows, snapshot.windows);
  assert.notEqual(observation.windows[0], snapshot.windows[0]);

  snapshot.windows[0].label = "mutated";
  assert.equal(observation.windows[0].label, "5h");

  const serialized = JSON.stringify(observation);
  const assertCanariesAbsent = (value) => {
    if (typeof value === "string" && value.includes("canary-")) {
      assert.equal(serialized.includes(value), false, `leaked ${value}`);
    }
    if (value && typeof value === "object") {
      for (const child of Object.values(value)) assertCanariesAbsent(child);
    }
  };
  assertCanariesAbsent(snapshot);
});

test("Codex provider pins OAuth credentials to the usage endpoint", async () => {
  const accountId = "acct-test";
  const token = `header.${Buffer.from(JSON.stringify({
    "https://api.openai.com/auth": { chatgpt_account_id: accountId },
  })).toString("base64url")}.signature`;
  let request;

  const snapshot = await fetchProviderUsage("openai-codex", {
    resolveAccessToken: async () => token,
    fetch: async (url, init) => {
      request = { url, init };
      return new Response(JSON.stringify({
        rate_limit: {
          primary_window: { used_percent: 35, limit_window_seconds: 604800 },
        },
      }));
    },
  });

  assert.equal(request.url, "https://chatgpt.com/backend-api/wham/usage");
  assert.equal(request.init.headers.Authorization, `Bearer ${token}`);
  assert.equal(request.init.headers["ChatGPT-Account-Id"], accountId);
  assert.equal(snapshot.providerId, "openai-codex");
  assert.equal(JSON.stringify(snapshot).includes(token), false);
  assert.equal(JSON.stringify(snapshot).includes(accountId), false);
});

test("Claude provider uses subscription OAuth without accepting API keys", async () => {
  const requests = [];
  const snapshot = await fetchProviderUsage("anthropic", {
    resolveAccessToken: async () => "sk-ant-oat-test",
    fetch: async (url, init) => {
      requests.push({ url, init });
      return new Response(JSON.stringify({
        five_hour: { utilization: 10, resets_at: null },
        seven_day: { utilization: 20, resets_at: null },
        extra_usage: { is_enabled: false },
      }));
    },
  });

  assert.equal(requests[0].url, "https://api.anthropic.com/api/oauth/usage");
  assert.equal(requests[0].init.headers.Authorization, "Bearer sk-ant-oat-test");
  assert.equal(requests[0].init.headers["anthropic-beta"], "oauth-2025-04-20");
  assert.equal(snapshot.footerStatus.level, "warning");

  await assert.rejects(
    fetchProviderUsage("anthropic", {
      resolveAccessToken: async () => "sk-ant-api-test",
      fetch: async () => { throw new Error("must not fetch"); },
    }),
    /subscription OAuth is not configured/,
  );
});

test("only the latest provider refresh may update a session", () => {
  const gate = new LatestRequestGate();
  const olderCodex = gate.start("openai-codex");
  const claude = gate.start("anthropic");
  const newerCodex = gate.start("openai-codex");

  assert.equal(gate.isCurrent(olderCodex), false);
  assert.equal(gate.isCurrent(newerCodex), true);
  assert.equal(gate.isCurrent(claude), true);

  gate.reset();
  assert.equal(gate.isCurrent(newerCodex), false);
  assert.equal(gate.isCurrent(claude), false);
});

test("Codex usage includes general and model-specific quota windows", () => {
  const snapshot = parseCodexUsage({
    plan_type: "prolite",
    rate_limit: {
      primary_window: {
        used_percent: 35,
        limit_window_seconds: 604800,
        reset_at: 1789132009,
      },
    },
    additional_rate_limits: [
      {
        limit_name: "Spark",
        normal_model_slug: "gpt-5.3-codex-spark",
        metered_feature: "codex_bengalfox",
        rate_limit: {
          primary_window: {
            used_percent: 10,
            limit_window_seconds: 18000,
            reset_at: 1788582583,
          },
          secondary_window: {
            used_percent: 20,
            limit_window_seconds: 604800,
            reset_at: 1789132005,
          },
        },
      },
    ],
    credits: {
      has_credits: true,
      unlimited: false,
      balance: "12.5",
    },
    spend_control: { reached: false, individual_limit: null },
    rate_limit_reset_credits: { available_count: 1, applicable_available_count: 0 },
  });

  assert.deepEqual(snapshot, {
    providerId: "openai-codex",
    providerName: "Codex",
    plan: "Pro Lite",
    windows: [
      {
        id: "codex-primary",
        label: "7d",
        usedPercent: 35,
        resetsAt: 1789132009,
      },
      {
        id: "codex-bengalfox-primary",
        label: "5h",
        scope: "Spark",
        modelId: "gpt-5.3-codex-spark",
        usedPercent: 10,
        resetsAt: 1788582583,
      },
      {
        id: "codex-bengalfox-secondary",
        label: "7d",
        scope: "Spark",
        modelId: "gpt-5.3-codex-spark",
        usedPercent: 20,
        resetsAt: 1789132005,
      },
    ],
    details: ["Credits: 12.5", "Spend cap: OK", "Reset credits: 1 available"],
  });
});

test("Claude usage normalizes rolling and model-specific windows", () => {
  const snapshot = parseAnthropicUsage({
    five_hour: {
      utilization: 12.5,
      resets_at: "2026-09-05T03:00:00Z",
    },
    seven_day: {
      utilization: 40,
      resets_at: "2026-09-11T13:00:00Z",
    },
    seven_day_sonnet: {
      utilization: 75,
      resets_at: "2026-09-10T08:30:00Z",
    },
    seven_day_omelette: {
      utilization: 55,
      resets_at: "2026-09-09T08:30:00Z",
    },
    extra_usage: {
      is_enabled: true,
      monthly_limit: 2000,
      used_credits: 725,
      currency: "USD",
    },
  });

  assert.deepEqual(snapshot, {
    providerId: "anthropic",
    providerName: "Claude",
    windows: [
      {
        id: "claude-five-hour",
        label: "5h",
        usedPercent: 12.5,
        resetsAt: 1788577200,
      },
      {
        id: "claude-seven-day",
        label: "7d",
        usedPercent: 40,
        resetsAt: 1789131600,
      },
      {
        id: "claude-seven-day-sonnet",
        label: "7d",
        scope: "Sonnet",
        modelId: "sonnet",
        usedPercent: 75,
        resetsAt: 1789029000,
      },
      {
        id: "claude-seven-day-opus",
        label: "7d",
        scope: "Opus",
        modelId: "opus",
        usedPercent: 55,
        resetsAt: 1788942600,
      },
    ],
    details: ["Extra usage: $7.25 of $20.00 USD"],
    footerStatus: {
      text: "extra usage 64% left",
      level: "success",
    },
  });
});

test("Claude accepts the seven_day_opus field name", () => {
  const snapshot = parseAnthropicUsage({
    seven_day_opus: {
      utilization: 55,
      resets_at: "2026-09-09T08:30:00Z",
    },
  });

  assert.deepEqual(snapshot.windows, [{
    id: "claude-seven-day-opus",
    label: "7d",
    scope: "Opus",
    modelId: "opus",
    usedPercent: 55,
    resetsAt: 1788942600,
  }]);
});

test("Claude reports when third-party extra usage is disabled", () => {
  const snapshot = parseAnthropicUsage({
    five_hour: { utilization: 0, resets_at: null },
    seven_day: { utilization: 0, resets_at: null },
    extra_usage: { is_enabled: false },
  });

  assert.deepEqual(snapshot.footerStatus, {
    text: "extra usage disabled",
    level: "warning",
  });
  assert.deepEqual(snapshot.details, ["⚠ Extra usage disabled for third-party apps"]);
  assert.ok(formatDashboardLines([snapshot]).includes("  ⚠ Extra usage disabled for third-party apps"));
  assert.equal(formatFooterStatus(snapshot, "claude-sonnet-5"), "Claude extra usage disabled");
});

test("footer shows the two tightest limits relevant to the active model", () => {
  const snapshot = parseCodexUsage({
    rate_limit: {
      primary_window: {
        used_percent: 35,
        limit_window_seconds: 604800,
        reset_at: 1789132009,
      },
    },
    additional_rate_limits: [
      {
        limit_name: "Spark",
        normal_model_slug: "gpt-5.3-codex-spark",
        metered_feature: "codex_bengalfox",
        rate_limit: {
          primary_window: {
            used_percent: 10,
            limit_window_seconds: 18000,
            reset_at: 1788582583,
          },
          secondary_window: {
            used_percent: 20,
            limit_window_seconds: 604800,
            reset_at: 1789132005,
          },
        },
      },
    ],
  });

  assert.equal(
    formatFooterStatus(snapshot, "gpt-5.3-codex-spark", "UTC"),
    "Codex 7d 65% left ↺ Sep 11, 1:06 PM · Spark 7d 80% left",
  );
  assert.equal(
    formatFooterStatus(snapshot, "gpt-5.6-sol", "UTC"),
    "Codex 7d 65% left ↺ Sep 11, 1:06 PM",
  );
});

test("dashboard presents remaining headroom and reset times consistently", () => {
  const codex = parseCodexUsage({
    plan_type: "prolite",
    rate_limit: {
      primary_window: {
        used_percent: 35,
        limit_window_seconds: 604800,
        reset_at: 1789132009,
      },
    },
  });
  const claude = parseAnthropicUsage({
    five_hour: { utilization: 0, resets_at: null },
    seven_day: { utilization: 0, resets_at: null },
  });

  assert.deepEqual(formatDashboardLines([codex, claude], "UTC"), [
    "SUBSCRIPTION USAGE",
    "",
    "Codex · Pro Lite",
    "  7d               █████████████░░░░░░░ 65% left",
    "                   resets Sep 11, 1:06 PM",
    "",
    "Claude",
    "  5h               ████████████████████ 100% left",
    "  7d               ████████████████████ 100% left",
  ]);
});
