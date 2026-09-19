import {
  type ExtensionAPI,
  type ExtensionContext,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import {
  Box,
  Container,
  Key,
  matchesKey,
  Spacer,
  Text,
} from "@earendil-works/pi-tui";
import {
  fetchProviderUsage,
  providerName,
  PROVIDER_IDS,
  type ProviderId,
} from "./providers.ts";
import { createQuotaHistory, type QuotaHistoryHealth } from "./history.ts";
import { createUsageLifecycle } from "./lifecycle.ts";
import { registerUsageEvents } from "./register.ts";
import {
  formatDashboardLines,
  formatFooterStatus,
  selectFooterWindows,
  type UsageSnapshot,
} from "./usage.ts";

const STATUS_ID = "subscription-usage";

function dashboardComponent(
  theme: Theme,
  snapshots: UsageSnapshot[],
  errors: Map<ProviderId, string>,
  historyHealth: QuotaHistoryHealth,
  done: () => void,
) {
  function buildContent(): Container {
    const lines = formatDashboardLines(snapshots).slice(2);
    lines.push("", historyHealth.enabled ? "History: enabled" : "History: unavailable");
    if (errors.size > 0) {
      lines.push("", "UNAVAILABLE");
      for (const providerId of PROVIDER_IDS) {
        const error = errors.get(providerId);
        if (error) lines.push(`  ${providerName(providerId)} · ${error}`);
      }
    }

    const content = new Container();
    for (const line of lines) {
      if (line === "") {
        content.addChild(new Spacer(1));
        continue;
      }

      let rendered = line;
      if (line === "UNAVAILABLE") {
        rendered = theme.fg("warning", theme.bold(line));
      } else if (!line.startsWith(" ")) {
        rendered = theme.bold(line);
      } else if (line.trimStart().startsWith("resets")) {
        rendered = theme.fg("dim", line);
      } else if (line.trimStart().startsWith("⚠")) {
        rendered = theme.fg("warning", line);
      } else if (line.includes("█") || line.includes("░")) {
        const remaining = Number(line.match(/(\d+)% left/)?.[1] ?? 100);
        const color = remaining <= 10 ? "error" : remaining <= 25 ? "warning" : "success";
        rendered = theme.fg(color, line);
      } else {
        rendered = theme.fg("muted", line);
      }
      content.addChild(new Text(rendered, 0, 0));
    }
    return content;
  }

  function buildPanel(width: number): string[] {
    const frameWidth = Math.max(4, width - 1);
    const innerWidth = frameWidth - 2;
    const border = (text: string) => theme.fg("borderAccent", text);
    const shadow = theme.fg("dim", "░");
    const background = (text: string) => theme.bg("customMessageBg", text);
    const title = " SUBSCRIPTION USAGE ";
    const titleLead = "━━";
    const titleTail = "━".repeat(Math.max(0, innerWidth - titleLead.length - title.length));

    const body = new Box(1, 1, background);
    body.addChild(buildContent());
    const footer = new Box(1, 0, background);
    footer.addChild(new Text(theme.fg("dim", "esc / q  close"), 0, 0));

    const lines = [
      border(`┏${titleLead}`) + theme.fg("accent", theme.bold(title)) + border(`${titleTail}┓`),
      ...body.render(innerWidth).map((line) => border("┃") + line + border("┃") + shadow),
      border(`┣${"━".repeat(innerWidth)}┫`) + shadow,
      ...footer.render(innerWidth).map((line) => border("┃") + line + border("┃") + shadow),
      border(`┗${"━".repeat(innerWidth)}┛`) + shadow,
      theme.fg("dim", `  ${"░".repeat(Math.max(0, frameWidth - 1))}`),
    ];
    return lines;
  }

  let cachedWidth: number | undefined;
  let cachedLines: string[] | undefined;
  return {
    render: (width: number) => {
      if (cachedWidth !== width || !cachedLines) {
        cachedWidth = width;
        cachedLines = buildPanel(width);
      }
      return cachedLines;
    },
    invalidate: () => {
      cachedWidth = undefined;
      cachedLines = undefined;
    },
    handleInput: (data: string) => {
      if (matchesKey(data, Key.escape) || data === "q") done();
    },
  };
}

export default function subscriptionUsage(pi: ExtensionAPI) {
  function updateFooter(
    state: { snapshots: Map<ProviderId, UsageSnapshot>; errors: Map<ProviderId, string> },
    ctx: ExtensionContext,
  ): void {
    const { snapshots, errors } = state;
    if (!ctx.hasUI) return;
    const providerId = ctx.model?.provider as ProviderId | undefined;
    if (!providerId || !PROVIDER_IDS.includes(providerId)) {
      ctx.ui.setStatus(STATUS_ID, undefined);
      return;
    }

    const snapshot = snapshots.get(providerId);
    if (!snapshot) {
      const error = errors.get(providerId);
      ctx.ui.setStatus(
        STATUS_ID,
        error ? ctx.ui.theme.fg("warning", "usage unavailable") : undefined,
      );
      return;
    }

    const modelId = ctx.model?.id ?? "";
    const status = formatFooterStatus(snapshot, modelId);
    const closest = selectFooterWindows(snapshot, modelId)[0];
    if (!status) {
      ctx.ui.setStatus(STATUS_ID, undefined);
      return;
    }
    if (!closest) {
      ctx.ui.setStatus(
        STATUS_ID,
        ctx.ui.theme.fg(snapshot.footerStatus?.level ?? "warning", status),
      );
      return;
    }

    const remaining = 100 - closest.usedPercent;
    const color = remaining <= 10 ? "error" : remaining <= 25 ? "warning" : "success";
    ctx.ui.setStatus(STATUS_ID, ctx.ui.theme.fg(color, status));
  }

  const lifecycle = createUsageLifecycle<ExtensionContext>({
    fetchUsage: (providerId, ctx) => fetchProviderUsage(providerId, {
      resolveAccessToken: async (id) => {
        const resolved = await ctx.modelRegistry.getProviderAuth(id);
        return resolved?.auth.apiKey;
      },
      signal: ctx.signal,
    }),
    createHistory: () => createQuotaHistory(),
    updateFooter,
  });

  registerUsageEvents<ExtensionContext>(pi, {
    sessionStart: (event, ctx) => { void lifecycle.sessionStart(event, ctx); },
    modelSelect: (event, ctx) => { void lifecycle.modelSelect(event, ctx); },
    agentSettled: (event, ctx) => { void lifecycle.agentSettled(event, ctx); },
    sessionShutdown: async (event, ctx) => {
      await lifecycle.sessionShutdown(event, ctx);
      if (ctx.hasUI) ctx.ui.setStatus(STATUS_ID, undefined);
    },
    usage: async (args, ctx) => {
      await lifecycle.usage(args, ctx);
      const { snapshots, errors } = lifecycle.state();
      const historyHealth = lifecycle.historyHealth();
      const orderedSnapshots = PROVIDER_IDS.flatMap((providerId) => {
        const snapshot = snapshots.get(providerId);
        return snapshot ? [snapshot] : [];
      });

      if (ctx.mode !== "tui") {
        if (ctx.hasUI) {
          ctx.ui.notify([
            ...formatDashboardLines(orderedSnapshots),
            "",
            historyHealth.enabled ? "History: enabled" : "History: unavailable",
          ].join("\n"), "info");
        }
        return;
      }

      await ctx.ui.custom<void>(
        (_tui, theme, _keybindings, done) =>
          dashboardComponent(theme, orderedSnapshots, errors, historyHealth, () => done(undefined)),
        {
          overlay: true,
          overlayOptions: {
            width: 68,
            minWidth: 42,
            maxHeight: "80%",
            anchor: "center",
            margin: 1,
          },
        },
      );
    },
  });
}
