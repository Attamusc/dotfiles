import { homedir } from "node:os";
import { relative } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
  ReadonlyFooterDataProvider,
  Theme,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
  composeFooterRuntime,
  findJjWorkspace,
  formatCost,
  formatTokenCount,
  JJ_REVSET,
  JJ_TEMPLATE,
  parseGitState,
  parseJjState,
  sanitizeLabel,
  sanitizeStatusLine,
  type VcsState,
} from "./state.ts";

function formatDirectory(cwd: string): string {
  const home = homedir();
  if (cwd === home) return "~";
  return sanitizeLabel(cwd.startsWith(`${home}/`) ? `~/${relative(home, cwd)}` : cwd);
}

function columns(left: string, right: string, width: number): string {
  if (!right) return truncateToWidth(left, width);

  const gap = width - visibleWidth(left) - visibleWidth(right);
  if (gap >= 1) return `${left}${" ".repeat(gap)}${right}`;

  const leftWidth = Math.max(1, Math.floor(width * 0.5));
  const rightWidth = Math.max(1, width - leftWidth - 1);
  return truncateToWidth(
    `${truncateToWidth(left, leftWidth)} ${truncateToWidth(right, rightWidth)}`,
    width,
  );
}

function sessionCost(ctx: ExtensionContext): number {
  let total = 0;

  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type === "message") {
      const message = entry.message;
      if (message.role === "assistant") {
        total += message.usage.cost.total;
      } else if (message.role === "toolResult" && message.usage) {
        total += message.usage.cost.total;
      }
    } else if ((entry.type === "branch_summary" || entry.type === "compaction") && entry.usage) {
      total += entry.usage.cost.total;
    }
  }

  return total;
}

function isSubscription(ctx: ExtensionContext): boolean {
  const model = ctx.model;
  if (!model) return false;
  if (model.provider === "kimi-coding") return true;
  return (
    ctx.modelRegistry.isUsingOAuth(model) &&
    ctx.modelRegistry.getProvider(model.provider)?.auth.oauth?.isSubscription === true
  );
}

function formatContext(theme: Theme, ctx: ExtensionContext): string {
  const usage = ctx.getContextUsage();
  const window = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
  const percent = usage?.percent;
  const value = percent === null || percent === undefined ? "?" : percent.toFixed(1);
  const text = `ctx ${value}${value === "?" ? "" : "%"}/${window ? formatTokenCount(window) : "?"}`;

  if (percent !== null && percent !== undefined && percent > 90) return theme.fg("error", text);
  if (percent !== null && percent !== undefined && percent > 70) return theme.fg("warning", text);
  return theme.fg("muted", text);
}

function formatVcs(theme: Theme, state: VcsState): string {
  if (!state) return "";

  if (state.kind === "git") {
    const status = state.dirty
      ? theme.fg("warning", "dirty")
      : theme.fg("success", "clean");
    return `${theme.fg("dim", "git")} ${sanitizeLabel(state.branch)} · ${status}`;
  }

  const parts: string[] = [];
  if (state.currentBookmarks.length > 0) {
    parts.push(
      `${theme.fg("dim", "jj")} ${sanitizeLabel(state.currentBookmarks.join(","))}`,
      `${theme.fg("dim", "@")} ${theme.fg("accent", sanitizeLabel(state.changeId))}`,
    );
  } else {
    parts.push(`${theme.fg("dim", "jj @")} ${theme.fg("accent", sanitizeLabel(state.changeId))}`);
    if (state.nearestBookmark) {
      const distance = state.ahead && state.ahead > 0 ? `+${state.ahead}` : "";
      parts.push(`${sanitizeLabel(state.nearestBookmark)}${distance}`);
    }
  }

  if (state.conflicts > 0) {
    parts.push(theme.fg("error", `${state.conflicts} conflict${state.conflicts === 1 ? "" : "s"}`));
  }

  if (state.additions === 0 && state.deletions === 0) {
    parts.push(theme.fg("success", "empty"));
  } else {
    parts.push(
      `${theme.fg("success", `+${state.additions}`)}/${theme.fg("error", `-${state.deletions}`)}`,
    );
  }

  return parts.join(" · ");
}

async function loadVcsState(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  signal: AbortSignal,
): Promise<VcsState> {
  if (findJjWorkspace(ctx.cwd)) {
    const result = await pi.exec(
      "jj",
      [
        "log",
        "--no-pager",
        "--color",
        "never",
        "--no-graph",
        "-r",
        JJ_REVSET,
        "-T",
        JJ_TEMPLATE,
      ],
      { cwd: ctx.cwd, signal, timeout: 3_000 },
    );
    return result.code === 0 ? parseJjState(result.stdout) : null;
  }

  const result = await pi.exec(
    "git",
    ["status", "--porcelain=v2", "--branch", "--untracked-files=all"],
    { cwd: ctx.cwd, signal, timeout: 3_000 },
  );
  return result.code === 0 ? parseGitState(result.stdout) : null;
}

