import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHerdrAgents, reloadablePiAgents } from "../extensions/reload-all/agents.ts";

test("reload-all selects idle and done Pi panes except the caller", () => {
  const agents = parseHerdrAgents(JSON.stringify({
    id: "cli:agent:list",
    result: {
      agents: [
        { agent: "pi", agent_status: "idle", pane_id: "w1:p1" },
        { agent: "pi", agent_status: "done", pane_id: "w2:p2" },
        { agent: "pi", agent_status: "working", pane_id: "w3:p3" },
        { agent: "claude", agent_status: "idle", pane_id: "w4:p4" },
      ],
    },
  }));

  assert.deepEqual(reloadablePiAgents(agents, "w1:p1"), [
    { paneId: "w2:p2", kind: "pi", status: "done" },
  ]);
});

test("reload-all rejects malformed Herdr responses", () => {
  assert.throws(() => parseHerdrAgents('{"result":{}}'), /unexpected agent list/);
  assert.throws(() => parseHerdrAgents("not json"), SyntaxError);
});
