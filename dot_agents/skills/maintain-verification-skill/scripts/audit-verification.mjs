#!/usr/bin/env node
import { readFile, realpath } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function markdownSections(source, entry) {
  const slug = value => value.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-");
  const headings = [...source.matchAll(/^(#{1,6})\s+(.+?)\s*$/gm)];
  return headings.filter(match => match[2].trim() === entry || slug(match[2]) === entry.toLowerCase()).map(heading => {
    const level = heading[1].length;
    const next = headings.find(match => match.index > heading.index && match[1].length <= level);
    return source.slice(heading.index + heading[0].length, next?.index ?? source.length).trim();
  });
}

async function citedEvidence(path, entry, source, command, repositoryRoot) {
  if (extname(path).toLowerCase() === ".json") {
    try {
      let value = JSON.parse(source);
      for (const segment of entry.split(".")) {
        if (!value || typeof value !== "object" || !Object.hasOwn(value, segment)) return { supports: false, observation: `${path}#${entry} is absent` };
        value = value[segment];
      }
      let supports = value === command;
      let wrapperResolved = false;
      const scriptMatch = entry.match(/^scripts\.([A-Za-z0-9:_-]+)$/);
      const wrapper = command.match(/^npm\s+(?:test|run\s+([A-Za-z0-9:_-]+))(?:\s+--(?:\s+(.*))?)?$/);
      if (typeof value === "string" && scriptMatch) {
        if (wrapper) {
          const invokedScript = command.startsWith("npm test") ? "test" : wrapper[1];
          const forwarded = wrapper[2]?.trim();
          supports = invokedScript === scriptMatch[1] && value.trim().length > 0;
          if (supports && forwarded) {
            const forwardedArguments = forwarded.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map(argument => argument.replace(/^(?:"([^"]*)"|'([^']*)')$/, "$1$2")) ?? [];
            for (const argument of forwardedArguments) {
              if (value.split(/\s+/).includes(argument)) continue;
              const target = resolve(repositoryRoot, argument);
              let canonicalTarget;
              try { canonicalTarget = await realpath(target); } catch (error) { if (error.code !== "ENOENT") throw error; supports = false; break; }
              const relation = relative(repositoryRoot, canonicalTarget);
              if (!relation || relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) { supports = false; break; }
            }
          }
          wrapperResolved = supports;
        }
      }
      return { supports, observation: `${path}#${entry} ${supports ? wrapperResolved ? "establishes" : "equals" : wrapper ? "does not establish" : "does not equal"} the declared command` };
    } catch { return { ambiguous: true, observation: `${path}#${entry} cannot be resolved because the JSON is malformed` }; }
  }
  if ([".md", ".markdown"].includes(extname(path).toLowerCase())) {
    const sections = markdownSections(source, entry);
    if (!sections.length) return { supports: false, observation: `${path}#${entry} is absent` };
    if (new Set(sections).size > 1) return { ambiguous: true, observation: `${path}#${entry} resolves to conflicting duplicate sections` };
    const section = sections[0];
    const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const commandLines = section.split("\n").filter(line => line.includes(command));
    const declared = `\`${escaped}\``;
    const prohibited = new RegExp(`(?:\\b(?:never|do not|don't|must not|avoid)\\s+(?:(?:run|use|execute)\\s+)?${declared}|\\bno longer\\s+${declared}|\\binstead of\\s+${declared}|${declared}[^\\n]*(?:\\b(?:was|is)\\s+(?:removed|deprecated|obsolete|replaced|renamed|prohibited|forbidden|disabled|unsupported)\\b))`, "i");
    const contradicts = commandLines.some(line => prohibited.test(line));
    const affirmative = new RegExp(`(?:\\b(?:run|use|execute)\\s+${declared}|${declared}\\s+(?:is|remains)\\s+(?:the\\s+)?(?:current\\s+)?(?:command|test command)|(?:^|\\b)(?:Test command|Command):\\s*${declared})`, "i");
    const supports = !contradicts && commandLines.some(line => affirmative.test(line));
    const ambiguous = commandLines.length > 0 && !contradicts && !supports;
    return { supports, ambiguous, observation: `${path}#${entry} ${contradicts ? "says the declared command is prohibited, obsolete, or replaced" : supports ? "affirmatively establishes" : ambiguous ? "only mentions" : "does not contain"} the declared command` };
  }
  return { ambiguous: true, observation: `${path}#${entry} uses an unsupported entry convention` };
}

export async function auditMaintainerDefinition(definitionUrl, repositoryRootUrl) {
  const source = await readFile(definitionUrl, "utf8");
  const canonicalRoot = await realpath(fileURLToPath(repositoryRootUrl));
  const checks = [...source.matchAll(/^### (CHECK-[1-9]\d*):[^\n]+\n([\s\S]*?)(?=^### |^## Report)/gm)];
  const result = [];
  for (const [, check, body] of checks) {
    const command = body.match(/^- Command: `([^`]+)`$/m)?.[1];
    if (!command) continue;
    const target = body.match(/^- Target: (.+)$/m)?.[1] ?? "";
    const citations = [...target.matchAll(/`([^`#]+)#([^`#]+)`/g)].map(([, path, entry]) => ({ citation: `${path}#${entry}`, path, entry }));
    const observations = [];
    for (const { path, entry } of citations) {
      let decodedPath;
      try { decodedPath = decodeURIComponent(path); }
      catch { observations.push({ supports: false, observation: `${path}#${entry} has malformed path encoding` }); continue; }
      const rootPath = canonicalRoot;
      const evidencePath = resolve(rootPath, decodedPath);
      const relation = relative(rootPath, evidencePath);
      if (!relation || relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
        observations.push({ supports: false, observation: `${path}#${entry} resolves outside repository` });
        continue;
      }
      try {
        const evidence = await readFile(evidencePath, "utf8");
        observations.push(await citedEvidence(path, entry, evidence, command, rootPath));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        observations.push({ missing: true, observation: `${path}#${entry} source file is absent` });
      }
    }
    const available = observations.filter(x => !x.missing);
    let state = "missing";
    if (available.some(x => x.ambiguous)) state = "ambiguous";
    else if (available.length) state = available.some(x => x.supports) && available.some(x => !x.supports) ? "ambiguous" : available.every(x => x.supports) ? "current" : "stale";
    result.push({ check, declaredSource: citations.map(x => x.citation).join(", ") || "none", currentEvidence: observations.map(x => x.observation).join("; ") || "no repository source citation", state });
  }
  return result;
}

async function main() {
  const [definitionPath, rootPath = "."] = process.argv.slice(2);
  if (!definitionPath) { console.error("usage: audit-verification.mjs <definition> [repository-root]"); process.exitCode = 2; return; }
  try { console.log(JSON.stringify(await auditMaintainerDefinition(pathToFileURL(resolve(definitionPath)), pathToFileURL(`${resolve(rootPath)}/`)), null, 2)); }
  catch (error) { console.error(`audit error: ${error.code ?? error.message}`); process.exitCode = 1; }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
