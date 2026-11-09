import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { requireExactCandidate } from "./pi-workflows-candidate.mjs";

const root = resolve(import.meta.dirname, "../../..");
const agentDir = join(root, "dot_pi/agent");
const roles = ["evidence", "maker", "checker", "judge", "prose-checker"];
const entries = ["atta-task", "atta-investigate", "atta-push"];
const read = path => readFileSync(join(agentDir, path), "utf8");

test("Atta roles preserve models, tools and native child boundaries", () => {
  for (const role of roles) {
    const text = read(`agents/${role}.md`);
    assert.match(text, new RegExp(`^name: ${role}$`, "m"));
    assert.match(text, /thinking: high\n/);
    assert.match(text, /spawning: false\nauto-exit: true\nsystem-prompt: append/);
    assert.match(text, new RegExp(`model: github-copilot/${["judge", "prose-checker"].includes(role) ? "claude-opus-5\\.5" : "gpt-6\\.1-sol"}`));
    if (["judge", "prose-checker"].includes(role)) assert.match(text, /^tools: read$/m);
    else assert.match(text, /^tools: read, bash, (?:edit, write, )?codemode, mcp__\*$/m);
  }
});

test("Atta routing preserves continuation, trust and renamed entry guidance", () => {
  const skill = read("skills/atta-work/SKILL.md");
  for (const entry of entries) assert.ok(skill.includes(`/${entry} `));
  assert.match(skill, /start from the existing report and missing acceptance/i);
  assert.match(skill, /suggested human next checks do not make an investigation incomplete/i);
  assert.match(skill, /not an OS sandbox|not a sandbox/);
  assert.match(skill, /hashes the entrypoint, not its dependency graph/);
  assert.match(skill, /at most two targeted fix\/recheck passes/);
  for (const path of ["skills/atta-work/SKILL.md", ...entries.map(n => `workflows/${n}.ts`), ...roles.map(n => `agents/${n}.md`)]) {
    assert.doesNotMatch(read(path), /pstack-(?:work|task|investigate|push)/);
    assert.doesNotMatch(read(path), /\/Users\/|\/home\//);
  }
});

test("native saved discovery (not live execution)", { skip: !process.env.PI_WORKFLOWS_CANDIDATE && "exact candidate/compiler unavailable; set PI_WORKFLOWS_CANDIDATE" }, async () => {
  const { root: candidate } = requireExactCandidate(process.env.PI_WORKFLOWS_CANDIDATE, "1614faf29c6ad1d0fcc9fe6db86a770f34e2b129");
  const require = createRequire(join(candidate, "package.json"));
  const { createJiti } = await import(pathToFileURL(require.resolve("jiti")));
  const { discoverSavedWorkflows } = await createJiti(import.meta.url).import(join(candidate, "src/saved.ts"));
  const found = discoverSavedWorkflows(root, { projectTrusted: false, userDir: join(agentDir, "workflows") });
  assert.equal(found.length, 11);
  for (const name of entries) assert.ok(found.some(entry => entry.name === name));
  assert.ok(!found.some(entry => /^pstack-(task|investigate|push)$/.test(entry.name)));
});

test("native skill discovery (not model routing acceptance)", { skip: !process.env.PI_CODING_AGENT_SDK && "set PI_CODING_AGENT_SDK to an existing SDK module; no installation attempted" }, async () => {
  const { loadSkillsFromDir } = await import(pathToFileURL(resolve(process.env.PI_CODING_AGENT_SDK)));
  const found = loadSkillsFromDir({ dir: join(agentDir, "skills"), source: "user" });
  assert.ok(found.skills.some(skill => skill.name === "atta-work"));
});
test("Atta promotes one skill, five roles and three saved entries", () => {
  for (const path of ["skills/atta-work/SKILL.md", ...["evidence", "maker", "checker", "judge", "prose-checker"].map(name => `agents/${name}.md`), ...["atta-task", "atta-investigate", "atta-push"].map(name => `workflows/${name}.ts`)]) {
    assert.ok(existsSync(join(agentDir, path)), `${path} must be promoted`);
  }
});

// These fixtures exercise routing/protocols, not live permissions or model acceptance.
const { default: task, parseArgs } = await import('../workflows/atta-task.ts');
const { default: investigate } = await import('../workflows/atta-investigate.ts');
const { default: push } = await import('../workflows/atta-push.ts');
const result = (code = 'completed', extra = {}) => ({ ok: true, output: 'Concrete proof: file.ts:10; node --test: exit 0. Finding: selected behavior fails.', taskOutcomeObservation: { kind: 'reported', value: { protocol: 'agent-task-outcome', version: 1, status: ({completed:'succeeded','needs-fix':'failed',blocked:'blocked',incomplete:'incomplete'})[code], code, summary:'bounded evidence' } }, ...extra });
function fixture(args, handler = () => result()) {
  const calls = [];
  return { args, cwd: '/assigned/dirty-workspace', runId:'fixture-1', calls, spawn: async spec => { calls.push(spec); return handler(spec, calls.length); }, parallel: async function(specs) { return Promise.all(specs.map(s => this.spawn(s))); }, usage: () => ({cost:0}), budget: () => {}, checkpoint: () => {}, report: x => x, integrate: () => assert.fail('must not integrate'), cleanupIsolation: () => assert.fail('must not clean'), call: () => assert.fail('no bridge') };
}
const args = (intent, design = 'established') => JSON.stringify({intent,task:'Scoped task',design,...(intent==='recurring'?{reference:'accepted example; use incident-ops-review-content'}:{})});
test('mock: strict arguments and natural text default', () => {
  assert.equal(parseArgs('Investigate latency').intent,'investigate');
  for(const raw of ['', 'x'.repeat(16001), '{bad', '[]', '{"intent":"push","task":"x","design":"open"}', '{"intent":"implement","task":" ","design":"open"}', '{"intent":"poc","task":"x","design":"open","path":"/tmp"}', '{"intent":"recurring","task":"x","design":"established"}', '{"intent":"poc","task":"x","design":"open","acceptance":[""]}']) assert.throws(()=>parseArgs(raw));
});
for (const intent of ['investigate','recurring','poc','implement']) test(`mock: ${intent} completes with scoped roles`, async()=> {
  const wf = fixture(args(intent)); const report = await task(wf);
  assert.equal(report.done,true); assert.equal(report.noMerge,true); assert.equal(report.noPush,true);
  assert.equal(wf.calls.filter(s=>s.agent==='maker').length,intent==='investigate'?0:1);
  assert.equal(wf.calls.some(s=>s.label.startsWith('alternative')),false);
  for (const s of wf.calls) { assert.equal(s.cwd,wf.cwd); assert.equal(s.isolate,false); assert.equal(s.taskOutcome,'observe'); assert.equal(s.timeoutMs,480000); assert.match(s.model,/^github-copilot\//); assert.equal(s.thinking,'high'); }
});
test('mock: investigate and recurring prompts prioritize decision evidence and honest closure', async()=> {
  for (const intent of ['investigate','recurring']) {
    const wf=fixture(args(intent)); assert.equal((await task(wf)).done,true);
    const producer=wf.calls.find(s=>s.agent===(intent==='investigate'?'evidence':'maker'));
    for (const pattern of [/existing report.*missing acceptance/i, /next distinguishing query/i, /reuse valid saved evidence/i, /compatible populations/i, /diagnostic.*causal share/i, /already-scored.*unscored.*missed customer impact/i, /no exhaustive packet/i, /requested acceptance.*unresolved required reads.*incomplete/i]) assert.match(producer.task,pattern);
    assert.match(producer.task,/suggested next checks for a human do not make an investigation incomplete/i);
    assert.ok(producer.task.includes('report/gap list (maker only) or returned evidence handoff'));
    if (intent==='investigate') assert.equal(wf.calls.length,1);
    else {
      const checker=wf.calls.find(s=>s.agent==='checker');
      assert.match(checker.task,/direct answers.*remaining required reads/i);
      assert.match(checker.task,/only concrete changed claims warrant recheck/i);
      assert.match(checker.task,/unresolved required reads mean blocked or incomplete/i);
      assert.equal(wf.calls.length,2);
    }
  }
});
for (const intent of ['poc','implement']) test(`mock: ${intent} open uses two alternatives then judge then maker`, async()=> {
  const wf=fixture(args(intent,'open')); assert.equal((await task(wf)).done,true);
  assert.deepEqual(wf.calls.slice(0,4).map(s=>s.label),['alternative-opus','alternative-luna','choose-direction','make']);
  assert.match(wf.calls[0].model,/opus/); assert.match(wf.calls[1].model,/luna/);
});
test('mock: automatic wrapper cannot route effectful JSON and has only read',async()=> {
  const wf=fixture(args('implement','open')); assert.equal((await investigate(wf)).done,true);
  assert.equal(wf.calls.length,1); assert.deepEqual(wf.calls[0].tools,['read']); assert.equal(wf.calls[0].agent,'evidence');
});
for(const [name,r] of [['execution',result('completed',{ok:false,stopReason:'timeout'})],['missing',result('completed',{taskOutcomeObservation:{kind:'unknown'}})],['status mismatch',result('completed',{taskOutcomeObservation:{kind:'reported',value:{protocol:'agent-task-outcome',version:1,status:'blocked',code:'completed',summary:'x'}}})],['blocked',result('blocked')]]) test(`mock: ${name} preserves partial proof without later phases`,async()=> {
  const wf=fixture(args('implement'),()=>r);const report=await task(wf);
  assert.equal(report.done,false);assert.equal(report.partial,true);assert.equal(report.preserved,true);assert.equal(wf.calls.length,1);assert.equal(report.history[0].proof,r.output);
});
test('mock: two targeted fix passes exhaust; current revision check proof retained',async()=> {
  const wf=fixture(args('implement'),s=>result(s.agent==='checker'?'needs-fix':'completed'));
  const report=await task(wf);assert.equal(report.done,false);assert.match(report.reason,/exhausted/);
  assert.equal(wf.calls.filter(s=>s.label.startsWith('fix-')).length,2);
  assert.equal(wf.calls.filter(s=>s.agent==='checker').length,3);assert.equal(report.revision,3);
  assert.equal(report.history.at(-1).revision,3);
});
test('mock: fix then fresh recheck succeeds; old failure does not poison result',async()=> {
  const wf=fixture(args('implement'),s=>result(s.label==='acceptance-r1'?'needs-fix':'completed'));
  assert.equal((await task(wf)).done,true);assert.equal(wf.calls.filter(s=>s.label.startsWith('fix-')).length,1);
});
test('mock: budget/native exception preserves earlier phases',async()=> {
  const wf=fixture(args('poc'),(_,n)=> { if(n===2) throw new Error('BudgetExceededError');return result(); });
  const report=await task(wf);assert.equal(report.partial,true);assert.equal(report.history.length,1);assert.match(report.reason,/BudgetExceeded/);
});
test('mock: failed alternative never starts writer',async()=> {
  const wf=fixture(args('poc','open'),s=>result('completed',{ok:s.label!=='alternative-luna'}));
  assert.equal((await task(wf)).done,false);assert.equal(wf.calls.length,2);
});
test('mock: empty findings forbid targeted retry',async()=> {
  const wf=fixture(args('implement'),s=>s.agent==='checker'?result('needs-fix',{output:''}):result());
  assert.match((await task(wf)).reason,/without concrete/);assert.equal(wf.calls.filter(s=>s.label.startsWith('fix-')).length,0);
});
test('mock: push has explicit boundary and no recursive workflow/auto merge; invalid PR has no effects',async()=> {
  const wf=fixture('not-a-pr');const report=await push(wf);assert.equal(report.done,false);assert.equal(report.noMerge,true);assert.equal(wf.calls.length,0);
  const source=readFileSync(new URL('../workflows/atta-push.ts',import.meta.url),'utf8');
  assert.match(source,/@model-invocation: explicit/);assert.match(source,/return iteratePr\(composed\)/);assert.match(source,/Never merge or auto-merge/);assert.doesNotMatch(source,/workflow_run/);
  const upstream=readFileSync(new URL('../workflows/iterate-pr.ts',import.meta.url),'utf8');
  assert.match(upstream,/approval.trim\(\) !== "APPROVE"/);assert.match(upstream,/status === "PENDING"\) return wf.report\(\{ done: false/);
  assert.doesNotMatch(upstream, /wf\.(?:parallel|map)\s*\(/, "new dispatch paths require updating the push composition");
});

for (const answer of ["DENY", "APPROVE"]) test(`mock: valid PR ${answer} preserves approval and Atta spawn/report overrides`, async () => {
  const cwd = await mkdtemp(join(tmpdir(), "atta-push-"));
  try {
    execFileSync("git", ["init", "-q", cwd]);
    execFileSync("git", ["-C", cwd, "remote", "add", "origin", "https://github.com/fixture/atta.git"]);
    let approved = false;
    const wf = fixture("123", () => {
      assert.equal(approved, true, "spawn must follow APPROVE");
      return result("completed", { output: "ITERATE_STATUS: GREEN", usage: { turns: 1, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, contextTokens: 0, cost: 0 } });
    });
    wf.cwd = cwd;
    wf.ask = async (question, options) => {
      assert.equal(wf.calls.length, 0, "no child before approval");
      assert.ok(question.includes("fixture/atta, PR 123"));
      assert.match(question, /network access and credentials/);
      assert.equal(options.default, "DENY");
      approved = answer === "APPROVE";
      return answer;
    };
    const report = await push(wf);
    assert.equal(report.noMerge, true);
    assert.equal(report.approvalBoundary, "iterate-pr explicit APPROVE before effects");
    assert.equal(report.done, approved);
    assert.equal(wf.calls.length, approved ? 1 : 0);
    if (approved) {
      const spec = wf.calls[0];
      assert.equal(spec.agent, "maker");
      assert.equal(spec.model, "github-copilot/gpt-6.1-sol");
      assert.equal(spec.thinking, "high");
      assert.deepEqual(spec.tools, ["read", "bash", "edit", "write", "codemode"]);
      assert.match(spec.task, /Never merge or auto-merge/);
      assert.match(report.reason, /CI green/);
    } else assert.equal(report.reason, "approval denied");
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
