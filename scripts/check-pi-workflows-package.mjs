#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { requireExactCandidate, requireExactCandidateIdentity } from "../dot_pi/agent/test/pi-workflows-candidate.mjs";

export function runPackageCheck({ candidate, revision, command = ["npm", "run", "check"], execute = execFileSync }) {
  const { root } = requireExactCandidateIdentity(candidate, revision);
  execute("npm", ["ci"], { cwd: root, stdio: "inherit" });
  requireExactCandidate(root, revision);
  if (command.length === 0) throw new Error("package check command is required");
  const env = { ...process.env, PATH: `${join(root, "node_modules/.bin")}${delimiter}${process.env.PATH ?? ""}` };
  delete env.PI_WORKFLOWS_DEPTH;
  execute(command[0], command.slice(1), { cwd: root, env, stdio: "inherit" });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const separator = process.argv.indexOf("--", 2);
  const options = separator === -1 ? process.argv.slice(2) : process.argv.slice(2, separator);
  const command = separator === -1 ? undefined : process.argv.slice(separator + 1);
  const candidateIndex = options.indexOf("--candidate");
  const revisionIndex = options.indexOf("--revision");
  if (candidateIndex === -1 || revisionIndex === -1) throw new Error("Usage: check-pi-workflows-package.mjs --candidate <worktree> --revision <40-hex> [-- command ...]");
  runPackageCheck({ candidate: options[candidateIndex + 1], revision: options[revisionIndex + 1], command });
}
