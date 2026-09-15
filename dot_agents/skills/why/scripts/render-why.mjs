import { createHash } from "node:crypto";
const inert=value=>String(value).replace(/[!-/:-@[-`{-~\r\n\u0000-\u001f\u007f]/g,c=>`&#${c.charCodeAt(0)};`);
const citation=value=>String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll("|","&#124;").replaceAll("\r","&#13;").replaceAll("\n","&#10;");
const cite=x=>x.citation??(x.commit?x.commit:String(x.path));
const table=rows=>`| claim | classification | citations | limits |\n|---|---|---|---|\n${rows.map(r=>`| ${r.map((value,index)=>index===2?citation(value):inert(value)).join(" | ")} |`).join("\n")}`;
export function renderWhyReport(m){
  const target={kind:m.target.kind,value:m.target.value,path:m.target.path};
  const searched=m.history.searches.map(x=>`${x.path} [log=${x.log}, blame=${x.blame}, shown=${x.shown}]`).join(", ")||`searched:${m.target.path}`;
  const rationale=m.classification==="not documented"?[["Rationale was not established.","not documented",searched,"Bounded evidence."]]:m.evidence.map(x=>[x.text,m.classification,cite(x),x.historical?"Historical or stale evidence.":"Bounded evidence."]);
  const shape=m.currentShape.length?m.currentShape.map(x=>`- ${inert(x.text)} (${citation(x.citation)})`).join("\n"):"No bounded shape evidence.";
  const constraints=m.constraints.length?m.constraints.map(x=>`- ${inert(x.text)} (${citation(x.citation)})`).join("\n"):"None.";
  const contradictions=m.contradictions.length?table(m.contradictions.map(x=>[x.text,x.possibleDivergence?m.classification:"not documented",cite(x),x.possibleDivergence?"possible source divergence; compatibility unresolved":"Explicit incompatibility or stale evidence."])):"None found in bounded evidence.";
  const unresolved=m.unresolved.length?m.unresolved.map(x=>`- ${inert(x)}`).join("\n"):"None.";
  const redactions=Object.entries(m.disclosure.redactions).map(([k,v])=>`${inert(k)}=${v}`).join(", ")||"none",omitted=Object.values(m.disclosure.omissions).reduce((a,b)=>a+b,0),ordinals=Object.entries(m.disclosure.sourceOrdinals??{}).map(([k,v])=>`${inert(k)}=${inert(v)}`).join(", ")||"none",id=createHash("sha256").update(JSON.stringify(m)).digest("hex");
  const provenance=m.upstream?` Pinned provenance: ${citation(m.upstream.path)}@${m.upstream.commit} (${inert(m.upstream.source)}); this establishes provenance, not local intent.`:"";
  const disclosure=`Redactions: ${redactions}; source/request taint: ${m.disclosure.tainted?"yes":"no"}; truncation: ${omitted?`${omitted} items`:"none"}; scope exclusions: prohibited roots, request sha256=${m.identity.requestSha256}, HEAD=${m.identity.head}, source identities=${m.identity.sources.length}, source ordinals: ${ordinals}, manifest sha256=${id}; VCS fallback: ${m.history.ran?"ran":"did not run"}; bound: 16 KiB; sessions/persistence: not accessed.${provenance}`;
  return `## Target\n\n    ${JSON.stringify(target)}\n\n## Current shape\n\n${shape}\n\n## Rationale\n\n${table(rationale)}\n\n## Constraints and alternatives\n\n${constraints}\n\n## Contradictions\n\n${contradictions}\n\n## Unresolved\n\n${unresolved}\n\n## Promotion candidate\n\nNone.\n\n## Disclosure notes\n\n${disclosure}\n`;
}
