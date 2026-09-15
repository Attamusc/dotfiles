import { execFileSync } from "node:child_process";
import { accessSync, constants, lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { devNull } from "node:os";

export const LIMIT = 16 * 1024;
export const KINDS = new Set(["path", "symbol", "behavior", "decision"]);
export const secretPattern = /-----BEGIN ([A-Z ]*PRIVATE KEY)-----[\s\S]*?-----END \1-----|\b(?:authorization\s*:\s*)?(?:Bearer|Basic)\s+[A-Za-z0-9+/_.=-]+|\b[a-z][a-z0-9+.-]*:\/\/[^\s/@]*:[^\s/@]+@|\b(?:AKIA|ASIA|gh[pousr]_|github_pat_|sk-)[A-Za-z0-9_-]+|\b[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|ACCESS_KEY)[A-Z0-9_]*\s*=\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s]+)/gi;

const SYSTEM_GIT = "/usr/bin/git";
const CHILD_PATH = "/usr/bin:/bin";

export function git(repo, args, maxBuffer = 1024 * 1024) {
  accessSync(SYSTEM_GIT, constants.X_OK);
  const env = { PATH: CHILD_PATH, LANG: "C", LC_ALL: "C", GIT_OPTIONAL_LOCKS: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_SYSTEM: devNull, GIT_CONFIG_GLOBAL: devNull, GIT_ATTR_NOSYSTEM: "1" };
  return execFileSync(SYSTEM_GIT, ["--literal-pathspecs", "-c", "core.fsmonitor=false", ...args], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer, env });
}

export function repositoryRoot(input) {
  const candidate = realpathSync(input);
  if (!lstatSync(candidate).isDirectory()) throw new Error("invalid repository");
  if (git(candidate, ["rev-parse", "--is-inside-work-tree"]).trim() !== "true") throw new Error("invalid repository");
  return realpathSync(git(candidate, ["rev-parse", "--show-toplevel"]).trim());
}

export function containedPath(repo, literal, mustExist = true) {
  if (!literal || isAbsolute(literal) || literal.includes("\0")) throw new Error("invalid target");
  const prohibited = value => /(?:^|\/)\.pi\/(?:agent\/)?(?:sessions|transcripts?|cache|indexes?|persistence)(?:\/|$)/i.test(value) || /^(?:sessions|transcripts?|cache|indexes?|persistence)(?:\/|$)/i.test(value) || /(?:^|\/)CONTEXT\.md$/i.test(value);
  if (prohibited(literal)) throw new Error("prohibited source root");
  const candidate = resolve(repo, literal);
  const rel = relative(repo, candidate);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error("invalid target");
  if (!mustExist) return { absolute: candidate, relative: rel.split(sep).join("/") };
  const actual = realpathSync(candidate);
  const actualRel = relative(repo, actual);
  if (actualRel === ".." || actualRel.startsWith(`..${sep}`) || isAbsolute(actualRel) || !lstatSync(actual).isFile()) throw new Error("invalid target");
  if (prohibited(actualRel.split(sep).join("/"))) throw new Error("prohibited source root");
  return { absolute: actual, relative: rel.split(sep).join("/"), canonicalRelative: actualRel.split(sep).join("/") };
}

export function parseArgs(argv, allowed) {
  const result = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!allowed.has(key) || i + 1 >= argv.length || result[key] !== undefined) throw new Error("invalid arguments");
    result[key] = argv[i + 1];
  }
  return result;
}

export function boundedItems(path, maxItems = 400, maxItemBytes = 2048) {
  const text = readFileSync(path, "utf8");
  const all = text.split(/\r?\n/);
  if (all.at(-1) === "") all.pop();
  const selected = all.slice(0, maxItems);
  const items = []; let oversized = 0;
  selected.forEach((value, index) => {
    if (Buffer.byteLength(value) > maxItemBytes) oversized++;
    else items.push({ text: value, line: index + 1 });
  });
  return { items, omitted: Math.max(0, all.length - maxItems), oversized };
}

function redactionKind(match) {
  if (/PRIVATE KEY/.test(match)) return "private-key";
  if (/:\/\//.test(match)) return "credential-url";
  if (/(?:SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|ACCESS_KEY)/i.test(match)) return "secret-assignment";
  if (/^(?:gh|github_pat_|sk-|AKIA|ASIA)/i.test(match)) return "token";
  return "credential";
}

export function redact(value, counts = new Map()) {
  return String(value).replace(secretPattern, match => {
    const kind = redactionKind(match);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
    return `[REDACTED:${kind}]`;
  });
}

export function redactWithTaint(value, counts = new Map()) {
  const input = String(value), redacted = redact(input, counts);
  return { value: redacted, tainted: redacted !== input };
}

export function redactedLines(value) {
  const raw = String(value), lines = raw.split(/\r?\n/), matches = [];
  secretPattern.lastIndex = 0;
  for (const match of raw.matchAll(secretPattern)) {
    const from = raw.slice(0, match.index).split(/\r?\n/).length;
    matches.push({ start: match.index, end: match.index + match[0].length, from, to: from + (match[0].match(/\r?\n/g)?.length ?? 0), marker: `[REDACTED:${redactionKind(match[0])}]` });
  }
  const groups = [];
  for (const match of matches) {
    const group = groups.at(-1);
    if (group && match.from <= group.to) { group.matches.push(match); group.to = Math.max(group.to, match.to); }
    else groups.push({ from: match.from, to: match.to, matches: [match] });
  }
  const lineStarts = [0];
  for (let i = 0; i < raw.length; i++) if (raw[i] === "\n") lineStarts.push(i + 1);
  const items = [];
  for (let line = 1; line <= lines.length;) {
    const group = groups.find(x => x.from === line);
    if (!group) { items.push({ text: lines[line - 1], from: line, to: line }); line++; continue; }
    const start = lineStarts[group.from - 1], next = lineStarts[group.to] ?? raw.length;
    const end = next > 0 && raw[next - 1] === "\n" ? next - 1 : next;
    let cursor = start, text = "";
    for (const match of group.matches) {
      const removed = raw.slice(match.start, match.end);
      text += raw.slice(cursor, match.start) + match.marker + "\n".repeat(removed.match(/\n/g)?.length ?? 0);
      cursor = match.end;
    }
    text += raw.slice(cursor, end).replace(/\r$/, "");
    items.push({ text, from: group.from, to: group.to });
    line = group.to + 1;
  }
  if (items.at(-1)?.text === "" && raw.endsWith("\n")) items.pop();
  return items;
}

export function safeDiagnostic(message = "request failed") {
  const text = `error: ${message}\n`;
  process.stderr.write(text.length <= 256 ? text : "error: request failed\n");
}
