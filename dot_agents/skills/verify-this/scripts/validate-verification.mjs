#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const MAX_ERRORS = 25;
const SENSITIVE = /\b(?:credentials?|secrets?|api[-_ ]?keys?|tokens?|passwords?|sensitive session content|complete transcript|full transcript|all command output|complete output|full output|entire output|unbounded output|environment dump)\b/i;
const RECOGNIZABLE_CREDENTIAL = /(?:\bAuthorization\s*:\s*(?:Basic\s+[A-Za-z0-9+/]{12,}={0,2}|Bearer\s+[A-Za-z0-9._~+/-]{16,})|\b(?:gh[opusr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\b(?:api[-_]?key|api[-_]?token|access[-_]?token|auth[-_]?token|password|passwd|secret)\s*[:=]\s*["']?[A-Za-z0-9._~+/-]{20,}["']?|-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----|https?:\/\/[^\s/@:]+:[^\s/@]+@[^\s/]+)/i;
const FIELDS = ["Target", "Safety", "Requires", "Command", "Timeout", "Pass signal", "Failure means", "Evidence", "Cleanup"];
const STATUSES = new Set(["pass", "fail", "error", "skipped", "unsupported"]);
const GRADES = new Set(["measured", "observed", "agent-reported", "unverified"]);
const TABLES = {
  capabilities: ["Capability", "Status", "Evidence"],
  results: ["Check", "Status", "Evidence grade", "Evidence reference"],
  evidence: ["Reference", "Kind", "Bounded detail"],
  cleanup: ["Check", "Required cleanup", "Status", "Evidence"],
};

function limited(errors) { return [...new Set(errors)].slice(0, MAX_ERRORS); }
function hasCheckToken(value, id) {
  const token = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^A-Za-z0-9_-])${token}(?=$|[^A-Za-z0-9_-])`).test(value);
}
function markdownSections(source, headings) {
  const found = [...source.matchAll(/^(#{1,2})[ \t]+([^\n]*\S)[ \t]*$/gm)].map(m => ({ level: m[1].length, title: m[2], index: m.index, end: m.index + m[0].length }));
  return headings.map(({ level, title, prefix = false }) => {
    const item = found.find(x => x.level === level && (prefix ? x.title.startsWith(title) : x.title === title));
    if (!item) return { item: undefined, body: "" };
    const next = found.find(x => x.index > item.index && x.level <= item.level);
    return { item, body: source.slice(item.end, next?.index ?? source.length).trim() };
  });
}
function isYamlNonStringScalar(value) {
  return /^(?:~|null|true|false)$/i.test(value)
    || /^[+-]?(?:0|[1-9][0-9_]*|0o[0-7_]+|0x[0-9a-f_]+)$/i.test(value)
    || /^[+-]?(?:(?:[0-9][0-9_]*)?\.[0-9_]+|[0-9][0-9_]*(?:\.[0-9_]*)?[eE][+-]?[0-9]+|\.inf|\.nan)$/i.test(value);
}
function decodeYamlDoubleQuoted(raw) {
  if (!raw.endsWith('"')) throw new Error();
  let value = "";
  for (let i = 1; i < raw.length - 1; i++) {
    if (raw[i] === '"') throw new Error();
    if (raw[i] !== "\\") { value += raw[i]; continue; }
    const escape = raw[++i];
    const simple = { "0": "\0", a: "\x07", b: "\b", t: "\t", n: "\n", v: "\v", f: "\f", r: "\r", e: "\x1b", " ": " ", '"': '"', "/": "/", "\\": "\\", N: "\x85", _: "\xa0", L: "\u2028", P: "\u2029" };
    if (Object.hasOwn(simple, escape)) { value += simple[escape]; continue; }
    const digits = { x: 2, u: 4, U: 8 }[escape];
    if (!digits) throw new Error();
    const encoded = raw.slice(i + 1, i + 1 + digits);
    if (!new RegExp(`^[0-9a-fA-F]{${digits}}$`).test(encoded)) throw new Error();
    const codePoint = Number.parseInt(encoded, 16);
    if (codePoint > 0x10ffff || codePoint >= 0xd800 && codePoint <= 0xdfff) throw new Error();
    value += String.fromCodePoint(codePoint);
    i += digits;
  }
  return value;
}
function parseFrontmatter(text, errors) {
  const lines = text.split("\n");
  const metadata = {};
  const allowed = new Set(["name", "description"]);
  for (let i = 0; i < lines.length;) {
    const match = lines[i].match(/^([a-z][a-z0-9-]*):(?:[ \t]*(.*))?$/);
    if (!match) { errors.push("frontmatter: malformed or unsupported YAML"); i++; continue; }
    const [, key, raw = ""] = match;
    if (!allowed.has(key)) errors.push(`frontmatter: unknown metadata ${key}`);
    if (Object.hasOwn(metadata, key)) errors.push(`frontmatter: duplicate metadata ${key}`);
    let value = "";
    if (raw === ">" || raw === "|") {
      const parts = []; i++;
      while (i < lines.length && /^(?: {2,}|\s*$)/.test(lines[i])) { parts.push(lines[i].replace(/^ {2}/, "")); i++; }
      if (!parts.some(line => line.trim())) errors.push(`frontmatter: invalid scalar for ${key}`);
      value = raw === ">" ? parts.join(" ").replace(/\s+/g, " ").trimEnd() : parts.join("\n").trimEnd();
    } else {
      if (!raw || /^(?:[>|]|[-?:,\[\]{}#&*!%@`])/.test(raw) || /(?:^|\s)[!&*][^\s]*/.test(raw)) errors.push(`frontmatter: invalid scalar for ${key}`);
      if (raw.startsWith('"')) { try { value = decodeYamlDoubleQuoted(raw); } catch { errors.push(`frontmatter: invalid quoted scalar for ${key}`); } }
      else if (raw.startsWith("'")) { if (!/^'(?:[^']|'')*'$/.test(raw)) errors.push(`frontmatter: invalid quoted scalar for ${key}`); else value = raw.slice(1, -1).replace(/''/g, "'"); }
      else {
        if (/[:#]\s|\s#/.test(raw) || isYamlNonStringScalar(raw) || key === "description" && !/^[A-Za-z]/.test(raw)) errors.push(`frontmatter: unsupported plain scalar for ${key}`);
        value = raw;
      }
      i++;
    }
    metadata[key] = value;
  }
  if (Object.keys(metadata).length !== 2 || !Object.hasOwn(metadata, "name") || !Object.hasOwn(metadata, "description")) errors.push("frontmatter: exactly name and description are required");
  return metadata;
}
function rows(body, headers, label, errors, allowEmpty = false) {
  const lines = body.split("\n").filter(line => /^\|.*\|\s*$/.test(line));
  if (lines.length < 2) { errors.push(`${label}: header and separator are required`); return []; }
  const cells = line => line.trim().slice(1, -1).split("|").map(x => x.trim());
  if (cells(lines[0]).join("\0") !== headers.join("\0")) errors.push(`${label}: headers must exactly match contract`);
  const separators = cells(lines[1]);
  if (separators.length !== headers.length || separators.some(x => x !== "---")) errors.push(`${label}: separator row must exactly match contract`);
  if (!allowEmpty && lines.length === 2) errors.push(`${label}: at least one data row is required`);
  const result = [];
  for (const line of lines.slice(2)) {
    const values = cells(line);
    if (values.length !== headers.length) errors.push(`${label}: wrong column count`);
    else if (values.some(x => !x)) errors.push(`${label}: cells must be non-empty`);
    else result.push(values);
  }
  return result;
}
function shellOperands(value, mode) {
  const operands = [];
  let operand = "", quote = "";
  const flush = () => { if (operand) operands.push(operand); operand = ""; };
  for (const character of String(value ?? "")) {
    if (quote) {
      if (character === quote) quote = "";
      else operand += character;
    } else if ((character === "'" || character === '"') && (mode === "command" || !operand)) quote = character;
    else if (/[\s`(),;<>|&]/.test(character)) flush();
    else operand += character;
  }
  flush();
  return { operands, balanced: !quote };
}
function hasForbiddenPath(value, { mode = "prose", rejectUnbalanced = false } = {}) {
  const scanned = shellOperands(value, mode);
  if (rejectUnbalanced && !scanned.balanced) return true;
  for (const operand of scanned.operands) {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(operand)) continue;
    for (const part of operand.split("=")) {
      let token = part.replace(/[.?:]+$/, "");
      const pathCandidate = /[\\/]/.test(token) || /^(?:~|[A-Za-z]:|%2e)/i.test(token);
      if (pathCandidate && token.includes("%")) {
        try { token = decodeURIComponent(token); } catch { return true; }
      }
      if (/^(?:\/|~[\\/]|[A-Za-z]:[\\/]|\.\.[\\/])/.test(token) || /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(token)) return true;
    }
  }
  return false;
}
function projectRelative(value, options) { return !hasForbiddenPath(value, options); }
function objectivePredicates(value) {
  const clauses = (value?.trim() ?? "").split(/\s+and\s+/i);
  if (!clauses.length) return null;
  const predicates = [];
  for (const clause of clauses) {
    let match = clause.match(/^(exit status|command exits?|process status|status|returned value|count|file state|process state)\s+(?:is\s+)?(.+)$/i);
    if (match) {
      const kind = /^command exit/i.test(match[1]) ? "exit status" : match[1].toLowerCase();
      predicates.push({ kind, expected: match[2].trim() });
      continue;
    }
    match = clause.match(/^(.+?)\s+(contains?|equals?|matches?)\s+(.+)$/i);
    if (match) { predicates.push({ kind: { contains: "contain", contain: "contain", equals: "equal", equal: "equal", matches: "match", match: "match" }[match[2].toLowerCase()], expected: match[3].trim(), subject: match[1].trim() }); continue; }
    match = clause.match(/^(.+?)\s+is\s+(present|absent|visible|shown|reported|observed)$/i);
    if (match) { predicates.push({ kind: "presence", expected: match[2].toLowerCase(), subject: match[1].trim() }); continue; }
    match = clause.match(/^(.+?)\s+appears?$/i);
    if (match) { predicates.push({ kind: "appears", subject: match[1].trim() }); continue; }
    return null;
  }
  return predicates;
}
function objective(value) { return objectivePredicates(value) !== null; }
function unquoted(value) { return value.replace(/^`([^`]*)`$/, "$1"); }
function evidenceEstablishes(signal, detail) {
  const predicates = objectivePredicates(signal);
  if (!predicates) return false;
  // Closed grammar: observations begin at the detail boundary or after punctuation,
  // "and", or "but". Each carries an exact canonical subject, predicate, value,
  // and predicate-local polarity; prose containing those words is not evidence.
  const clauses = detail.split(/\s*(?:[;,.]|\b(?:and|but)\b)\s*/i).map(value => value.trim()).filter(Boolean);
  const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return predicates.every(({ kind, expected = "", subject = "" }) => {
    const expectedPattern = escaped(unquoted(expected));
    const subjectPattern = escaped(subject);
    let observation;
    if (kind === "exit status") {
      observation = /^(not\s+)?(?:(?:test\s+)?command\s+(?:(did|does)\s+not\s+)?exit(?:ed|s)?\s+(\S+)|exit\s+status\s+(?:(was|is)\s+not\s+|(was|is)\s+)(\S+))/i;
    } else if (["process status", "status", "returned value", "count", "file state", "process state"].includes(kind)) {
      observation = new RegExp(`^(not\\s+)?${kind.replace(" ", "\\s+")}\\s+(?:(?:was|is|returned|equaled|equals)\\s+not\\s+|(?:was|is|returned|equaled|equals)\\s+)(\\S+)`, "i");
    } else if (["contain", "equal", "match"].includes(kind)) {
      const relation = { contain: "contain(?:s|ed)?", equal: "equal(?:s|ed)?(?:\\s+to)?", match: "match(?:es|ed)?" }[kind];
      observation = new RegExp(`^(?<leadingNot>not\\s+)?${subjectPattern}\\s+(?:(?:did|does|was|is)\\s+(?<auxiliaryNot>not)\\s+|(?<predicateNot>not)\\s+)?${relation}\\b\\s+(?<value>[\\s\\S]+)$`, "i");
    } else if (kind === "presence") {
      observation = new RegExp(`^(not\\s+)?${subjectPattern}\\s+(?:(?:was|is|remains)\\s+not\\s+|(?:was|is|remains)\\s+)(\\S+)`, "i");
    } else {
      observation = new RegExp(`^(not\\s+)?${subjectPattern}\\s+(?:(?:did|does)\\s+not\\s+)?appear(?:s|ed)?\\b`, "i");
    }
    const relevant = clauses.map(clause => ({ clause, match: clause.match(observation) })).filter(item => item.match);
    return relevant.length > 0 && relevant.every(({ clause, match }) => {
      const negative = match.groups
        ? Boolean(match.groups.leadingNot || match.groups.auxiliaryNot || match.groups.predicateNot)
        : /^not\s+/i.test(clause) || /\b(?:did|does|was|is|remains)\s+not\b/i.test(clause);
      if (negative) return false;
      if (kind === "appears") return true;
      let observed = match.groups?.value ?? match.slice(1).reverse().find(value => value !== undefined) ?? "";
      if (["contain", "equal", "match"].includes(kind)) {
        const expectedValue = unquoted(expected);
        if (unquoted(observed) === expectedValue) return true;

        const suffixWord = "(?:with|before|after|during|from|at|in)";
        const suffix = `${suffixWord}\\s+.+`;
        const quoted = observed.match(new RegExp(`^(\`[^\`]*\`)(?:\\s+${suffix})?$`, "i"));
        if (quoted) {
          const relationValue = unquoted(quoted[1]);
          return kind === "contain"
            ? new RegExp(`(?:^|[^A-Za-z0-9_-])${expectedPattern}(?=$|[^A-Za-z0-9_-])`, "i").test(relationValue)
            : relationValue === expectedValue;
        }

        if (kind !== "contain") {
          const remainder = observed.slice(expectedValue.length);
          return observed.startsWith(expectedValue) && (!remainder || new RegExp(`^\\s+${suffix}$`, "i").test(remainder));
        }

        const expectedSpan = new RegExp(`(?:^|[^A-Za-z0-9_-])(${expectedPattern})(?=$|[^A-Za-z0-9_-])`, "ig");
        for (const candidate of observed.matchAll(expectedSpan)) {
          const spanStart = candidate.index + candidate[0].length - candidate[1].length;
          if (!new RegExp(`(?:^|\\s)${suffixWord}\\s`, "i").test(observed.slice(0, spanStart))) return true;
        }
        return false;
      }
      return unquoted(observed).replace(/[`]+/g, "") === unquoted(expected);
    });
  });
}
function hasPositiveBoundedEvidence(value) {
  return /^(?:(?:exit status|command exit|process status|returned value|result count|file state|process state) and )?bounded (?:output|evidence excerpt|native runtime artifact|native runtime record)$/i.test(value?.trim() ?? "");
}
function hasNegatedProof(clause) {
  return /\b(?:not|never|no|isn't|wasn't|aren't|weren't|don't|doesn't|didn't|won't|wouldn't|shouldn't|can't|cannot|couldn't)\b[\s\S]*\b(?:prove|confirm|verify|absent|gone|restored|stopped|terminated)\b/i.test(clause)
    || /\b(?:prove|confirm|verify)\b[\s\S]*\b(?:not|never|n't)\b[\s\S]*\b(?:absent|gone|restored|stopped|terminated)\b/i.test(clause);
}
function cleanupIsObjective(value) {
  const match = value?.match(/^(?:remove|delete|restore|stop|terminate|revert)\s+`([^`]+)`([\s\S]*)$/i);
  if (!match) return false;
  const proof = match[2].match(/\b(?:prove|confirm|verify)\b([\s\S]+)\b(?:absent|gone|no owned|restored|stopped|terminated)\b[\s\S]*\bafter (?:cleanup|removal|the action)\b/i);
  if (!proof || hasNegatedProof(match[2])) return false;
  const proofTargets = [...proof[1].matchAll(/`([^`]+)`/g)].map(item => item[1]);
  return proofTargets.length ? proofTargets.every(target => target === match[1]) : /\b(?:the|that)\s+(?:path|target|state|process)\b/i.test(proof[1]);
}
function definitionData(source) {
  const matches = [...source.matchAll(/^### (CHECK-[1-9]\d*):[ \t]*([^\n]*\S)[ \t]*\n([\s\S]*?)(?=^### |^## Report)/gm)];
  return matches.map(([, id, purpose, body]) => ({ id, purpose, body, fields: Object.fromEntries([...body.matchAll(/^- ([^:]+):\s*(.*)$/gm)].map(m => [m[1], m[2]])) }));
}

export function validateDefinition(source) {
  const errors = [];
  const fm = source.match(/^---\n([\s\S]*?)\n---\n/);
  let content = source;
  if (!fm) errors.push("frontmatter: missing");
  else {
    content = source.slice(fm[0].length);
    const metadata = parseFrontmatter(fm[1], errors);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.name ?? "") || metadata.name.length > 64) errors.push("frontmatter: invalid name");
    if (!metadata.description || typeof metadata.description !== "string" || metadata.description.length > 1024) errors.push("frontmatter: invalid description");
  }
  const specs = [{ level: 1, title: "Verification: ", prefix: true }, ...["Scope", "Prerequisites", "Checks", "Report"].map(title => ({ level: 2, title }))];
  const parsed = markdownSections(content, specs);
  let previous = -1;
  parsed.forEach(({ item }, index) => { if (!item || item.index <= previous) errors.push(`${index ? "## " : "# "}${specs[index].title}: missing or out of order`); else previous = item.index; });
  if (parsed[0].item && !parsed[0].item.title.slice("Verification: ".length).trim()) errors.push("# Verification: scope must be non-empty");
  parsed.slice(1).forEach(({ body }, i) => { if (!body) errors.push(`## ${specs[i + 1].title}: body must be non-empty`); });
  if (SENSITIVE.test(content)) errors.push("document: sensitive or unbounded evidence is forbidden");
  if (RECOGNIZABLE_CREDENTIAL.test(content)) errors.push("document: recognizable credential value is forbidden");
  if (hasForbiddenPath(content)) errors.push("document: machine-specific, home-relative, or parent-traversing paths are forbidden");
  const checks = definitionData(content);
  const checkHeadingMatches = [...content.matchAll(/^###\s+(CHECK-[^\n]*)$/gm)];
  const checkHeadings = checkHeadingMatches.map(match => match[1].trim());
  const checksStart = parsed[3].item?.end ?? -1;
  const reportStart = parsed[4].item?.index ?? -1;
  if (checkHeadingMatches.some(match => match.index < checksStart || match.index >= reportStart)) errors.push("checks: every check heading must be inside ## Checks and before ## Report");
  const validCheckHeadings = checkHeadings.map(heading => heading.match(/^(CHECK-[1-9]\d*):[ \t]+\S.*$/)).filter(Boolean);
  if (validCheckHeadings.length !== checkHeadings.length) errors.push("checks: every check heading must use CHECK-<positive integer>: <non-empty purpose>");
  if (!checks.length) errors.push("checks: at least one check with a non-empty purpose is required");
  const headingIds = validCheckHeadings.map(match => match[1]);
  if (new Set(headingIds).size !== headingIds.length) errors.push("checks: identifiers must be unique");
  for (const { id, body, fields: map } of checks) {
    const fields = [...body.matchAll(/^- ([^:]+):\s*(.*)$/gm)].map(m => [m[1], m[2]]);
    const expected = [...FIELDS];
    if (map.Safety === "mutating") expected.splice(2, 0, "Target environment", "Mutation", "Approval");
    if (map.Command === "none") expected.splice(expected.indexOf("Command") + 1, 0, "Procedure");
    if (map.Timeout === "none") expected.splice(expected.indexOf("Timeout") + 1, 0, "Stopping condition");
    if (fields.map(x => x[0]).join("\0") !== expected.join("\0")) errors.push(`${id}: fields must exactly match contract order`);
    for (const [name, value] of fields) if (!value.trim()) errors.push(`${id}.${name}: must be non-empty`);
    if (!["read-only", "mutating"].includes(map.Safety)) errors.push(`${id}.Safety: invalid`);
    if (!/^(?:none|[a-z0-9][a-z0-9-]*(?:, [a-z0-9][a-z0-9-]*)*)$/.test(map.Requires ?? "") || map.Requires?.split(", ").includes("none") && map.Requires !== "none") errors.push(`${id}.Requires: invalid`);
    if (map.Command !== "none" && (!/^`[^`\n]+`$/.test(map.Command ?? "") || !projectRelative(map.Command, { mode: "command", rejectUnbalanced: true }))) errors.push(`${id}.Command: must be project-relative inline code`);
    if (map.Command === "none" && !/^target `[^`]+`; action .+; maximum [1-9]\d* (?:steps|attempts|seconds|minutes); observe .+$/i.test(map.Procedure ?? "")) errors.push(`${id}.Procedure: explicit target, action, finite maximum, and observation required`);
    if (map.Timeout !== "none" && !/^[1-9]\d*[sm]$/.test(map.Timeout ?? "")) errors.push(`${id}.Timeout: must be positive`);
    if (map.Timeout === "none" && !/^stop after [1-9]\d* (?:steps|attempts|seconds|minutes) or when .+ is observed$/i.test(map["Stopping condition"] ?? "")) errors.push(`${id}.Stopping condition: finite bound and observable signal required`);
    if (!objective(map["Pass signal"])) errors.push(`${id}.Pass signal: objective observable signal required`);
    if (SENSITIVE.test(map.Evidence ?? "") || !hasPositiveBoundedEvidence(map.Evidence)) errors.push(`${id}.Evidence: must explicitly name bounded evidence and be non-sensitive`);
    if (map.Cleanup !== "none" && !cleanupIsObjective(map.Cleanup)) errors.push(`${id}.Cleanup: exact action, inline target, and correlated objective proof required`);
    if (map.Safety === "mutating") {
      if (map.Approval !== "explicit user approval required before execution") errors.push(`${id}.Approval: invalid`);
      if (!/^[a-z0-9][a-z0-9-]*(?:\s+[a-z0-9][a-z0-9-]*)+/i.test(map["Target environment"] ?? "") || !/^(?:create|write|modify|update|remove|delete|restore|stop|terminate|revert)s?\s+`[^`]+`/i.test(map.Mutation ?? "")) errors.push(`${id}: mutation metadata must name a concrete environment, action, and inline target`);
      if (map.Cleanup === "none") errors.push(`${id}.Cleanup: action and objective proof required`);
    }
  }
  return limited(errors);
}

export function validateReport(source, definitionSource) {
  const errors = [];
  if (!definitionSource) errors.push("definition: required for report validation");
  else for (const error of validateDefinition(definitionSource)) errors.push(`definition: ${error}`);
  const headingNames = ["Verification Report", "Environment and capabilities", "Blast radius", "Check results", "Evidence references", "Cleanup status", "Limitations and unsupported checks", "Verdict"];
  const specs = headingNames.map((title, i) => ({ level: i ? 2 : 1, title }));
  const parsed = markdownSections(source, specs);
  for (const { level, title } of specs) if ([...source.matchAll(new RegExp(`^#{${level}}[ \\t]+${title}[ \\t]*$`, "gm"))].length !== 1) errors.push(`${level === 1 ? "#" : "##"} ${title}: must appear exactly once`);
  let previous = -1; parsed.forEach(({ item }, i) => { if (!item || item.index <= previous) errors.push(`${i ? "## " : "# "}${headingNames[i]}: missing or out of order`); else previous = item.index; });
  parsed.forEach(({ body }, i) => { if (!body) errors.push(`${i ? "## " : "# "}${headingNames[i]}: body must be non-empty`); });
  if (SENSITIVE.test(source)) errors.push("report: sensitive or unbounded evidence is forbidden");
  if (RECOGNIZABLE_CREDENTIAL.test(source)) errors.push("report: recognizable credential value is forbidden");
  const metadataBody = parsed[0].item && parsed[1].item ? source.slice(parsed[0].item.end, parsed[1].item.index).trim() : "";
  const metadataMatch = metadataBody.match(/^- Target: (\S.*)\n- Scope: (\S.*)\n- Date: (\d{4}-\d{2}-\d{2})$/);
  if (!metadataMatch) errors.push("report metadata: Target, Scope, and Date must appear exactly beneath the H1");
  const metadata = metadataMatch ? { Target: metadataMatch[1], Scope: metadataMatch[2], Date: metadataMatch[3] } : {};
  for (const field of ["Target", "Scope", "Date"]) if ([...source.matchAll(new RegExp(`^- ${field}:`, "gm"))].length !== 1) errors.push(`${field}: must appear exactly once`);
  for (const field of ["Target", "Scope"]) if (metadata[field] && !projectRelative(metadata[field])) errors.push(`${field}: paths must be project-relative`);
  const blastFields = ["Affected paths", "Affected contracts", "Rollback scope"];
  const blastLines = [...parsed[2].body.matchAll(/^- ([^:]+):\s*(.*)$/gm)].map(match => [match[1], match[2]]);
  if (blastLines.map(([name]) => name).join("\0") !== blastFields.join("\0") || blastLines.some(([, value]) => !value)) errors.push("blast radius: fields must exactly match contract order");
  for (const [field, value] of blastLines) if (blastFields.includes(field) && !projectRelative(value)) errors.push(`${field}: paths must be project-relative`);
  for (const field of blastFields) if ([...source.matchAll(new RegExp(`^- ${field}:`, "gm"))].length !== 1) errors.push(`${field}: must appear exactly once`);
  const definitions = definitionSource ? definitionData(definitionSource.replace(/^---\n[\s\S]*?\n---\n/, "")) : [];
  const requiredCapabilities = [...new Set(definitions.flatMap(x => x.fields.Requires === "none" ? [] : (x.fields.Requires ?? "").split(", ")))];
  const capabilities = rows(parsed[1].body, TABLES.capabilities, "capabilities", errors, requiredCapabilities.length === 0);
  const results = rows(parsed[3].body, TABLES.results, "results", errors), evidence = rows(parsed[4].body, TABLES.evidence, "evidence", errors), cleanup = rows(parsed[5].body, TABLES.cleanup, "cleanup", errors);
  for (const [label, table] of [["capabilities", capabilities], ["results", results], ["evidence", evidence], ["cleanup", cleanup]]) {
    if (table.some(row => row.some(cell => SENSITIVE.test(cell) || !projectRelative(cell)))) errors.push(`${label}: every cell must be non-sensitive and project-relative`);
  }
  const limitations = parsed[6].body;
  if (!projectRelative(limitations)) errors.push("limitations: paths must be project-relative");
  if (!projectRelative(parsed[7].body)) errors.push("verdict: paths must be project-relative");
  const selectedIds = definitions.map(x => x.id), ids = results.map(r => r[0]), cleanupIds = cleanup.map(r => r[0]);
  const optionalMatch = metadata.Scope?.match(/(?:^|[.;]\s*)Optional checks: (CHECK-[1-9]\d*(?:, CHECK-[1-9]\d*)*)(?=[.;]|$)/);
  const optionalIds = new Set(optionalMatch ? optionalMatch[1].split(", ") : []);
  for (const id of optionalIds) if (!selectedIds.includes(id)) errors.push(`Scope: optional check ${id} is not in the definition`);
  for (const id of selectedIds) if (ids.filter(x => x === id).length !== 1) errors.push(`results: ${id} from definition must appear exactly once`);
  const extras = ids.filter(id => !selectedIds.includes(id));
  const occupied = new Set(selectedIds.map(id => Number(id.slice(6))));
  for (const id of extras) {
    let next = 1;
    while (occupied.has(next)) next++;
    if (id !== `CHECK-${next}` || !hasCheckToken(limitations, id)) errors.push(`${id}: additional checks must use the next unused identifier and be described in limitations`);
    occupied.add(Number(id.slice(6)));
  }
  for (const required of requiredCapabilities) if (capabilities.filter(r => r[0] === required).length !== 1) errors.push(`capability ${required}: must appear exactly once`);
  for (const [name, status, detail] of capabilities) {
    if (!requiredCapabilities.includes(name)) errors.push(`capability ${name}: not declared by definition`);
    if (!["available", "unavailable"].includes(status)) errors.push(`capability ${name}: invalid status`);
    if (SENSITIVE.test(detail) || !projectRelative(detail)) errors.push(`capability ${name}: unsafe evidence`);
    if (status === "unavailable") for (const id of definitions.filter(x => (x.fields.Requires ?? "").split(", ").includes(name)).map(x => x.id)) if (!results.some(r => r[0] === id && r[1] === "unsupported") || !limitations.includes(name) || !hasCheckToken(limitations, id)) errors.push(`capability ${name}: ${id} must be unsupported and named in limitations`);
  }
  if (new Set(ids).size !== ids.length) errors.push("results: duplicate checks");
  if (ids.join("\0") !== cleanupIds.join("\0")) errors.push("cleanup: check identities must match results");
  const refs = new Set(evidence.map(r => r[0]));
  for (const [id, status, grade, ref] of results) {
    if (!/^CHECK-[1-9]\d*$/.test(id) || !STATUSES.has(status) || !GRADES.has(grade)) errors.push(`${id}: invalid result`);
    if (!refs.has(ref.split(/\s/)[0])) errors.push(`${id}: missing evidence reference`);
    if (!projectRelative(ref)) errors.push(`${id}: evidence reference must be project-relative`);
    if (status === "pass" && !["measured", "observed"].includes(grade)) errors.push(`${id}: pass requires qualifying evidence`);
    const definition = definitions.find(x => x.id === id);
    const unavailable = (definition?.fields.Requires ?? "").split(", ").some(name => capabilities.some(r => r[0] === name && r[1] === "unavailable"));
    if (status === "unsupported" && !unavailable) errors.push(`${id}: unsupported requires an unavailable declared capability`);
    if (["skipped", "unsupported"].includes(status)) {
      const limitationLine = limitations.split("\n").find(line => hasCheckToken(line, id)) ?? "";
      if (!/\b(?:because|reason|due to|not run|unavailable|maintenance)\b/i.test(limitationLine)) errors.push(`${id}: ${status} requires a check-specific limitation and reason`);
    }
  }
  const evidenceDetails = new Map(evidence.map(([ref, , detail]) => [ref, detail]));
  for (const [id, status, , ref] of results) {
    const definition = definitions.find(item => item.id === id);
    const detail = evidenceDetails.get(ref.split(/\s/)[0]);
    if (status === "pass" && definition && (!detail || !evidenceEstablishes(definition.fields["Pass signal"], detail))) errors.push(`${id}: pass evidence does not establish the declared pass signal`);
  }
  for (const [id, required, status, detail] of cleanup) {
    if (!["not-required", "complete", "incomplete"].includes(status)) errors.push(`${id}: invalid cleanup status`);
    const declared = definitions.find(x => x.id === id)?.fields.Cleanup;
    if (declared !== undefined && required !== declared) errors.push(`${id}: cleanup requirement must match definition`);
    if (required === "none" && status !== "not-required" || required !== "none" && status === "not-required") errors.push(`${id}: cleanup requirement contradicts status`);
    const result = results.find(r => r[0] === id);
    if (required !== "none" && status === "incomplete" && result?.[1] !== "error") errors.push(`${id}: incomplete cleanup requires result status error`);
    if (required !== "none" && status === "complete") {
      const proof = evidenceDetails.get(detail) ?? detail;
      const target = required.match(/`([^`]+)`/)?.[1];
      const escapedTarget = target?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const completeProof = escapedTarget && new RegExp(
        `^\\\`${escapedTarget}\\\` (?:was|remains) (?:absent|gone|restored|stopped|terminated) (after (?:cleanup|removal|the action))(?:; no owned (?:state|process) remains \\1)?$`,
      );
      if (!completeProof?.test(proof)) errors.push(`${id}: complete cleanup requires exact-target affirmative evidence in the canonical sentence grammar`);
    }
    if (SENSITIVE.test(detail) || !projectRelative(detail)) errors.push(`${id}: unsafe cleanup evidence`);
  }
  for (const [, , detail] of evidence) if (SENSITIVE.test(detail) || !projectRelative(detail)) errors.push("evidence: bounded project-relative detail required");
  const verdictLines = parsed[7].body.split("\n").map(line => line.trim()).filter(Boolean);
  const verdict = verdictLines.length === 1 ? verdictLines[0].match(/^(PASS|FAIL|INCOMPLETE)\s+(?:—|-)\s+\S.+$/) : null;
  if (!verdict) errors.push("verdict: exactly one keyword and reason statement required"); else {
    const requiredResults = results.filter(([id]) => !optionalIds.has(id));
    const requiredStatuses = requiredResults.map(([, status]) => status);
    const cleanupStatuses = cleanup.map(([, , status]) => status);
    const requiredCleanupStatuses = cleanup.filter(([id]) => !optionalIds.has(id)).map(([, , status]) => status);
    const passCompatible = results.length && results.every(([id, status]) => status === "pass" || optionalIds.has(id) && ["skipped", "unsupported"].includes(status));
    if (verdict[1] === "PASS" && (!passCompatible || cleanupStatuses.includes("incomplete"))) errors.push("verdict: PASS contradicts results");
    if (verdict[1] === "FAIL" && !requiredStatuses.includes("fail")) errors.push("verdict: FAIL requires a required check failure");
    if (verdict[1] === "INCOMPLETE" && (requiredStatuses.includes("fail") || !requiredStatuses.some(status => ["error", "skipped", "unsupported"].includes(status)) && !requiredCleanupStatuses.includes("incomplete"))) errors.push("verdict: INCOMPLETE contradicts results");
  }
  return limited(errors);
}

async function main() {
  const [kind, path, flag, definitionPath] = process.argv.slice(2);
  if (!["definition", "report"].includes(kind) || !path || (kind === "report" && (flag !== "--definition" || !definitionPath))) { console.error("usage: validate-verification.mjs definition <path> | report <path> --definition <path>"); process.exitCode = 2; return; }
  try { const source = await readFile(path, "utf8"); const definition = kind === "report" ? await readFile(definitionPath, "utf8") : undefined; const errors = kind === "definition" ? validateDefinition(source) : validateReport(source, definition); if (errors.length) { for (const error of errors) console.error(`validation error: ${error}`); process.exitCode = 1; } else console.log(`${kind} valid`); } catch (error) { console.error(`validation error: unable to read input (${error.code ?? "unknown error"})`); process.exitCode = 1; }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
