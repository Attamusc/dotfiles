import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, cp, lstat, mkdtemp, mkdir, readFile, readdir, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import test from "node:test";
import { requireExactCandidate } from "./pi-workflows-candidate.mjs";
import { runPackageCheck } from "../../../scripts/check-pi-workflows-package.mjs";

const root = resolve(import.meta.dirname, "../../..");
const workflowsDir = join(root, "dot_pi/agent/workflows");
const candidate = process.env.PI_WORKFLOWS_CANDIDATE;
const revision = "1614faf29c6ad1d0fcc9fe6db86a770f34e2b129";
const names = ["deep-review", "investigate", "iterate-pr", "jungle-book", "mine-workflows", "report-validate", "resume-status", "verify-claims"];
const readOnly = ["deep-review", "investigate", "jungle-book", "mine-workflows", "report-validate", "resume-status", "verify-claims"];
if (candidate) requireExactCandidate(candidate, revision);
const managedPackage = `git:github.com/Attamusc/pi-workflows@${revision}`;

async function source(name) { return readFile(join(workflowsDir, `${name}.ts`), "utf8"); }
function metadata(text, directive) { return text.match(new RegExp(`^// @${directive}: (.+)$`, "m"))?.[1]; }

function result(output = "ok", ok = true) {
  return { agent: "scout", output, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 1 }, durationMs: 1, ok, errorMessage: ok ? undefined : output };
}

