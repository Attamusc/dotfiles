import assert from "node:assert/strict";
import { cp, link, mkdtemp, mkdir, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";

const protocol = new URL("../skills/session-pickup/scripts/promote.py", import.meta.url).pathname;
const fixture = JSON.parse(await readFile(new URL("fixtures/promotion/clean-note.json", import.meta.url), "utf8"));
const runRaw = (root, action, input) => spawnSync("python3", ["-B", protocol, action, "--project-root", root], { input, encoding: "utf8" });
const run = (root, action, input) => runRaw(root, action, JSON.stringify(input));
const parse = result => { assert.equal(result.status, 0, result.stderr || result.stdout); return JSON.parse(result.stdout); };
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))) : item);
const approval = tuple => ({ decision:"approve", proposalSha256:tuple.proposalSha256, rootIdentity:tuple.rootIdentity, destination:tuple.destination, owner:tuple.owner, destinationKind:tuple.destinationKind, operation:tuple.operation, baseSha256:tuple.baseSha256, contentSha256:tuple.contentSha256, expectedResultSha256:tuple.expectedResultSha256 });
async function root() { const path=await mkdtemp(join(tmpdir(),"promotion-")); await mkdir(join(path,".notes"),{recursive:true}); return path; }

async function prepared(project, overrides={}) { return parse(run(project,"prepare",{...fixture,...overrides})); }
async function treeHash(path) { const hash=createHash("sha256"); for(const name of (await readdir(path,{recursive:true})).sort()){hash.update(name);try{hash.update(await readFile(join(path,name)))}catch{hash.update("/")}}return hash.digest("hex") }

test("approved append emits one unchanged owner handoff", async()=>{const project=await root();try{
  const base="existing\n", target=join(project,".notes/decisions.md"); await writeFile(target,base);
  const shown=await prepared(project), handoff=parse(run(project,"handoff",{tuple:shown.tuple,approval:approval(shown.tuple)}));
  assert.equal(handoff.state,"handed-off"); assert.equal(handoff.owner,"notekeeper"); assert.deepEqual(handoff.tuple,shown.tuple);
  assert.equal(await readFile(target,"utf8"),base);
  assert.equal(shown.tuple.expectedResultBytes,undefined);
}finally{await rm(project,{recursive:true,force:true})}});

test("approval is bound to the opened project root identity",async()=>{const first=await root(),second=await root();try{
  await writeFile(join(first,".notes/decisions.md"),"same-base\n"); await writeFile(join(second,".notes/decisions.md"),"same-base\n");
  const shown=await prepared(first), document={tuple:shown.tuple,approval:approval(shown.tuple)};
  assert.deepEqual(Object.keys(shown.tuple.rootIdentity).sort(),["device","inode"]); assert.equal(typeof shown.tuple.rootIdentity.device,"number"); assert.equal(typeof shown.tuple.rootIdentity.inode,"number");
  const replay=run(second,"handoff",document); assert.equal(replay.status,2); assert.doesNotMatch(replay.stdout,/handed-off/);
  const moved=`${first}-moved`; await rename(first,moved); await mkdir(join(first,".notes"),{recursive:true}); await writeFile(join(first,".notes/decisions.md"),"same-base\n");
  const replaced=run(first,"handoff",document); assert.equal(replaced.status,2); assert.doesNotMatch(replaced.stdout,/handed-off/); await rm(moved,{recursive:true,force:true});
}finally{await rm(first,{recursive:true,force:true});await rm(second,{recursive:true,force:true})}});

