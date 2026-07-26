import {
  isToolCallEventType,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import {
  inspectDestructiveCommand,
  inspectDiscoveryCommand,
} from "./policy.mjs";

// Policy lives in a sibling module so the test suite can import it without pi's runtime.
// The cost: `/reload` re-evaluates this file but reuses the cached `policy.mjs`, so a change
// to the exports of one without the other surfaces as
// "(0 , _policy.inspectSomething) is not a function". Restart the session rather than
// reloading after editing policy.mjs.

export default function commandSafety(pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return;

    const isSubagent = Boolean(process.env.PI_SUBAGENT_AGENT);
    const destructiveDecision = inspectDestructiveCommand(event.input.command, { isSubagent });
    if (destructiveDecision?.block) return destructiveDecision;
    if (destructiveDecision?.confirm) {
      if (!ctx.ui.isInteractive) {
        return { block: true, reason: destructiveDecision.reason };
      }

      const confirmed = await ctx.ui.confirm(
        "Authorize destructive command?",
        `${destructiveDecision.reason}\n\n${event.input.command}`,
      );
      if (!confirmed) return { block: true, reason: destructiveDecision.reason };
    }

    if (!isSubagent) return;

    const discoveryDecision = inspectDiscoveryCommand(event.input.command);
    if (discoveryDecision?.block) return discoveryDecision;
    if (discoveryDecision?.timeout && event.input.timeout === undefined) {
      event.input.timeout = discoveryDecision.timeout;
    }
  });
}