async function loadWorkflow(name) {
  const sandbox = await mkdtemp(join(tmpdir(), "phase5-workflow-"));
  await mkdir(join(sandbox, "node_modules"), { recursive: true });
  await symlink(candidate, join(sandbox, "node_modules/pi-workflows"));
  const destination = join(sandbox, `${name}.ts`);
  await cp(join(workflowsDir, `${name}.ts`), destination);
  return (await import(`${new URL(`file://${destination}`).href}?${Date.now()}`)).default;
}

async function treeDigest(rootPath) {
  const entries = [];
  async function visit(directory) {
    for (const name of (await readdir(directory)).sort()) {
      const path = join(directory, name);
      const stat = await lstat(path);
      if (stat.isDirectory()) await visit(path);
      else if (stat.isSymbolicLink()) entries.push([relative(rootPath, path), "link", await readlink(path)]);
      else entries.push([relative(rootPath, path), "file", createHash("sha256").update(await readFile(path)).digest("hex")]);
    }
  }
  await visit(rootPath);
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}

function context(cwd, args, handler = async () => result(), options = {}) {
  const calls = [];
  const reports = [];
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 };
  let launched = 0;
  let budgetError;
  const isolationPaths = new Set(options.isolationPath ? [options.isolationPath] : []);
  const beforeLaunch = count => {
    if (options.maxLaunches !== undefined && launched + count > options.maxLaunches) throw budgetError;
    launched += count;
  };
  const invoke = async (spec, index) => {
    const value = await handler(spec, index);
    if (value?.isolation?.path) isolationPaths.add(value.isolation.path);
    if (value?.usage) for (const key of Object.keys(usage)) usage[key] += value.usage[key] ?? 0;
    return value;
  };
  const wf = {
    args, cwd, runId: "test", calls, reports,
    budget(limit) {
      calls.push({ kind: "budget", limit });
      if (options.BudgetExceededError) budgetError = new options.BudgetExceededError("Synthetic workflow budget exhausted");
    },
    log() {}, checkpoint(name, data) { calls.push({ kind: "checkpoint", name, data }); }, usage() { return { ...usage }; },
    report(value) { reports.push(value); return value; },
    async spawn(spec) { beforeLaunch(1); calls.push({ kind: "spawn", spec }); return invoke(spec, launched - 1); },
    async parallel(specs, opts) { beforeLaunch(specs.length); calls.push({ kind: "parallel", specs, opts }); return Promise.all(specs.map((spec, index) => invoke(spec, index))); },
    async map(items, fn, opts) { const specs = items.map(fn); beforeLaunch(specs.length); calls.push({ kind: "map", specs, opts }); return Promise.all(specs.map((spec, index) => invoke(spec, index))); },
    async ask(question, opts) { calls.push({ kind: "ask", question, opts }); return options.onAsk ? options.onAsk(question, opts) : options.answer ?? "DENY"; },
    async integrate(results, opts) { calls.push({ kind: "integrate", results, opts }); return options.onIntegrate ? options.onIntegrate(results, opts) : options.integration ?? { vcs: "git", changeId: "integrated", conflicted: false, integrated: results.length, message: opts.message }; },
    async cleanupIsolation() {
      calls.push({ kind: "cleanupIsolation" });
      await Promise.all([...isolationPaths].map(path => rm(path, { recursive: true, force: true })));
      isolationPaths.clear();
    },
  };
  return wf;
}

test("exact candidate gate rejects self-attestation and dirty source trees", async () => {
  const forged = await mkdtemp(join(tmpdir(), "phase5-forged-candidate-"));
  await mkdir(join(forged, "node_modules/.bin"), { recursive: true });
  await writeFile(join(forged, "node_modules/.bin/tsc"), "#!/bin/sh\nexit 0\n");
  await chmod(join(forged, "node_modules/.bin/tsc"), 0o755);
  await writeFile(join(forged, ".pi-workflows-archive-revision"), revision);
  assert.throws(() => requireExactCandidate(forged, revision), /real detached Git worktree|marker-only/);

  const repo = await mkdtemp(join(tmpdir(), "phase5-candidate-gate-"));
  await mkdir(join(repo, "src"), { recursive: true });
  await mkdir(join(repo, "node_modules/.bin"), { recursive: true });
  await writeFile(join(repo, ".gitignore"), "node_modules/\n");
  await writeFile(join(repo, "src/api.ts"), "export const api = true;\n");
  await writeFile(join(repo, "node_modules/.bin/tsc"), "#!/bin/sh\nexit 0\n");
  await chmod(join(repo, "node_modules/.bin/tsc"), 0o755);
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["config", "user.email", "fixture@example.invalid"], { cwd: repo });
  execFileSync("git", ["config", "user.name", "Fixture"], { cwd: repo });
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync("git", ["commit", "-qm", "candidate"], { cwd: repo });
  const exact = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  execFileSync("git", ["checkout", "-q", "--detach", exact], { cwd: repo });
  assert.equal(requireExactCandidate(repo, exact).root, repo);

  await writeFile(join(repo, "src/api.ts"), "export const api = false;\n");
  assert.throws(() => requireExactCandidate(repo, exact), /modified tracked or untracked/);
  execFileSync("git", ["restore", "src/api.ts"], { cwd: repo });
  await writeFile(join(repo, "unexpected.ts"), "export {};\n");
  assert.throws(() => requireExactCandidate(repo, exact), /modified tracked or untracked/);
});

test("guarded package check rejects an external-only compiler before check execution", async () => {
  const repo = await mkdtemp(join(tmpdir(), "phase5-package-runner-"));
  const outside = await mkdtemp(join(tmpdir(), "phase5-external-compiler-"));
  await mkdir(join(repo, "node_modules/.bin"), { recursive: true });
  await writeFile(join(repo, ".gitignore"), "node_modules/\n");
  await writeFile(join(repo, "package.json"), "{}\n");
  await writeFile(join(repo, "package-lock.json"), JSON.stringify({ name: "fixture", lockfileVersion: 3, requires: true, packages: { "": {} } }));
  await writeFile(join(outside, "tsc"), "#!/bin/sh\nexit 0\n");
  await chmod(join(outside, "tsc"), 0o755);
  await symlink(join(outside, "tsc"), join(repo, "node_modules/.bin/tsc"));
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["config", "user.email", "fixture@example.invalid"], { cwd: repo });
  execFileSync("git", ["config", "user.name", "Fixture"], { cwd: repo });
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync("git", ["commit", "-qm", "candidate"], { cwd: repo });
  const exact = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  execFileSync("git", ["checkout", "-q", "--detach", exact], { cwd: repo });
  const calls = [];
  assert.throws(() => runPackageCheck({ candidate: repo, revision: exact, command: ["check-marker"], execute(command, args) { calls.push([command, args]); } }), /candidate-owned TypeScript compiler/);
  assert.deepEqual(calls, [["npm", ["ci"]]], "check command must not execute after external compiler rejection");
});