export default function statusFooter(pi: ExtensionAPI) {
  let context: ExtensionContext | undefined;
  let vcs: VcsState = null;
  let cost = 0;
  let requestRender: (() => void) | undefined;
  let refreshRequested = false;
  let refreshRunning = false;
  let lifecycle = 0;
  let abortController = new AbortController();

  let streamStartedAt: number | null = null;
  let streamLastDeltaAt: number | null = null;
  let streamCharacters = 0;
  let firstDeltaCharacters = 0;
  let streamDeltaCount = 0;
  let lastTokensPerSecond: number | null = null;

  const resetStream = () => {
    streamStartedAt = null;
    streamLastDeltaAt = null;
    streamCharacters = 0;
    firstDeltaCharacters = 0;
    streamDeltaCount = 0;
  };

  const liveTokensPerSecond = () => {
    if (streamStartedAt === null || streamLastDeltaAt === null || streamDeltaCount < 2) {
      return lastTokensPerSecond;
    }
    const elapsedMs = streamLastDeltaAt - streamStartedAt;
    const characters = streamCharacters - firstDeltaCharacters;
    if (elapsedMs < 50 || characters <= 0) return lastTokensPerSecond;
    return characters / 4 / (elapsedMs / 1_000);
  };

  const requestVcsRefresh = (ctx: ExtensionContext) => {
    context = ctx;
    refreshRequested = true;
    if (refreshRunning) return;

    refreshRunning = true;
    const generation = lifecycle;
    void (async () => {
      while (refreshRequested && context && generation === lifecycle) {
        refreshRequested = false;
        const current: ExtensionContext = context;
        const next = await loadVcsState(pi, current, abortController.signal);
        if (generation !== lifecycle) return;
        vcs = next;
        requestRender?.();
      }
    })()
      .catch((error) => {
        if (!abortController.signal.aborted) {
          console.error(
            `[status-footer] VCS refresh failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      })
      .finally(() => {
        refreshRunning = false;
      });
  };

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;

    lifecycle += 1;
    abortController.abort();
    abortController = new AbortController();
    context = ctx;
    vcs = null;
    cost = sessionCost(ctx);
    resetStream();
    lastTokensPerSecond = null;

    ctx.ui.setFooter((tui, theme, footerData: ReadonlyFooterDataProvider) => {
      requestRender = () => tui.requestRender();

      return {
        invalidate() {},
        render(width: number): string[] {
          const sessionName = sanitizeLabel(pi.getSessionName() ?? "");
          const directory = theme.fg("text", formatDirectory(ctx.cwd));
          const leftTop = sessionName
            ? `${directory} ${theme.fg("dim", "·")} ${theme.fg("muted", sessionName)}`
            : directory;

          const provider = sanitizeLabel(ctx.model?.provider ?? "");
          const model = sanitizeLabel(ctx.model?.id ?? "no-model");
          const thinking = ctx.model?.reasoning
            ? sanitizeLabel(ctx.thinkingLevel ?? pi.getThinkingLevel())
            : "";
          const rightTop = theme.fg(
            "muted",
            [`${provider ? `${provider}/` : ""}${model}`, thinking].filter(Boolean).join(" · "),
          );

          const subscription = isSubscription(ctx);
          const speed = liveTokensPerSecond();
          const runtime = composeFooterRuntime({
            context: formatContext(theme, ctx),
            cost: theme.fg("muted", formatCost(cost, subscription)),
            ...(speed === null
              ? {}
              : { speed: theme.fg("muted", `${Math.round(speed)} tok/s`) }),
            subscription,
            statuses: footerData.getExtensionStatuses(),
          });

          const lines = [
            columns(leftTop, rightTop, width),
            columns(runtime.items.join(theme.fg("dim", " · ")), formatVcs(theme, vcs), width),
          ];

          for (const status of runtime.overflowStatuses) {
            lines.push(truncateToWidth(sanitizeStatusLine(status), width, theme.fg("dim", "...")));
          }

          return lines;
        },
      };
    });

    requestVcsRefresh(ctx);
  });

  pi.on("message_start", (event) => {
    if (event.message.role === "assistant") resetStream();
  });

  pi.on("message_update", (event) => {
    if (event.message.role !== "assistant") return;
    const update = event.assistantMessageEvent;
    if (update.type !== "text_delta" && update.type !== "thinking_delta") return;
    if (!update.delta) return;

    const now = Date.now();
    if (streamStartedAt === null) {
      streamStartedAt = now;
      firstDeltaCharacters = update.delta.length;
    }
    streamLastDeltaAt = now;
    streamCharacters += update.delta.length;
    streamDeltaCount += 1;
  });

  pi.on("message_end", (event) => {
    if (event.message.role !== "assistant") return;

    const elapsedMs =
      streamStartedAt !== null && streamLastDeltaAt !== null
        ? streamLastDeltaAt - streamStartedAt
        : 0;
    const streamedTokens = Math.max(
      0,
      event.message.usage.output - Math.ceil(firstDeltaCharacters / 4),
    );
    if (streamDeltaCount >= 2 && elapsedMs >= 50 && streamedTokens > 0) {
      lastTokensPerSecond = streamedTokens / (elapsedMs / 1_000);
    }
    resetStream();
  });

  pi.on("turn_end", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    cost = sessionCost(ctx);
    requestRender?.();
    requestVcsRefresh(ctx);
  });

  pi.on("session_compact", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    cost = sessionCost(ctx);
    requestRender?.();
  });

  pi.on("session_shutdown", (_event, ctx) => {
    lifecycle += 1;
    refreshRequested = false;
    abortController.abort();
    context = undefined;
    requestRender = undefined;
    if (ctx.mode === "tui") ctx.ui.setFooter(undefined);
  });
}
