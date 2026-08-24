// A real SDK extension resource that must be released before its host exits.
export default function lifecycleFixture(pi) {
  let interval;
  pi.on("session_start", () => { interval = setInterval(() => {}, 50); });
  pi.on("session_shutdown", () => { clearInterval(interval); });
  pi.registerTool({
    name: "subagent",
    label: "Unused lifecycle fixture",
    description: "Never executed by the no-model lifecycle check",
    parameters: { type: "object", properties: {} },
    execute: async () => { throw new Error("lifecycle check must not invoke tools"); },
  });
}