test("guarded package check clears inherited workflow depth", async () => {
  const repo = await mkdtemp(join(tmpdir(), "phase5-package-env-"));
  await mkdir(join(repo, "node_modules/.bin"), { recursive: true });
  await writeFile(join(repo, ".gitignore"), "node_modules/\n");
  await writeFile(join(repo, "package.json"), "{}\n");
  await writeFile(join(repo, "package-lock.json"), JSON.stringify({ name: "fixture", lockfileVersion: 3, requires: true, packages: { "": {} } }));
  await writeFile(join(repo, "node_modules/.bin/tsc"), "#!/bin/sh\nexit 0\n");
  await chmod(join(repo, "node_modules/.bin/tsc"), 0o755);
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["config", "user.email", "fixture@example.invalid"], { cwd: repo });
  execFileSync("git", ["config", "user.name", "Fixture"], { cwd: repo });
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync("git", ["commit", "-qm", "candidate"], { cwd: repo });
  const exact = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  execFileSync("git", ["checkout", "-q", "--detach", exact], { cwd: repo });

  const previousDepth = process.env.PI_WORKFLOWS_DEPTH;
  process.env.PI_WORKFLOWS_DEPTH = "1";
  let checkEnv;
  try {
    runPackageCheck({
      candidate: repo,
      revision: exact,
      command: ["check-marker"],
      execute(command, _args, options) {
        if (command === "check-marker") checkEnv = options.env;
      },
    });
  } finally {
    if (previousDepth === undefined) delete process.env.PI_WORKFLOWS_DEPTH;
    else process.env.PI_WORKFLOWS_DEPTH = previousDepth;
  }
  assert.ok(checkEnv);
  assert.equal(Object.hasOwn(checkEnv, "PI_WORKFLOWS_DEPTH"), false);
  assert.ok(checkEnv.PATH.startsWith(join(repo, "node_modules/.bin")));
});