test("root identity schemas reject tampering, bools, and extra fields",async()=>{const project=await root();try{
  await writeFile(join(project,".notes/decisions.md"),"base\n"); const shown=await prepared(project);
  const changedIdentity={...shown.tuple.rootIdentity,inode:shown.tuple.rootIdentity.inode+1}, changedBody={...shown.tuple,rootIdentity:changedIdentity}; delete changedBody.proposalSha256;
  const changedTuple={...changedBody,proposalSha256:createHash("sha256").update(canonical(changedBody)).digest("hex")};
  assert.equal(run(project,"handoff",{tuple:changedTuple,approval:approval(changedTuple)}).status,2);
  for(const rootIdentity of [{...shown.tuple.rootIdentity,device:true},{...shown.tuple.rootIdentity,extra:1}]) {
    const result=run(project,"handoff",{tuple:shown.tuple,approval:{...approval(shown.tuple),rootIdentity}}); assert.equal(result.status,2); assert.doesNotMatch(result.stdout,/handed-off/);
  }
}finally{await rm(project,{recursive:true,force:true})}});

test("absent, declined, changed approval and base race never hand off",async()=>{const project=await root();try{
  await writeFile(join(project,".notes/decisions.md"),"base\n"); const shown=await prepared(project);
  for(const bad of [null,{...approval(shown.tuple),decision:"decline"},{...approval(shown.tuple),contentSha256:"0".repeat(64)}]) {
    const result=run(project,"handoff",{tuple:shown.tuple,approval:bad}); assert.equal(result.status,2); assert.doesNotMatch(result.stdout,/handed-off/);
  }
  await writeFile(join(project,".notes/decisions.md"),"raced\n"); const raced=run(project,"handoff",{tuple:shown.tuple,approval:approval(shown.tuple)}); assert.equal(raced.status,2); assert.match(raced.stdout,/stale-base/);
}finally{await rm(project,{recursive:true,force:true})}});

test("rejects taint, redaction, truncation, wrong owner, paths, symlinks, and multiple destinations",async()=>{const project=await root();try{
  for(const overrides of [{limits:{...fixture.limits,tainted:true}},{payload:"[REDACTED:secret]\n"},{limits:{...fixture.limits,truncated:true}},{owner:"domain-modeling"},{destination:"../outside"},{destination:"/tmp/out"},{destinations:[".notes/a.md",".notes/b.md"]}]) assert.equal(run(project,"prepare",{...fixture,...overrides}).status,2);
  await symlink("decisions.md",join(project,".notes/link.md")); assert.equal(run(project,"prepare",{...fixture,destination:".notes/link.md"}).status,2);
}finally{await rm(project,{recursive:true,force:true})}});

test("all notekeeper kinds bind append content without disclosing base",async()=>{for(const kind of ["decision","pattern","gotcha","context"]){const project=await root();try{const destination=`.notes/${kind==='decision'?'decisions':kind==='pattern'?'patterns':kind==='gotcha'?'gotchas':'context'}.md`;await writeFile(join(project,destination),"old\n");const shown=await prepared(project,{destination,destinationKind:kind});assert.equal(shown.tuple.operation,"append");assert.equal(Buffer.from(shown.tuple.contentBytes,"base64").toString(),fixture.payload);assert.equal(shown.tuple.expectedResultSha256,createHash("sha256").update("old\n"+fixture.payload).digest("hex"))}finally{await rm(project,{recursive:true,force:true})}}});

test("domain owner accepts glossary only and eligible exact absent ADR",async()=>{const project=await root();try{
  const glossary=await prepared(project,{destination:"CONTEXT.md",owner:"domain-modeling",destinationKind:"glossary",operation:"create",payload:"# Orders\n\n## Language\n\n**Order**:\nA customer request for goods.\n",semantic:{glossaryOnly:true}}); assert.equal(glossary.tuple.owner,"domain-modeling");
  assert.equal(run(project,"prepare",{...fixture,destination:"CONTEXT.md",owner:"domain-modeling",destinationKind:"glossary",operation:"create",semantic:{glossaryOnly:false}}).status,2);
  const adr={...fixture,destination:"docs/adr/0001-choice.md",owner:"domain-modeling",destinationKind:"adr",operation:"create",payload:"# Choose events\n\nUse events because isolation outweighs operational cost.\n",semantic:{hardToReverse:true,surprising:true,tradeOff:true,nextAdrNumber:1}}; assert.equal((await prepared(project,adr)).tuple.destinationKind,"adr");
  for(const key of ["hardToReverse","surprising","tradeOff"]) assert.equal(run(project,"prepare",{...adr,semantic:{...adr.semantic,[key]:false}}).status,2);
}finally{await rm(project,{recursive:true,force:true})}});

