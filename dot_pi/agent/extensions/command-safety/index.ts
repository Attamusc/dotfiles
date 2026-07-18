import {
  isToolCallEventType,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { inspectDiscoveryCommand } from "./policy.mjs";

export default function commandSafety(pi: ExtensionAPI) {
  pi.on("tool_call", (event) => {
    if (!process.env.PI_SUBAGENT_AGENT || !isToolCallEventType("bash", event)) return;

    const decision = inspectDiscoveryCommand(event.input.command);
    if (decision?.block) return decision;
    if (decision?.timeout && event.input.timeout === undefined) {
      event.input.timeout = decision.timeout;
    }
  });
}
