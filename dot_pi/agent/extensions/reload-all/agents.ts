export type HerdrAgent = {
  paneId: string;
  kind: string;
  status: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseHerdrAgents(output: string): HerdrAgent[] {
  const payload: unknown = JSON.parse(output);
  if (!isRecord(payload) || !isRecord(payload.result) || !Array.isArray(payload.result.agents)) {
    throw new Error("Herdr returned an unexpected agent list");
  }

  return payload.result.agents.flatMap((value): HerdrAgent[] => {
    if (
      !isRecord(value) ||
      typeof value.pane_id !== "string" ||
      typeof value.agent !== "string" ||
      typeof value.agent_status !== "string"
    ) {
      return [];
    }

    return [{ paneId: value.pane_id, kind: value.agent, status: value.agent_status }];
  });
}

export function reloadablePiAgents(agents: HerdrAgent[], currentPaneId: string): HerdrAgent[] {
  return agents.filter(
    (agent) =>
      agent.kind === "pi" &&
      agent.paneId !== currentPaneId &&
      (agent.status === "idle" || agent.status === "done"),
  );
}
