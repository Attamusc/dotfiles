import assert from "node:assert/strict";
import { test } from "node:test";

import { inspectDestructiveCommand } from "../extensions/command-safety/policy.ts";

const verificationMutations = [
  ["git push --force origin verification-smoke", "forced git push"],
  ["kubectl delete pod verification-smoke", "Kubernetes deletion"],
  ["terraform destroy -auto-approve", "Terraform destroy"],
];

test("verification mutations require per-invocation confirmation in a main session", () => {
  for (const [command, commandClass] of verificationMutations) {
    assert.deepEqual(
      inspectDestructiveCommand(command, { isSubagent: false }),
      {
        confirm: true,
        reason: `${commandClass} requires per-invocation authorization.`,
      },
      command,
    );
  }
});

test("verification mutations remain blocked in subagent contexts", () => {
  for (const [command, commandClass] of verificationMutations) {
    assert.deepEqual(
      inspectDestructiveCommand(command, { isSubagent: true }),
      {
        block: true,
        reason: `${commandClass} requires per-invocation authorization.`,
      },
      command,
    );
  }
});