test("render is bounded and private, including every decoded byte field",async()=>{const project=await root();try{const secret="SECRET_TOKEN=synthetic-visible\n";await writeFile(join(project,".notes/decisions.md"),secret);const shown=await prepared(project);assert.ok(Buffer.byteLength(JSON.stringify(shown))<=16*1024);assert.doesNotMatch(JSON.stringify(shown),/\.pi\/agent\/sessions|\/home\/|SECRET_TOKEN|verified/);for(const [key,value] of Object.entries(shown.tuple).filter(([key])=>key.endsWith("Bytes"))){assert.equal(key,"contentBytes");assert.doesNotMatch(Buffer.from(value,"base64").toString(),/SECRET_TOKEN|synthetic-visible/)}}finally{await rm(project,{recursive:true,force:true})}});

test("malformed CLI input emits only bounded deterministic JSON",async()=>{const project=await root();try{
  const oversized="x".repeat(20_000);
  for(const [args,state] of [[[],"invalid-arguments"],[[oversized,"--project-root",project],"invalid-arguments"],[["prepare",oversized],"invalid-arguments"],[["prepare","--project-root",oversized],"invalid-input"]]) {
    const first=spawnSync("python3",["-B",protocol,...args],{input:"{}",encoding:"utf8"});
    const second=spawnSync("python3",["-B",protocol,...args],{input:"{}",encoding:"utf8"});
    assert.equal(first.status,2); assert.equal(first.stderr,""); assert.equal(first.stdout,second.stdout);
    assert.deepEqual(JSON.parse(first.stdout),{state});
    assert.ok(Buffer.byteLength(first.stdout)+Buffer.byteLength(first.stderr)<=16*1024);
    assert.doesNotMatch(first.stdout,/(?:x{32}|Traceback)/);
  }
}finally{await rm(project,{recursive:true,force:true})}});

test("strict JSON and closed schemas reject malformed and ambiguous input",async()=>{const project=await root();try{
  for(const raw of ["[]","null",'{"status":"complete","status":"complete"}', '{"semantic":NaN}', '{"semantic":Infinity}', '{"semantic":-Infinity}', '"bad\\ud800"']) { const result=runRaw(project,"prepare",raw); assert.equal(result.status,2); assert.doesNotMatch(result.stderr,/Traceback/); }
  for(const value of [{extra:true},{limits:{...fixture.limits,extra:"x"}},{limits:{...fixture.limits,redactions:false}},{semantic:{extra:true}},{provenance:[1]}]) assert.equal(run(project,"prepare",{...fixture,...value}).status,2);
}finally{await rm(project,{recursive:true,force:true})}});

test("privacy vocabulary rejects secrets and redactions on every string surface",async()=>{const project=await root();try{
  const secrets=["[REDACTED:token]","Authorization: Bearer abcdefgh","https://user:password@example.invalid/x","-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----","SECRET_TOKEN=synthetic-visible"];
  for(const secret of secrets) for(const mutation of [p=>p.payload=secret,p=>p.provenance=[`session:s#entry:${secret}`],p=>p.destination=secret]) { const proposal=structuredClone(fixture); mutation(proposal); const result=run(project,"prepare",proposal); assert.equal(result.status,2); assert.doesNotMatch(result.stdout,/synthetic-visible|password@example|abcdefgh|PRIVATE KEY|REDACTED/); }
}finally{await rm(project,{recursive:true,force:true})}});

