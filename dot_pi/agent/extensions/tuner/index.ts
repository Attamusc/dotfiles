import { spawnSync } from "node:child_process";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

function launchTuner(ctx: { hasUI: boolean; ui: any; cwd: string }) {
  if (!ctx.hasUI) return;

  const which = spawnSync("which", ["tuner"]);
  if (which.status !== 0) {
    ctx.ui.notify("tuner not found. Install: cargo install tuner", "error");
    return;
  }

  ctx.ui.custom<void>((_tui, _theme, _kb, done) => {
    _tui.stop();
    process.stdout.write("\x1b[2J\x1b[H");

    spawnSync("tuner", [], {
      stdio: "inherit",
      cwd: ctx.cwd,
    });

    _tui.start();
    _tui.requestRender(true);
    done();

    return { render: () => [], invalidate: () => {} };
  });
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("tuner", {
    description: "Launch tuner workspace picker",
    handler: async (_args, ctx) => launchTuner(ctx),
  });

  pi.registerShortcut("ctrl+f", {
    description: "Launch tuner workspace picker",
    handler: async (ctx) => launchTuner(ctx),
  });
}
