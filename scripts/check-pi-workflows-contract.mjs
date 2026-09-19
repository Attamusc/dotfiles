#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { requireExactCandidate } from "../dot_pi/agent/test/pi-workflows-candidate.mjs";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);
const candidate = args.get("--candidate");
const requiredRevision = args.get("--revision");
const compiler = args.get("--compiler");
if (!candidate || !requiredRevision || !compiler) throw new Error("Usage: check-pi-workflows-contract.mjs --candidate <checkout> --revision <40-hex> --compiler <candidate-tsc>");
if (!/^[0-9a-f]{40}$/.test(requiredRevision)) throw new Error("--revision must be a full 40-character Git revision");
const exactCandidate = requireExactCandidate(candidate, requiredRevision);
const actualRevision = requiredRevision;

const api = join(exactCandidate.root, "src/api.ts");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workflows = ["deep-review", "investigate", "iterate-pr", "jungle-book", "mine-workflows", "report-validate", "resume-status", "verify-claims"];
const tsc = resolve(compiler);
const candidateRoot = exactCandidate.root;
if (tsc !== join(candidateRoot, "node_modules/.bin/tsc")) throw new Error("--compiler must be the TypeScript compiler from the explicit candidate checkout");
const dependencyRoot = resolve(dirname(tsc), "..");
const work = mkdtempSync(join(tmpdir(), "pi-workflows-contract-"));
mkdirSync(join(work, "node_modules"), { recursive: true });
symlinkSync(resolve(candidate), join(work, "node_modules/pi-workflows"), "dir");
const workflowPaths = workflows.map(name => join(root, "dot_pi/agent/workflows", `${name}.ts`));
writeFileSync(join(work, "tsconfig.json"), JSON.stringify({
  compilerOptions: {
    strict: true, noEmit: true, target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", skipLibCheck: true, allowImportingTsExtensions: true,
    baseUrl: work, ignoreDeprecations: "6.0",
    paths: {
      "pi-workflows": [api],
      "pi-agent-execution": [join(dependencyRoot, "pi-agent-execution/dist/index.d.ts")],
    },
    typeRoots: [join(dependencyRoot, "@types")],
    types: ["node"],
  },
  files: [api, ...workflowPaths],
}, null, 2));
try {
  execFileSync(tsc, ["--project", join(work, "tsconfig.json")], { cwd: work, stdio: "inherit" });
} catch (error) {
  if (error?.code === "ENOENT") throw new Error(`TypeScript compiler not found at ${tsc}; set PI_WORKFLOWS_TSC to the compiler from the verified candidate export`);
  throw error;
}
console.log(`${workflows.length} workflows typechecked against ${actualRevision}`);
