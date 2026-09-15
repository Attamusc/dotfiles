import { readFileSync } from "node:fs";
import { Lexer, lexer } from "../vendor/marked-18.0.5/marked.esm.js";

const entities = JSON.parse(readFileSync(new URL("../vendor/html5-entities.json", import.meta.url), "utf8"));
export const MAX_MARKDOWN_BYTES = 128 * 1024;
const MAX_TOKENS = 20_000;

function decodeHtml(text) {
  for (let previous = "", passes = 0; text !== previous;) {
    if (++passes > 8) throw Error("markdown entity normalization budget exceeded");
    previous = text;
    text = text.replace(/&(?:#([0-9]+);?|#x([0-9a-f]+);?|([a-z][a-z0-9]+;?))/gi, (raw, decimal, hex, named) => {
      if (decimal || hex) {
        let point = Number.parseInt(decimal ?? hex, decimal ? 10 : 16);
        if (!point || point > 0x10ffff || point >= 0xd800 && point <= 0xdfff) point = 0xfffd;
        return String.fromCodePoint(point);
      }
      return Object.hasOwn(entities, named) ? entities[named] : raw;
    });
  }
  return text;
}

function htmlText(raw) {
  if (/^\s*<(?:script|style|template|noscript|head|title)\b/i.test(raw) || /^\s*<!--/.test(raw)) return "";
  return decodeHtml(raw.replace(/<[^>]*>/g, ""));
}

function check(budget) { if (++budget.count > MAX_TOKENS) throw Error("markdown token budget exceeded"); }
function tokenText(tokens, separator, budget) {
  let output = "";
  for (const token of tokens ?? []) {
    check(budget);
    switch (token.type) {
      case "space": case "br": output += separator; break;
      case "def": case "image": break;
      case "html": output += htmlText(token.raw ?? token.text ?? ""); break;
      case "code": case "codespan": output += token.text ?? ""; break;
      case "text": case "escape": output += token.tokens ? tokenText(token.tokens, separator, budget) : decodeHtml(token.text ?? ""); break;
      default: output += token.tokens ? tokenText(token.tokens, separator, budget) : typeof token.text === "string" ? decodeHtml(token.text) : "";
    }
  }
  return output;
}
function tokensFor(source, links) {
  if (links) { const context = new Lexer({ gfm: true, breaks: false }); context.tokens.links = links; return context.inlineTokens(source); }
  return /\r?\n|^\s{0,3}\[[^\]]+\]:/m.test(source) ? lexer(source, { gfm: true, breaks: false }) : Lexer.lexInline(source, { gfm: true, breaks: false });
}
function assertBudget(source) { if (Buffer.byteLength(source) > MAX_MARKDOWN_BYTES) throw Error("markdown input budget exceeded"); }
export function markdownDocumentContext(value) { const source = String(value); assertBudget(source); return lexer(source, { gfm: true, breaks: false }).links; }
export function markdownProjection(value, separator = "", links) { const source = String(value); assertBudget(source); return tokenText(tokensFor(source, links), separator, { count: 0 }); }

// Security views are independent observable contexts.  Deliberately do not join
// attributes, hidden HTML, code literals, and browser text: joining them invents values.
function attributes(raw) {
  const values = [];
  for (const match of raw.matchAll(/\s[\w:-]+\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) values.push(decodeHtml(match[1] ?? match[2] ?? match[3] ?? ""));
  return values;
}
function securityViews(tokens, budget, views, browser) {
  for (const token of tokens ?? []) {
    check(budget);
    if (token.type === "code" || token.type === "codespan") { views.push(token.text ?? ""); continue; }
    if (token.type === "html") { const raw = token.raw ?? token.text ?? ""; views.push(raw, decodeHtml(raw), ...attributes(raw)); const visible = htmlText(raw); if (visible) browser.push(visible); continue; }
    if (typeof token.href === "string") views.push(decodeHtml(token.href));
    if (typeof token.title === "string") views.push(decodeHtml(token.title));
    if (token.tokens) securityViews(token.tokens, budget, views, browser);
    else if (typeof token.text === "string") browser.push(decodeHtml(token.text));
  }
}
export function markdownSecurityProjection(value, links) {
  const source = String(value); assertBudget(source);
  // Strip terminal sequences only. LF, CR, and tabs are Markdown/whitespace semantics.
  const controls = source.replace(/(?:\x1b[P\^_X]|[\x90\x98\x9e\x9f])[\s\S]*?(?:(?:\x1b\\|\x9c)|$)/g, "").replace(/(?:\x1b\]|\x9d)[\s\S]*?(?:(?:\x07|\x1b\\|\x9c)|$)/g, "").replace(/(?:\x1b\[|\x9b)[0-?]*[ -/]*(?:[@-~]|$)/g, "").replace(/\x1b[ -/]*[@-~]/g, "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, "");
  const terminalPayloads = [...source.matchAll(/(?:\x1b\]|\x9d)[^;]*;([\s\S]*?)(?:\x07|\x1b\\|\x9c)/g)].map(match => decodeHtml(match[1]));
  const views = [source, controls, ...terminalPayloads];
  // A browser-visible value may span inline siblings, never rendered blocks.
  // Code literals are their own observable context and are not joined to prose.
  const budget = { count: 0 }, tokens = tokensFor(controls, links);
  const blocks = /\r?\n|^\s{0,3}\[[^\]]+\]:/m.test(controls) ? tokens.map(token => [token]) : [tokens];
  for (const block of blocks) {
    const browser = [];
    securityViews(block, budget, views, browser);
    if (browser.length) views.unshift(browser.join(""));
  }
  return views;
}
