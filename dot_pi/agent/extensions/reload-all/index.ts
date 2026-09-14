import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  parseHerdrAgents,
  reloadablePiAgents,
  type HerdrAgent,
} from "./agents.ts";

async function reloadCurrent(ctx: ExtensionCommandContext, message: string) {
  ctx.ui.notify(message, "info");
  await ctx.reload();
}

export default function reloadAll(pi: ExtensionAPI) {
  pi.registerCommand("reload-all", {
    description: "Reload this Pi session and every other idle Pi session in Herdr",
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();

      if (process.env.HERDR_ENV !== "1") {
        await reloadCurrent(ctx, "Not running in Herdr; reloading this Pi session only.");
        return;
      }

      const currentPaneId = process.env.HERDR_PANE_ID;
      if (!currentPaneId) {
        await reloadCurrent(ctx, "Herdr pane identity is unavailable; reloading this Pi session only.");
        return;
      }

      const listed = await pi.exec("herdr", ["agent", "list"], { timeout: 5_000 });
      if (listed.code !== 0) {
        await reloadCurrent(ctx, "Could not list Herdr agents; reloading this Pi session only.");
        return;
      }

      let agents: HerdrAgent[];
      try {
        agents = parseHerdrAgents(listed.stdout);
      } catch (error) {
        await reloadCurrent(
          ctx,
          `${error instanceof Error ? error.message : String(error)}; reloading this Pi session only.`,
        );
        return;
      }

      const targets = reloadablePiAgents(agents, currentPaneId);
      const results = await Promise.all(
        targets.map(async (agent) => {
          const result = await pi.exec(
            "herdr",
            ["agent", "prompt", agent.paneId, "/reload"],
            { timeout: 5_000 },
          );
          return { agent, ok: result.code === 0 };
        }),
      );

      const reloaded = results.filter((result) => result.ok).length;
      const failed = results.length - reloaded;
      const skipped = agents.filter(
        (agent) =>
          agent.kind === "pi" &&
          agent.paneId !== currentPaneId &&
          agent.status !== "idle" &&
          agent.status !== "done",
      );
      const skippedSummary = Object.entries(
        skipped.reduce<Record<string, number>>((counts, agent) => {
          counts[agent.status] = (counts[agent.status] ?? 0) + 1;
          return counts;
        }, {}),
      )
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([status, count]) => `${count} ${status}`)
        .join(", ");

      const details = [
        `${reloaded} other session${reloaded === 1 ? "" : "s"}`,
        skippedSummary ? `skipped ${skippedSummary}` : "",
        failed ? `${failed} failed` : "",
      ].filter(Boolean);
      await reloadCurrent(ctx, `Reload requested for ${details.join("; ")}; reloading this session.`);
    },
  });
}