test("ancestor symlink swaps never hand off bytes from outside the project",async()=>{const project=await root(),outside=await mkdtemp(join(tmpdir(),"promotion-outside-"));let swapper;try{
  await writeFile(join(project,".notes/decisions.md"),"approved\n"); await writeFile(join(outside,"decisions.md"),"approved\n"); const shown=await prepared(project); await writeFile(join(project,".notes/decisions.md"),"raced\n");
  const script='while :; do mv .notes .notes-real 2>/dev/null || true; ln -s "$1" .notes 2>/dev/null || true; rm .notes 2>/dev/null || true; mv .notes-real .notes 2>/dev/null || true; done'; swapper=spawn("sh",["-c",script,"swap",outside],{cwd:project,stdio:"ignore"});
  for(let index=0;index<100;index++){const result=run(project,"handoff",{tuple:shown.tuple,approval:approval(shown.tuple)});assert.notEqual(result.status,0,result.stdout);}
}finally{swapper?.kill("SIGKILL");await new Promise(resolve=>swapper?.once("exit",resolve)??resolve());await rm(project,{recursive:true,force:true});await rm(outside,{recursive:true,force:true})}});

test("handoff requires exact approved state and canonical tuple encoding",async()=>{const project=await root();try{
  await writeFile(join(project,".notes/decisions.md"),"base\n"); const shown=await prepared(project); const approved=approval(shown.tuple);
  const forged=structuredClone(shown.tuple); forged.contentBytes += "="; assert.equal(run(project,"handoff",{tuple:forged,approval:approved}).status,2);
  const changed=structuredClone(shown.tuple); changed.expectedResultSha256="0".repeat(64); assert.equal(run(project,"handoff",{tuple:changed,approval:approved}).status,2);
}finally{await rm(project,{recursive:true,force:true})}});