test("managed package wiring preserves the staged activation boundary", async () => {
  const promptNames = new Set((await readdir(join(root, "dot_pi/agent/prompts")))
    .filter(file => file.endsWith(".md"))
    .map(file => file.slice(0, -3)));
  assert.deepEqual(names.filter(name => promptNames.has(name)), [], "saved workflows and prompt templates must not register the same command");

  const settings = JSON.parse(await readFile(join(root, ".data/pi/agent/settings.json"), "utf8"));
  assert.equal(settings.packages.filter(entry => entry === managedPackage).length, 1);
  assert.doesNotMatch(settings.packages.join("\n"), new RegExp(`(?:^|[/@])(?:\\.\\./|~/|file:|link:).*pi-workflows|pi-${"herdr"}|pi-${"cm" + "ux"}`, "i"));

  const setup = await readFile(join(root, ".chezmoiscripts/run_onchange_after_30-setup-pi.sh.tmpl"), "utf8");
  assert.match(setup, /Public Pi settings SHA-256:/);
  assert.match(setup, /Private Pi settings SHA-256:/);
  assert.match(setup, /pi update --extensions[\s\S]*herdr integration install pi/);
  assert.doesNotMatch(setup, new RegExp(`\\|\\|\\s*(?::|true|echo)|tmux|pi-${"herdr"}|pi-${"cm" + "ux"}|herdr\\s+(?:serve|server|daemon|start-server)|sendStatus`));

  const docs = await readFile(join(root, "docs/pi-workflows.md"), "utf8");
  for (const statement of [managedPackage, "trusted in-process", "Dynamic source alone", "Node 24", "report-validate", "resume-status", "audit and reconstruction", "fresh terminal"]) {
    assert.match(docs, new RegExp(statement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
  assert.doesNotMatch(docs, /saved workflows? (?:is|are) sandboxed|resume execution/i);
});

if (!candidate) {
  test("exact API contract (requires explicit disposable candidate and compiler)", { skip: "set PI_WORKFLOWS_CANDIDATE; absence is recorded, never treated as compatibility" }, () => {});
} else {
  test("all eight workflows typecheck against the explicit exact-revision candidate", () => {
    const compiler = join(candidate, "node_modules/.bin/tsc");
    const output = execFileSync("node", [join(root, "scripts/check-pi-workflows-contract.mjs"), "--candidate", candidate, "--revision", revision, "--compiler", compiler], { cwd: root, encoding: "utf8" });
    assert.match(output, /8 workflows typechecked/);
  });

  test("metadata permits automatic invocation only for bounded status/report workflows", async () => {
    const policies = Object.fromEntries(await Promise.all(names.map(async name => [name, metadata(await source(name), "model-invocation")])));
    assert.deepEqual(Object.entries(policies).filter(([, policy]) => policy === "automatic").map(([name]) => name), ["report-validate"]);
    for (const name of names.filter(name => name !== "report-validate")) assert.equal(policies[name], "explicit");
  });

  test("read-only workflows encode bounds, read-only tools, and no delegated correctness dependency", async () => {
    const combined = (await Promise.all(readOnly.map(source))).join("\n");
    assert.doesNotMatch(combined, /Load the .* skill/i);
    assert.doesNotMatch(combined, /askAgent|\.integrate\(|cleanupIsolation|isolate:\s*true/);
    for (const name of readOnly) {
      const text = await source(name);
      for (const tools of text.matchAll(/tools:\s*\[([^\]]*)\]/g)) {
        const actual = tools[1].replace(/[\s"']/g, "");
        assert.ok(actual === "read" || (name === "report-validate" && actual === ""), `${name} must spawn with read-only or no tools`);
      }
    }
    assert.match(await source("deep-review"), /MAX_CHANGED_FILES\s*=\s*12/);
    assert.match(await source("investigate"), /MAX_MANIFEST_FILES\s*=\s*160/);
    assert.match(await source("jungle-book"), /MAX_MANIFEST_FILES\s*=\s*160/);
    assert.match(await source("mine-workflows"), /MAX_SESSIONS\s*=\s*6[\s\S]*MAX_SESSION_CANDIDATES\s*=\s*48[\s\S]*128 \* 1024/);
    assert.match(await source("verify-claims"), /MAX_CLAIMS\s*=\s*8[\s\S]*MAX_MANIFEST_FILES\s*=\s*160/);
  });

  test("workflows do not claim lifecycle, status, or cross-restart execution ownership", async () => {
    const combined = (await Promise.all(names.map(source))).join("\n");
    assert.doesNotMatch(combined, /tmux|start Herdr|sendStatus|agent_(?:start|end)|session_(?:start|shutdown)|resume execution|continue after restart/i);
    assert.match(await source("resume-status"), /status only/i);
    assert.match(await source("resume-status"), /Do not resume work/i);
  });

  test("retained workflows never opt into package isolation, integration, or task outcomes", async () => {
    const combined = (await Promise.all(names.map(source))).join("\n");
    const iterate = await source("iterate-pr");
    assert.doesNotMatch(combined, /isolate:\s*true|\.integrate\(|cleanupIsolation|taskOutcome:\s*["'](?:observe|required)["']|taskOutcomeObservation/);
    assert.match(iterate, /await wf\.ask\(/);
  });

  test("report-validate supplies only bounded contained artifacts to a tool-free agent", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "phase5-report-"));
    execFileSync("git", ["init", "-q", fixture]);
    await writeFile(join(fixture, "artifact.txt"), "bounded evidence\n");
    await writeFile(join(fixture, "report.md"), "[artifact](artifact.txt)\n");
    const run = await loadWorkflow("report-validate");
    const wf = context(fixture, "report.md", async spec => {
      assert.deepEqual(spec.tools, []);
      assert.match(spec.task, /bounded evidence/);
      return result("VALID");
    });
    const report = await run(wf);
    assert.equal(report.artifactCount, 1);
  });

  test("automatic report validation never executes configured fsmonitor or filter programs", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "phase5-report-hostile-"));
    execFileSync("git", ["init", "-q", fixture]);
    const fsmonitorMarker = join(fixture, "fsmonitor-ran");
    const filterMarker = join(fixture, "filter-ran");
    const fsmonitor = join(fixture, "fsmonitor.sh");
    const filter = join(fixture, "filter.sh");
    await writeFile(fsmonitor, `#!/bin/sh\ntouch ${JSON.stringify(fsmonitorMarker)}\n` , { mode: 0o755 });
    await writeFile(filter, `#!/bin/sh\ntouch ${JSON.stringify(filterMarker)}\ncat\n`, { mode: 0o755 });
    execFileSync("git", ["config", "core.fsmonitor", fsmonitor], { cwd: fixture });
    execFileSync("git", ["config", "filter.hostile.clean", filter], { cwd: fixture });
    await writeFile(join(fixture, ".gitattributes"), "*.txt filter=hostile\n");
    await writeFile(join(fixture, "artifact.txt"), "bounded evidence\n");
    await writeFile(join(fixture, "report.md"), "[artifact](artifact.txt)\n");
    const run = await loadWorkflow("report-validate");
    const report = await run(context(fixture, "report.md", async spec => {
      assert.match(spec.task, /status snapshot: unavailable/i);
      return result("VALID");
    }));
    assert.equal(report.artifactCount, 1);
    assert.equal(await lstat(fsmonitorMarker).then(() => true, () => false), false);
    assert.equal(await lstat(filterMarker).then(() => true, () => false), false);
  });

  test("report-validate rejects artifact symlink escape before spawning", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "phase5-report-escape-"));
    execFileSync("git", ["init", "-q", fixture]);
    const outside = join(fixture, "..", `${basename(fixture)}-secret.txt`);
    await writeFile(outside, "secret\n");
    await symlink(outside, join(fixture, "escape.txt"));
    await writeFile(join(fixture, "report.md"), "[artifact](escape.txt)\n");
    const run = await loadWorkflow("report-validate");
    const wf = context(fixture, "report.md");
    const report = await run(wf);
    assert.match(report.error, /outside repository/);
    assert.equal(wf.calls.some(call => call.kind === "spawn"), false);
  });

  test("verify-claims rejects traversal and symlink escape without spawning or mutation", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "phase5-verify-"));
    const outside = join(fixture, "..", `${basename(fixture)}-outside.md`);
    await writeFile(outside, "outside");
    await symlink(outside, join(fixture, "escape.md"));
    const before = await readFile(outside, "utf8");
    const run = await loadWorkflow("verify-claims");
    for (const arg of ["../outside.md", "escape.md"]) {
      const wf = context(fixture, arg);
      const report = await run(wf);
      assert.match(report.error, /outside|does not exist/);
      assert.equal(wf.calls.some(call => call.kind !== "budget"), false);
    }
    assert.equal(await readFile(outside, "utf8"), before);
  });

  test("investigate preserves partial results after a failed recon and failed verifier", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "phase5-investigate-"));
    await writeFile(join(fixture, "a.ts"), "export const a = 1;\n");
    const run = await loadWorkflow("investigate");
    let phase = 0;
    const wf = context(fixture, "timeouts", async spec => {
      phase++;
      if (phase === 2 || spec.label === "verify + triage") return result("synthetic failure", false);
      return result("bounded evidence");
    });
    const report = await run(wf);
    assert.equal(report.partial, true);
    assert.equal(report.deliverable, "bounded evidence");
    assert.match(report.reason, /Verification failed/);
    assert.deepEqual(wf.calls.find(call => call.kind === "budget").limit, { cost: 5 });
  });

  test("a real BudgetExceededError yields a partial report and starts no orphan phase", async () => {
    const { BudgetExceededError } = await import(`${new URL(`file://${join(candidate, "src/api.ts")}`).href}?budget`);
    const fixture = await mkdtemp(join(tmpdir(), "phase5-budget-"));
    execFileSync("git", ["init", "-q"], { cwd: fixture });
    await writeFile(join(fixture, "a.ts"), "export const repeated = true;\n");
    const run = await loadWorkflow("investigate");
    const wf = context(fixture, "budget boundary", async () => result("recon evidence"), { BudgetExceededError, maxLaunches: 4 });
    const report = await run(wf);
    assert.equal(report.partial, true);
    assert.match(report.reason, /Budget exhausted after reconnaissance/);
    assert.equal(wf.calls.filter(call => call.kind === "parallel").length, 1);
    assert.equal(wf.calls.some(call => call.kind === "spawn"), false, "synthesis must not become an orphan phase");
    assert.equal(report.usageTotal.turns, 4);
  });

  test("all seven read-only workflows execute against a bounded untrusted fixture without mutation", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "phase5-readonly-"));
    execFileSync("git", ["init", "-q"], { cwd: fixture });
    execFileSync("git", ["config", "user.email", "fixture@example.invalid"], { cwd: fixture });
    execFileSync("git", ["config", "user.name", "Fixture"], { cwd: fixture });
    for (let index = 0; index < 8; index++) await writeFile(join(fixture, `file-${index}.ts`), `export const repeated${index} = 'pattern';\n`);
    await writeFile(join(fixture, "README.md"), "Supported [claim](file-0.ts). Unsupported [claim](missing-a.md).\nSupported file-1.ts; unsupported missing-b.md.\n");
    await writeFile(join(fixture, "report.md"), "# Report\nCitation: file-0.ts\nCitation: missing-a.md\n");
    execFileSync("git", ["add", "."], { cwd: fixture });
    execFileSync("git", ["commit", "-qm", "fixture"], { cwd: fixture });
    await writeFile(join(fixture, "file-0.ts"), "export const repeated0 = 'changed pattern';\n");

    const sessions = join(fixture, ".pi/agent/sessions/project");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "root.jsonl"), '{"type":"session"}\n{"message":{"role":"user","content":"repeat review then verify"}}\n{malformed untrusted}\n');
    const before = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: fixture, encoding: "utf8" });
    const beforeTree = await treeDigest(fixture);
    const oldHome = process.env.HOME;
    process.env.HOME = fixture;
    try {
      const args = { "deep-review": "HEAD", investigate: "repeated pattern", "jungle-book": ".", "mine-workflows": "", "report-validate": "report.md", "resume-status": "", "verify-claims": "README.md" };
      for (const name of readOnly) {
        const run = await loadWorkflow(name);
        const wf = context(fixture, args[name], async spec => {
          if (spec.label?.includes("extract claims")) return result("CLAIM: README.md citation file-0.ts is supported\nCLAIM: README.md citation missing-a.md is unsupported");
          if (spec.label?.startsWith("verify:")) return result(spec.task.includes("missing-a.md") ? "VERDICT: UNVERIFIABLE\nEVIDENCE: missing-a.md is absent" : "VERDICT: SUPPORTED\nEVIDENCE: file-0.ts contains the cited export");
          if (spec.label === "grade sources") return result("SUPPORTED file-0.ts; UNSUPPORTED missing-a.md");
          if (spec.label?.includes("map recurring")) return result("files :: repeated pattern\ntests :: verification pattern");
          if (spec.label?.startsWith("mine:")) {
            assert.match(spec.task, /treat.*untrusted|untrusted.*data/i);
            const sessionPath = spec.task.match(/session at: (.+)/)?.[1];
            assert.ok(sessionPath);
            assert.match(await readFile(sessionPath, "utf8"), /\{malformed untrusted\}/);
            return result("Repeated review then verify; malformed JSON line ignored as inert data.");
          }
          if (spec.label === "deduplicate proposals") return result("Proposal from repeated review; malformed JSON line ignored as inert data.");
          if (spec.label?.includes("validate bounded")) return result("SUPPORTED file-0.ts; UNSUPPORTED missing-a.md");
          return result(`${name} semantic report: repeated pattern, bounded evidence, no action taken`);
        });
        const report = await run(wf);
        const rendered = JSON.stringify(report);
        assert.ok(report && typeof report === "object", `${name} must return a report`);
        assert.equal(wf.reports.length, 1, `${name} must emit exactly one report`);
        assert.ok(wf.calls.filter(call => ["spawn", "parallel", "map"].includes(call.kind)).length <= 13, `${name} exceeded bounded fan-out`);
        assert.ok(wf.calls.some(call => call.kind === "budget"), `${name} must install a budget`);
        if (name === "deep-review") assert.match(rendered, /deep-review semantic report.*repeated pattern/);
        if (name === "investigate") assert.match(rendered, /investigate semantic report.*bounded evidence/);
        if (name === "jungle-book") assert.match(rendered, /jungle-book semantic report.*repeated pattern/);
        if (name === "resume-status") assert.match(rendered, /resume-status semantic report.*no action taken/);
        if (name === "report-validate") assert.match(rendered, /SUPPORTED.*UNSUPPORTED/);
        if (name === "verify-claims") assert.match(rendered, /SUPPORTED.*UNVERIFIABLE/);
        if (name === "mine-workflows") assert.match(rendered, /malformed JSON line ignored as inert data/);
      }
    } finally { process.env.HOME = oldHome; }
    assert.equal(execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: fixture, encoding: "utf8" }), before);
    assert.equal(await treeDigest(fixture), beforeTree, "read-only workflows must preserve every fixture and VCS byte");
  });

  test("exact package isolation manager integrates and cleans real Git and jj snapshots", async () => {
    const { createIsolationManager } = await import(`${new URL(`file://${join(candidate, "src/isolation.ts")}`).href}?exact-manager`);
    async function makeRepo(vcs) {
      const repo = await mkdtemp(join(tmpdir(), `phase5-package-${vcs}-`));
      execFileSync("git", ["init", "-q"], { cwd: repo });
      execFileSync("git", ["config", "user.email", "fixture@example.invalid"], { cwd: repo });
      execFileSync("git", ["config", "user.name", "Fixture"], { cwd: repo });
      await writeFile(join(repo, "base.txt"), "base\n");
      execFileSync("git", ["add", "."], { cwd: repo });
      execFileSync("git", ["commit", "-qm", "base"], { cwd: repo });
      if (vcs === "jj") {
        execFileSync("jj", ["git", "init", "--colocate"], { cwd: repo });
        execFileSync("jj", ["new", "-m", "clean invoking state"], { cwd: repo });
      }
      return repo;
    }
    for (const vcs of ["git", "jj"]) {
      const repo = await makeRepo(vcs);
      const manager = createIsolationManager({ cwd: repo, runId: `matrix-${vcs}` });
      const handle = await manager.acquire(1);
      await writeFile(join(handle.path, "portable.txt"), `${vcs} captured\n`);
      await manager.capture(handle);
      assert.ok(handle.changeId && handle.changeId !== "@", `${vcs} capture must produce an immutable package identity`);
      await writeFile(join(handle.path, "portable.txt"), "unsnapshotted drift\n");
      const integrated = await manager.integrate([handle], { message: `integrate ${vcs}` });
      assert.equal(integrated.conflicted, false);
      assert.equal(await readFile(join(repo, "portable.txt"), "utf8"), `${vcs} captured\n`, `${vcs} integration must use captured bytes, not worktree drift`);
      await manager.cleanupAll();
      await assert.rejects(lstat(handle.baseDir), { code: "ENOENT" });

      const conflictRepo = await makeRepo(vcs);
      const conflicts = createIsolationManager({ cwd: conflictRepo, runId: `conflict-${vcs}` });
      const left = await conflicts.acquire(1);
      const right = await conflicts.acquire(2);
      await writeFile(join(left.path, "base.txt"), "left\n");
      await writeFile(join(right.path, "base.txt"), "right\n");
      await conflicts.capture(left);
      await conflicts.capture(right);
      assert.ok(left.changeId && right.changeId && left.changeId !== right.changeId);
      const conflicted = await conflicts.integrate([left, right], { message: `conflict ${vcs}` });
      assert.equal(conflicted.conflicted, true, `${vcs} package integration must report the real conflict`);
      await conflicts.cleanupAll();
      await assert.rejects(lstat(left.baseDir), { code: "ENOENT" });
      await assert.rejects(lstat(right.baseDir), { code: "ENOENT" });
    }
  });

  test("Node 25 executes dynamic read-only success and denial externally with no fallback", async () => {
    const directory = await mkdtemp(join(tmpdir(), "phase5-node25-"));
    const script = join(directory, "dynamic.test.mjs");
    const sandboxUrl = new URL(`file://${join(candidate, "src/sandbox.ts")}`).href;
    await writeFile(script, `
      import assert from "node:assert/strict";
      import { runDynamicWorkflow } from ${JSON.stringify(sandboxUrl)};
      const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 };
      function bridge() {
        let forbidden = 0;
        return { forbidden: () => forbidden, value: {
          spawn: async () => { forbidden++; throw new Error("spawn forbidden"); }, parallel: async () => { forbidden++; throw new Error("parallel forbidden"); },
          ask: async () => { forbidden++; throw new Error("ask forbidden"); }, report: value => value, log() {}, checkpoint() {}, usage: () => usage, budget() {},
          integrate: async () => { forbidden++; throw new Error("integrate forbidden"); }, cleanupIsolation: async () => {},
          call: async () => { forbidden++; throw new Error("capability fallback forbidden"); }, interactive: async () => { forbidden++; throw new Error("interactive forbidden"); }
        }};
      }
      async function run(source, name) { const b = bridge(); const value = await runDynamicWorkflow({ nodePath: process.execPath, source, args: "fixture", cwd: ${JSON.stringify(directory)}, runId: name, signal: new AbortController().signal, bridge: b.value, timeoutMs: 8000 }); return { value, forbidden: b.forbidden() }; }
      { const { value, forbidden } = await run('return wf.report({ ok: true, args: wf.args })', "success"); assert.equal(value.ok, true); assert.deepEqual(value.result, { ok: true, args: "fixture" }); assert.equal(forbidden, 0); }
      { const { value, forbidden } = await run('const fs = process.getBuiltinModule("fs"); try { fs.readFileSync("/etc/hosts", "utf8"); return { denied: false }; } catch (error) { return { denied: error.code === "ERR_ACCESS_DENIED", code: error.code }; }', "denial"); assert.equal(value.ok, true); assert.deepEqual(value.result, { denied: true, code: "ERR_ACCESS_DENIED" }); assert.equal(forbidden, 0); }
      console.log("dynamic cases 2; pass 2; skipped 0");
    `);
    try {
      const childEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("NODE_TEST")));
      const output = execFileSync("mise", ["x", "node@25", "--", "node", script], { encoding: "utf8", timeout: 30_000, env: childEnv });
      assert.match(output, /dynamic cases 2/);
      assert.match(output, /pass 2/);
      assert.match(output, /skipped 0/);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test("iterate-pr asks before effects and has finite green, blocked, and failure outcomes", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "phase5-pr-"));
    execFileSync("git", ["init", "-q"], { cwd: fixture });
    execFileSync("git", ["remote", "add", "origin", "https://github.com/example/repo.git"], { cwd: fixture });
    const run = await loadWorkflow("iterate-pr");
    const denied = context(fixture, "42");
    assert.equal((await run(denied)).reason, "approval denied");
    assert.deepEqual(denied.calls.map(call => call.kind), ["ask"]);
    for (const [output, reason] of [["ITERATE_STATUS: GREEN", "CI green"], ["ITERATE_STATUS: BLOCKED", "BLOCKED"]]) {
      const wf = context(fixture, "42", async () => result(output), { answer: "APPROVE" });
      assert.equal((await run(wf)).reason, reason);
      assert.equal(wf.calls.filter(call => call.kind === "spawn").length, 1);
    }
    const failed = context(fixture, "42", async () => result("fake gh boundary failed", false), { answer: "APPROVE" });
    assert.equal((await run(failed)).reason, "agent pass failed");
  });
}
