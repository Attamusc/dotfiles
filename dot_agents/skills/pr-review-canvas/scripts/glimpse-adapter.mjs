import { homedir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildHtml } from "./review-document.mjs";

export const DEFAULT_GLIMPSE_MODULE = resolve(homedir(), ".pi/agent/git/github.com/HazAT/glimpse/src/glimpse.mjs");

export async function presentWithGlimpse(review, options = {}) {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  if (platform === "linux" && !env.DISPLAY && !env.WAYLAND_DISPLAY) return { status: "unsupported", reason: "headless Linux host: DISPLAY and WAYLAND_DISPLAY are unset" };
  let glimpse = options.module;
  if (!glimpse) try { glimpse = await import(pathToFileURL(options.modulePath ?? DEFAULT_GLIMPSE_MODULE).href); }
  catch (error) { return { status: "unsupported", reason: `Glimpse module unavailable: ${error.message}` }; }
  try {
    const host = glimpse.getNativeHostInfo();
    const window = glimpse.open(buildHtml(review), { width: 1080, height: 820, title: `PR #${review.pr.number} review` });
    return await new Promise(resolveResult => {
      let ready = false, settled = false;
      const finish = result => { if (!settled) { settled = true; clearTimeout(timer); resolveResult(result); } };
      const close = () => { try { window.close(); } catch {} };
      const timer = setTimeout(() => { finish({ status: "unsupported", reason: "Glimpse render-ready timed out" }); close(); }, options.timeoutMs ?? 10_000);
      window.on("message", message => {
        if (message?.type === "render-ready" && !settled) {
          ready = true;
          clearTimeout(timer);
        }
      });
      window.on("error", error => { finish({ status: "unsupported", reason: `Glimpse render error: ${error.message ?? error}` }); close(); });
      window.on("closed", () => finish(ready ? { status: "displayed", platform: host.platform } : { status: "unsupported", reason: "Glimpse window closed before render-ready" }));
    });
  } catch (error) { return { status: "unsupported", reason: `Glimpse host/render unavailable: ${error.message ?? error}` }; }
}
