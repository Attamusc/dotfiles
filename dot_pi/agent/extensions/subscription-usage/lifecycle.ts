import type { QuotaHistory, QuotaHistoryHealth, RefreshReason } from "./history.ts";
import type { ProviderId } from "./providers.ts";
import { PROVIDER_IDS } from "./providers.ts";
import { LatestRequestGate } from "./refresh-state.ts";
import type { UsageSnapshot } from "./usage.ts";

interface LifecycleContext {
  hasUI: boolean;
  model?: { provider: string };
}

interface UsageLifecycleDependencies<Context extends LifecycleContext> {
  fetchUsage(providerId: ProviderId, ctx: Context): Promise<UsageSnapshot>;
  createHistory(): QuotaHistory;
  updateFooter(
    state: { snapshots: Map<ProviderId, UsageSnapshot>; errors: Map<ProviderId, string> },
    ctx: Context,
  ): void;
}

const STORAGE_UNAVAILABLE: QuotaHistoryHealth = {
  enabled: false,
  diagnostic: "storage_unavailable",
};

export function createUsageLifecycle<Context extends LifecycleContext>(
  dependencies: UsageLifecycleDependencies<Context>,
) {
  const snapshots = new Map<ProviderId, UsageSnapshot>();
  const errors = new Map<ProviderId, string>();
  const requestGate = new LatestRequestGate();
  let history: QuotaHistory | undefined;
  let historyFailure = false;

  function getHistory(): QuotaHistory | undefined {
    if (historyFailure) return undefined;
    try {
      return history ??= dependencies.createHistory();
    } catch {
      historyFailure = true;
      return undefined;
    }
  }

  function record(snapshot: UsageSnapshot, reason: RefreshReason): void {
    try {
      const result = getHistory()?.record(snapshot, reason);
      if (result && typeof (result as unknown as PromiseLike<void>).then === "function") {
        void Promise.resolve(result).catch(() => { historyFailure = true; });
      }
    } catch {
      historyFailure = true;
    }
  }

  async function refreshProvider(
    providerId: ProviderId,
    ctx: Context,
    reason: RefreshReason,
  ): Promise<void> {
    const ticket = requestGate.start(providerId);
    try {
      const snapshot = await dependencies.fetchUsage(providerId, ctx);
      if (!requestGate.isCurrent(ticket)) return;
      snapshots.set(providerId, snapshot);
      errors.delete(providerId);
      record(snapshot, reason);
    } catch (error) {
      if (!requestGate.isCurrent(ticket)) return;
      errors.set(providerId, error instanceof Error ? error.message : "request failed");
    }
    if (requestGate.isCurrent(ticket)) dependencies.updateFooter({ snapshots, errors }, ctx);
  }

  async function refreshAll(ctx: Context, reason: RefreshReason): Promise<void> {
    await Promise.all(PROVIDER_IDS.map((providerId) => refreshProvider(providerId, ctx, reason)));
  }

  return {
    state: () => ({ snapshots, errors }),
    historyHealth(): QuotaHistoryHealth {
      if (historyFailure) return STORAGE_UNAVAILABLE;
      try {
        return history?.health() ?? { enabled: true };
      } catch {
        historyFailure = true;
        return STORAGE_UNAVAILABLE;
      }
    },
    async sessionStart(_event: unknown, ctx: Context): Promise<void> {
      requestGate.reset();
      snapshots.clear();
      errors.clear();
      if (ctx.hasUI) await refreshAll(ctx, "session_start");
    },
    async modelSelect(event: { model: { provider: string } }, ctx: Context): Promise<void> {
      dependencies.updateFooter({ snapshots, errors }, ctx);
      const providerId = event.model.provider as ProviderId;
      if (PROVIDER_IDS.includes(providerId)) await refreshProvider(providerId, ctx, "model_select");
    },
    async agentSettled(_event: unknown, ctx: Context): Promise<void> {
      const providerId = ctx.model?.provider as ProviderId | undefined;
      if (providerId && PROVIDER_IDS.includes(providerId)) {
        await refreshProvider(providerId, ctx, "agent_settled");
      }
    },
    async usage(_args: unknown, ctx: Context): Promise<void> {
      await refreshAll(ctx, "usage");
    },
    async sessionShutdown(_event: unknown, _ctx: Context): Promise<void> {
      requestGate.reset();
      const activeHistory = history;
      if (!activeHistory) return;
      try {
        await activeHistory.flush(100);
      } catch {
        historyFailure = true;
      }
    },
  };
}