test("public verify action is denied and protocol has no verified state",async()=>{const project=await root();try{const result=run(project,"verify",{});assert.notEqual(result.status,0);assert.doesNotMatch(result.stdout,/verified/);const source=await readFile(protocol,"utf8");assert.doesNotMatch(source,/def verify|["']verified["']/)}finally{await rm(project,{recursive:true,force:true})}});

test("hardlinked note and glossary destinations are rejected without changing bytes",async()=>{for(const kind of ["note","glossary"]){const project=await root(),outside=join(project,"outside.md");try{const original="outside-base\n";await writeFile(outside,original);const destination=kind==="note"?join(project,".notes/decisions.md"):join(project,"CONTEXT.md");await link(outside,destination);const proposal=kind==="note"?fixture:{...fixture,destination:"CONTEXT.md",owner:"domain-modeling",destinationKind:"glossary",operation:"append",payload:"\n**Order**: A request.\n",semantic:{glossaryOnly:true}};assert.equal(run(project,"prepare",proposal).status,2);assert.equal(await readFile(outside,"utf8"),original)}finally{await rm(project,{recursive:true,force:true})}}});

test("a destination hardlinked after prepare cannot hand off",async()=>{const project=await root();try{const target=join(project,".notes/decisions.md"),other=join(project,"other.md");await writeFile(target,"base\n");const shown=await prepared(project);await link(target,other);const result=run(project,"handoff",{tuple:shown.tuple,approval:approval(shown.tuple)});assert.equal(result.status,2);assert.doesNotMatch(result.stdout,/handed-off/);assert.equal(await readFile(target,"utf8"),"base\n")}finally{await rm(project,{recursive:true,force:true})}});

test("stale handoff cannot advance to any later protocol success",async()=>{const project=await root();try{const target=join(project,".notes/decisions.md");await writeFile(target,"base\n");const shown=await prepared(project);await writeFile(target,"raced\n");const stale=run(project,"handoff",{tuple:shown.tuple,approval:approval(shown.tuple)});assert.equal(stale.status,2);assert.match(stale.stdout,/stale-base/);await writeFile(target,"base\n"+fixture.payload);assert.notEqual(run(project,"verify",{tuple:shown.tuple}).status,0)}finally{await rm(project,{recursive:true,force:true})}});

test("owner response contracts cover note, glossary, and ADR exact results",async()=>{const cases=[
  {overrides:{},base:"base\n"},
  {overrides:{destination:"CONTEXT.md",owner:"domain-modeling",destinationKind:"glossary",operation:"create",payload:"# Language\n\n**Order**: A request.\n",semantic:{glossaryOnly:true}},base:null},
  {overrides:{destination:"docs/adr/0001-choice.md",owner:"domain-modeling",destinationKind:"adr",operation:"create",payload:"# Choice\n\nChoose events because isolation outweighs cost.\n",semantic:{hardToReverse:true,surprising:true,tradeOff:true,nextAdrNumber:1}},base:null},
];for(const {overrides,base} of cases){const project=await root();try{if(overrides.destination?.startsWith("docs/"))await mkdir(join(project,"docs/adr"),{recursive:true});const destination=overrides.destination??fixture.destination,target=join(project,destination);if(base!==null)await writeFile(target,base);const shown=await prepared(project,overrides),handed=parse(run(project,"handoff",{tuple:shown.tuple,approval:approval(shown.tuple)}));const result=Buffer.concat([Buffer.from(base??""),Buffer.from(shown.tuple.contentBytes,"base64")]);if(base===null)await writeFile(target,result,{flag:"wx"});else await writeFile(target,result);const ownerResult={owner:handed.owner,destination:handed.destination,resultBytes:result.toString("base64"),resultSha256:createHash("sha256").update(result).digest("hex")};assert.equal(ownerResult.resultSha256,shown.tuple.expectedResultSha256);assert.deepEqual(await readFile(target),result);assert.doesNotMatch(JSON.stringify(handed),/verified/)}finally{await rm(project,{recursive:true,force:true})}}});

test("ordinary reader, pickup, and promotion leave a fresh writable managed tree unchanged",async()=>{const project=await root(),archive=await mkdtemp(join(tmpdir(),"promotion-archive-"));try{
  const sourceAgent=new URL("../",import.meta.url).pathname,agentRoot=join(archive,"dot_pi/agent"),sessions=join(archive,"sessions");
  await mkdir(join(agentRoot,"skills"),{recursive:true}); await mkdir(sessions);
  for(const name of ["shared","skills/session-reader","skills/session-pickup"]) await cp(join(sourceAgent,name),join(agentRoot,name),{recursive:true,filter:source=>!source.includes("__pycache__")&&!source.endsWith(".pyc")});
  const session=join(sessions,"linear-v3.jsonl"); await cp(join(sourceAgent,"test/fixtures/session-reader/linear-v3.jsonl"),session);
  const before=await treeHash(agentRoot),reader=join(agentRoot,"skills/session-reader/scripts/read_session.py"),pickup=join(agentRoot,"skills/session-pickup/scripts/pickup.py"),promote=join(agentRoot,"skills/session-pickup/scripts/promote.py");
  for(const result of [
    spawnSync("python3",[reader,session,"--sessions-root",sessions,"--leaf","b1","--mode","resolve"],{encoding:"utf8"}),
    spawnSync("python3",[pickup,"--path",session,"--sessions-root",sessions,"--leaf","b1"],{encoding:"utf8"}),
    spawnSync("python3",[promote,"prepare","--project-root",project],{input:JSON.stringify(fixture),encoding:"utf8"}),
  ]) assert.equal(result.status,0,result.stderr||result.stdout);
  assert.equal(await treeHash(agentRoot),before); const files=await readdir(agentRoot,{recursive:true}); assert.equal(files.some(name=>name.includes("__pycache__")||name.endsWith(".pyc")),false);
}finally{await rm(project,{recursive:true,force:true});await rm(archive,{recursive:true,force:true})}});

test("protocol contains no write API and does not parse sessions",async()=>{const source=await readFile(protocol,"utf8");assert.doesNotMatch(source,/write_text|write_bytes|O_WRONLY|O_RDWR|O_CREAT|O_TRUNC|O_APPEND|rename\(|replace\(|unlink\(|mkdir\(|jsonl|read_session/)});
