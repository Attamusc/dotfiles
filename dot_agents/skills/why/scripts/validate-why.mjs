#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { analyzeWhy } from "./analyze-why.mjs";
import { renderWhyReport } from "./render-why.mjs";
import { LIMIT, parseArgs, safeDiagnostic } from "./why-core.mjs";
export { renderWhyReport };
const KEYS=new Set(["kind","target","path","supports","upstream"]);
const valid=r=>r&&typeof r==="object"&&!Array.isArray(r)&&Object.keys(r).every(x=>KEYS.has(x))&&typeof r.kind==="string"&&typeof r.target==="string";
export async function validateWhyReport(source,{repo,request}={}){if(Buffer.byteLength(source)>LIMIT)return["report exceeds 16 KiB"];if(typeof repo!=="string"||!valid(request))return["invalid analysis request"];try{return source===analyzeWhy({repo,...request})?[]:["report does not match repository analysis"]}catch{return["repository analysis failed"]}}
async function main(){try{const a=parseArgs(process.argv.slice(2),new Set(["--repo","--kind","--target","--path","--supports","--upstream"]));if(!a["--repo"]||!a["--kind"]||!a["--target"])throw 0;process.stdout.write(analyzeWhy({repo:a["--repo"],kind:a["--kind"],target:a["--target"],path:a["--path"],supports:a["--supports"]??[],upstream:a["--upstream"]}))}catch{safeDiagnostic();process.exitCode=1}}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])await main();
