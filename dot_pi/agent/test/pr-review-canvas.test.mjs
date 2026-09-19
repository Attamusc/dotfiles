import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { buildHtml, normalizeFeedbackSources, normalizeIterationReport, renderMarkdown, validateReview } from "../../../dot_agents/skills/pr-review-canvas/scripts/review-document.mjs";
import { presentWithGlimpse } from "../../../dot_agents/skills/pr-review-canvas/scripts/glimpse-adapter.mjs";

function review() {
  return { schemaVersion: 1, sourceNotes: ["Synthetic fixture; bounded gh fields only."], pr: { number: 42, url: "https://github.com/example/repo/pull/42", title: "Escape <script>", author: "octo", state: "OPEN", base: "main", head: "topic", additions: 4, deletions: 1, changedFiles: 3 }, scope: "Whole PR at the explicitly supplied URL.", summary: ["Changes one behavior."], changeGroups: ["core", "wiring", "mechanical"].map((id, i) => ({ id, title: ["Core logic", "Wiring & integration", "Mechanical"][i], reviewerIntent: "Review this group.", files: [{ path: `${id}.js`, status: "modified", additions: 1, deletions: 0, why: "Needed.", annotation: "Check <img src=x onerror=alert(1)>.", risk: "Bounded.", pseudocode: ["return safely"], patch: "+const x = '</script><script>alert(1)</script>'" }] })), fileCoverage: { total: 3, represented: 3, omitted: 0, complete: true }, checks: { summary: { total: 1, passed: 0, failed: 0, pending: 1 }, items: [{ name: "ci", status: "pending", source: "check 1" }] }, feedback: { high: [{ source: "thread", author: "reviewer", body: "Inspect it.", path: "core.js", line: 1, originalLine: null, threadId: "T1", isResolved: false, locationStatus: "current" }], medium: [], low: [], bot: [], resolved: [] }, iteration: { maxPasses: 6, reason: "Checks pending", history: [{ pass: 1, legacyStatus: "PENDING", structuredStatus: "unknown", agreement: "unavailable", diagnostics: ["structured outcome missing"], outcome: "missing" }] }, blockers: ["CI pending."], nextAction: "Wait for CI.", limitations: ["Synthetic data only."], provenance: { inspiredBy: "cursor/plugins PR Review Canvas", commit: "889ec4b68fa5aab0e867dad71ec3fdf386ae48f3", license: "MIT", adaptation: "Markdown first; no Canvas server." } };
}
const observation = (status, code, summary = `${code} summary`, soleToolBatch = true) => ({ kind: "reported", soleToolBatch, value: { protocol: "agent-task-outcome", version: 1, status, code, summary } });
const record = (status, taskOutcomeObservation, pass = 1) => ({ pass, status, structuredStatus: "unknown", agreement: "unavailable", taskOutcomeObservation, ok: true });

function fakeGlimpse(sequence) {
  let window;
  return { module: { getNativeHostInfo: () => ({ platform: "fake" }), open: () => { window = new EventEmitter(); window.closeCalls = 0; window.close = () => { window.closeCalls++; window.emit("closed"); }; queueMicrotask(() => sequence(window)); return window; } }, window: () => window };
}

test("valid document projects every required field and escapes hostile HTML", () => {
  const input = review(); assert.deepEqual(validateReview(input), []);
  const markdown = renderMarkdown(input), html = buildHtml(input);
  for (const heading of ["PR and scope", "Summary", "Core logic", "Wiring & integration", "Mechanical", "Checks", "Categorized feedback", "Iteration history and diagnostics", "Blockers and next action", "Limitations", "Evidence and source notes", "Provenance"]) assert.match(markdown, new RegExp(`## ${heading}`));
  for (const evidence of ["3/3 represented", "check 1", "core.js:1", "source: thread", "resolved: false", "thread: T1", "return safely", "Checks pending", "missing", "Markdown first"]) assert.match(html, new RegExp(evidence));
  assert.doesNotMatch(html, /<img src=x|<script>alert\(1\)<\/script>/); assert.match(html, /&lt;\/script&gt;&lt;script&gt;alert/);
});

test("normalizes actual iterate-pr history and derives all diagnostics", () => {
  const cases = [
    ["PENDING", observation("incomplete", "checks-pending"), "PENDING", "agree", "structured and legacy agree"],
    ["BLOCKED", observation("blocked", "human-required"), "BLOCKED", "agree", "structured and legacy agree"],
    ["NO_PR", observation("failed", "no-pr"), "NO_PR", "agree", "structured and legacy agree"],
    ["GREEN", { kind: "invalid", code: "missing", message: "missing" }, "unknown", "unavailable", "structured outcome missing"],
    ["GREEN", { kind: "invalid", code: "malformed", message: "bad" }, "unknown", "unavailable", "structured outcome malformed"],
    ["GREEN", { kind: "invalid", code: "duplicate", message: "twice" }, "unknown", "unavailable", "structured outcome duplicate"],
    ["PENDING", observation("incomplete", "checks-pending", "pending", false), "PENDING", "agree", "structured outcome non-sole"],
    ["GREEN", observation("incomplete", "checks-pending", "pending", false), "PENDING", "disagree", "structured outcome non-sole"],
    ["unknown", observation("succeeded", "ci-green", "reported with unknown legacy"), "GREEN", "unavailable", "legacy status unavailable"],
    ["unknown", { kind: "invalid", code: "missing", message: "missing" }, "unknown", "unavailable", "legacy status unavailable"],
    ["unknown", { kind: "invalid", code: "malformed", message: "malformed" }, "unknown", "unavailable", "legacy status unavailable"],
    ["unknown", observation("succeeded", "checks-pending", "invalid pair"), "unknown", "unavailable", "legacy status unavailable"],
    ["GREEN", observation("succeeded", "checks-pending"), "unknown", "invalid-domain", "invalid-domain pair"],
    ["GREEN", observation("incomplete", "checks-pending"), "PENDING", "disagree", "disagreement"],
  ];
  for (const [legacy, observed, structured, agreement, diagnostic] of cases) { const raw = record(legacy, observed); raw.structuredStatus = structured; raw.agreement = agreement; const normalized = normalizeIterationReport({ reason: legacy, history: [raw] }); assert.equal(normalized.history[0].legacyStatus, legacy); assert.equal(normalized.history[0].structuredStatus, structured); assert.equal(normalized.history[0].agreement, agreement); assert.match(normalized.history[0].diagnostics.join("; "), new RegExp(diagnostic)); if (observed.kind === "reported") assert.equal(normalized.history[0].outcome, observed.value.summary); const document = review(); document.iteration = normalized; assert.deepEqual(validateReview(document), []); }
  for (const [observed, agreement, expected] of [[{ kind: "invalid", code: "missing", message: "missing" }, "unavailable", ["legacy status unavailable", "structured outcome missing"]], [{ kind: "invalid", code: "malformed", message: "malformed" }, "unavailable", ["legacy status unavailable", "structured outcome malformed"]], [observation("succeeded", "checks-pending", "invalid pair"), "unavailable", ["legacy status unavailable", "structured outcome invalid-domain pair"]]]) { const raw = record("unknown", observed); raw.structuredStatus = "unknown"; raw.agreement = agreement; const normalized = normalizeIterationReport({ reason: "unknown", history: [raw] }); assert.deepEqual(normalized.history[0].diagnostics, expected); const document = review(); document.iteration = normalized; assert.deepEqual(validateReview(document), []); }
  for (const legacy of ["GREEN", "FAILING", "PENDING", "BLOCKED", "NO_PR", "unknown"]) for (const soleToolBatch of [true, false]) {
    const raw = record(legacy, observation("succeeded", "checks-pending", "invalid workflow-shaped entry", soleToolBatch)); raw.agreement = legacy === "unknown" ? "unavailable" : "invalid-domain";
    const normalized = normalizeIterationReport({ reason: legacy, history: [raw] });
    assert.equal(normalized.history[0].structuredStatus, "unknown"); assert.equal(normalized.history[0].agreement, legacy === "unknown" ? "unavailable" : "invalid-domain");
    assert.deepEqual(normalized.history[0].diagnostics, [...(legacy === "unknown" ? ["legacy status unavailable"] : []), "structured outcome invalid-domain pair", ...(!soleToolBatch ? ["structured outcome non-sole tool batch"] : [])]);
    const document = review(); document.iteration = normalized; assert.deepEqual(validateReview(document), []);
  }
  const contradictory = record("GREEN", observation("succeeded", "ci-green")); contradictory.agreement = "disagree"; assert.throws(() => normalizeIterationReport({ reason: "x", history: [contradictory] }), /contradicts/);
});

test("validation is total and rejects hostile types, bounds, and contradictory fields", () => {
  for (const hostile of [null, [], { changeGroups: [null] }, { pr: { additions: "<img>" } }, { feedback: { high: [7] } }]) assert.doesNotThrow(() => validateReview(hostile));
  const numeric = review(); numeric.pr.additions = "</title><script>x</script>"; assert.match(validateReview(numeric).join("\n"), /pr.additions/);
  const prose = review(); prose.checks.items[0].source = "x".repeat(8001); assert.match(validateReview(prose).join("\n"), /source/);
  const pass = review(); pass.iteration.history[0].pass = Infinity; assert.match(validateReview(pass).join("\n"), /positive integer/);
  const pseudo = review(); pseudo.changeGroups[0].files[0].pseudocode = Array(41).fill("x"); assert.match(validateReview(pseudo).join("\n"), /pseudocode/);
  const huge = review(); huge.changeGroups[0].files = Array.from({ length: 100 }, (_, i) => ({ ...huge.changeGroups[0].files[0], path: `${i}.js`, patch: "x".repeat(3000) })); huge.changeGroups[1].files = []; huge.changeGroups[2].files = []; huge.pr.changedFiles = 100; huge.fileCoverage = { total: 100, represented: 100, omitted: 0, complete: true }; assert.match(validateReview(huge).join("\n"), /output: bounded/);
});

test("PR identity, pass sequence, cap, and agreement invariants are exact", () => {
  const mismatch = review(); mismatch.pr.url = "https://github.com/example/repo/pull/43"; assert.match(validateReview(mismatch).join("\n"), /canonical credential-free/);
  for (const url of ["https://github.com/example/repo/pull/42?x=)", "https://github.com/example/repo/pull/42#x", "https://user@github.com/example/repo/pull/42", "https://github.com:443/example/repo/pull/42", "https://github.com/example/repo/pull/42\n)"]) { const input = review(); input.pr.url = url; assert.match(validateReview(input).join("\n"), /canonical credential-free/); }
  for (const passes of [[2], [1, 1], [1, 3]]) { const input = review(); input.iteration.history = passes.map((pass, i) => ({ ...input.iteration.history[0], pass, outcome: String(i) })); assert.match(validateReview(input).join("\n"), /sequential|duplicate/); }
  const aboveCap = review(); aboveCap.iteration.maxPasses = 1; aboveCap.iteration.history = [aboveCap.iteration.history[0], { ...aboveCap.iteration.history[0], pass: 2 }]; assert.match(validateReview(aboveCap).join("\n"), /exceeds maxPasses/);
  const probes = [
    ["GREEN", "GREEN", "disagree", "ordinary"],
    ["GREEN", "PENDING", "agree", "ordinary"],
    ["GREEN", "unknown", "invalid-domain", "structured outcome missing"],
    ["GREEN", "unknown", "unavailable", "structured outcome invalid-domain pair"],
  ];
  for (const [legacyStatus, structuredStatus, agreement, diagnostic] of probes) { const input = review(); Object.assign(input.iteration.history[0], { legacyStatus, structuredStatus, agreement, diagnostics: [diagnostic] }); assert.match(validateReview(input).join("\n"), /agreement: contradicts/); }
  const validInvalid = review(); Object.assign(validInvalid.iteration.history[0], { legacyStatus: "GREEN", structuredStatus: "unknown", agreement: "invalid-domain", diagnostics: ["structured outcome invalid-domain pair"] }); assert.deepEqual(validateReview(validInvalid), []);
  const duplicateFile = review(); duplicateFile.changeGroups[1].files[0].path = duplicateFile.changeGroups[0].files[0].path; assert.match(validateReview(duplicateFile).join("\n"), /duplicate across change groups/);
  const emptyOutcome = review(); emptyOutcome.iteration.history[0].outcome = ""; assert.match(validateReview(emptyOutcome).join("\n"), /outcome: bounded non-empty/);
  const badDiagnostic = review(); badDiagnostic.iteration.history[0].diagnostics = ["structured and legacy agree"]; assert.match(validateReview(badDiagnostic).join("\n"), /diagnostics:.*contradict/);
  const badCoverage = review(); badCoverage.fileCoverage.omitted = 1; assert.match(validateReview(badCoverage).join("\n"), /fileCoverage/);
  const largeCoverage = review(); largeCoverage.pr.changedFiles = 101; largeCoverage.fileCoverage = { total: 101, represented: 3, omitted: 98, complete: false }; assert.match(validateReview(largeCoverage).join("\n"), /must represent 100/);
});

test("Markdown renders hostile text inert with adaptive spans and fences", () => {
  const input = review(); const hostile = '<b>x</b>\n# heading\n- list\n[link](javascript:alert(1)) **bold** `tick`';
  input.pr.title = hostile; input.summary = [hostile]; input.feedback.high[0].body = hostile; input.changeGroups[0].files[0].path = "odd`path.md"; input.changeGroups[0].files[0].pseudocode = ["```", hostile]; input.changeGroups[0].files[0].patch = "+```diff\n+</script>";
  const markdown = renderMarkdown(input);
  assert.ok(markdown.includes("\\<b\\>x\\</b\\> \\# heading \\- list \\[link\\]\\(javascript"));
  assert.match(markdown, /``odd`path\.md``/);
  assert.match(markdown, /````text\n```/);
  assert.match(markdown, /````diff\n\+```diff/);
  assert.match(markdown, /\*\*Status:\*\* modified/);
  const multiline = review(); multiline.pr.base = "main\\literal\r\n# injected"; multiline.pr.head = "topic\n<div>raw</div>"; multiline.changeGroups[0].files[0].path = "src\\name\n# file-heading"; multiline.feedback.high[0].path = "src/review\r\n<div>feedback</div>";
  const inert = renderMarkdown(multiline);
  assert.ok(inert.includes(String.raw`main\\literal\r\n# injected`)); assert.ok(inert.includes(String.raw`topic\n<div>raw</div>`)); assert.ok(inert.includes(String.raw`src\\name\n# file-heading`)); assert.ok(inert.includes(String.raw`src/review\r\n<div>feedback</div>`));
  assert.doesNotMatch(inert, /\r/); assert.doesNotMatch(inert, /^# (?:injected|file-heading)$/m); assert.doesNotMatch(inert, /^<div>/m);
});

test("feedback normalization deduplicates globally before the cap", () => {
  const duplicate = { author: "same", body: "same", path: "a.js", line: 1, threadId: "T", isResolved: false, locationStatus: "current" };
  const unique = { author: "unique", body: "unique" };
  const normalized = normalizeFeedbackSources({ thread: { items: Array(200).fill(duplicate), total: 200, fetched: 200, omitted: 0 }, review: { items: [], total: 0, fetched: 0, omitted: 0 }, conversation: { items: [unique], total: 2, fetched: 1, omitted: 1 } });
  assert.equal(normalized.items.length, 2); assert.equal(normalized.diagnostics.duplicates, 199); assert.equal(normalized.diagnostics.truncated, 0); assert.equal(normalized.diagnostics.sourceOmitted, 1); assert.equal(normalized.items[1].author, "unique");
  const capped = normalizeFeedbackSources({ thread: { items: Array.from({ length: 201 }, (_, i) => ({ ...duplicate, body: String(i) })), total: 201, fetched: 201, omitted: 0 }, review: { items: [], total: 0, fetched: 0, omitted: 0 }, conversation: { items: [], total: 0, fetched: 0, omitted: 0 } }); assert.equal(capped.items.length, 200); assert.equal(capped.diagnostics.truncated, 1);
});

test("feedback source state and resolution are typed and projected", () => {
  const input = review();
  input.feedback.medium = [{ source: "review", author: "owner", body: "Revise.", reviewState: "CHANGES_REQUESTED" }];
  input.feedback.low = [{ source: "conversation", author: "reader", body: "Question." }];
  assert.deepEqual(validateReview(input), []);
  for (const projection of [renderMarkdown(input), buildHtml(input)]) { assert.match(projection, /source: review/); assert.match(projection, /review state: CHANGES\\?_REQUESTED/); assert.match(projection, /source: thread/); assert.match(projection, /resolved: false/); }
  const invalidState = review(); invalidState.feedback.high[0].reviewState = "APPROVED"; assert.match(validateReview(invalidState).join("\n"), /not valid for thread source/);
  const missingResolution = review(); delete missingResolution.feedback.high[0].isResolved; assert.match(validateReview(missingResolution).join("\n"), /isResolved: required/);
  const unknownSource = review(); unknownSource.feedback.high[0].source = "inline"; assert.match(validateReview(unknownSource).join("\n"), /source: invalid/);
  const outdated = review(); Object.assign(outdated.feedback.high[0], { line: null, originalLine: 7, locationStatus: "outdated" }); assert.deepEqual(validateReview(outdated), []); for (const projection of [renderMarkdown(outdated), buildHtml(outdated)]) { assert.match(projection, /location: outdated/); assert.match(projection, /original line: 7/); }
  const unavailable = review(); Object.assign(unavailable.feedback.high[0], { line: null, originalLine: null, locationStatus: "unavailable", locationNote: "GitHub supplied no location." }); assert.deepEqual(validateReview(unavailable), []); for (const projection of [renderMarkdown(unavailable), buildHtml(unavailable)]) { assert.match(projection, /current line: unavailable/); assert.match(projection, /original line: unavailable/); assert.match(projection, /location note: GitHub/); }
  const missingLine = review(); delete missingLine.feedback.high[0].line; assert.match(validateReview(missingLine).join("\n"), /line: required/);
  const missingOriginal = review(); delete missingOriginal.feedback.high[0].originalLine; assert.match(validateReview(missingOriginal).join("\n"), /originalLine: required/);
});

test("null and empty patches render explicit unavailable marker", () => {
  for (const patch of [null, ""]) { const input = review(); input.changeGroups[0].files[0].patch = patch; assert.deepEqual(validateReview(input), []); assert.match(renderMarkdown(input), /Patch unavailable/); assert.match(buildHtml(input), /Patch unavailable/); }
});

test("missing module and headless host preserve canonical Markdown", async () => {
  const input = review(), markdown = renderMarkdown(input), dir = await mkdtemp(join(tmpdir(), "review-canvas-")), path = join(dir, "review.md"); await writeFile(path, markdown);
  const missing = await presentWithGlimpse(input, { modulePath: join(dir, "missing.mjs"), platform: "darwin" }); assert.equal(missing.status, "unsupported"); assert.match(missing.reason, /module/i);
  const headless = await presentWithGlimpse(input, { platform: "linux", env: {} }); assert.match(headless.reason, /headless/); assert.equal(await readFile(path, "utf8"), markdown);
});

test("Glimpse readiness clears timeout and waits indefinitely for user close", async () => {
  const fake = fakeGlimpse(window => window.emit("message", { type: "render-ready" }));
  const pending = presentWithGlimpse(review(), { platform: "darwin", module: fake.module, timeoutMs: 5 });
  assert.equal(await Promise.race([pending.then(() => "settled"), new Promise(resolve => setTimeout(() => resolve("open"), 20))]), "open");
  assert.equal(fake.window().closeCalls, 0);
  fake.window().emit("closed");
  assert.deepEqual(await pending, { status: "displayed", platform: "fake" });
});

test("Glimpse early close, render error, and timeout degrade explicitly", async () => {
  const early = fakeGlimpse(window => window.emit("closed")); assert.match((await presentWithGlimpse(review(), { platform: "darwin", module: early.module, timeoutMs: 50 })).reason, /before render-ready/);
  const error = fakeGlimpse(window => window.emit("error", new Error("boom"))); assert.match((await presentWithGlimpse(review(), { platform: "darwin", module: error.module, timeoutMs: 50 })).reason, /boom/); assert.equal(error.window().closeCalls, 1);
  const timeout = fakeGlimpse(() => {}); assert.match((await presentWithGlimpse(review(), { platform: "darwin", module: timeout.module, timeoutMs: 5 })).reason, /timed out/); assert.equal(timeout.window().closeCalls, 1);
});

test("collection, Advisor, and provenance constraints are explicit", async () => {
  const root = resolve(import.meta.dirname, "../../..");
  const skill = await readFile(join(root, "dot_agents/skills/pr-review-canvas/SKILL.md"), "utf8");
  assert.doesNotMatch(skill, /--slurp/); assert.equal(skill.match(/jq -cn --argjson max/g)?.length, 5); assert.equal(skill.match(/reduce inputs as/g)?.length, 5); assert.doesNotMatch(skill, /\[0:100\]/); assert.match(skill, /gh pr checks[^\n]+--jq '\.\[\]'/); assert.match(skill, /--repo "\$REPO"/); assert.match(skill, /Do not use current-directory iterate-pr helper scripts/);
  assert.match(skill, /reviewThreads\(first:100/); assert.match(skill, /comments\(first:100\).*totalCount/); assert.match(skill, /commentPageInfo:pageInfo/); const query = skill.match(/^QUERY='([^']+)'$/m)?.[1] ?? ""; assert.equal(query.match(/(?<!:)pageInfo\{/g)?.length, 1); assert.ok(query.indexOf("commentPageInfo:pageInfo{") < query.indexOf("}pageInfo{")); assert.match(skill, /\.comments\.commentPageInfo\.hasNextPage/); assert.match(skill, /nestedOmitted/); assert.match(skill, /originalLine/); assert.match(skill, /normalizeFeedbackSources/); assert.match(skill, /\.total \+= 1/); assert.match(skill, /\.omitted=\(\.total-\.fetched\)/); assert.match(skill, /parent `threadId`/); assert.match(skill, /PRRC_….*PRRT_…/); assert.doesNotMatch(skill, /repos\/\$REPO\/pulls\/\$NUMBER\/comments/);
  const agents = await readFile(join(root, "dot_pi/agent/AGENTS.md"), "utf8");
  for (const phrase of ["user-invoked only", "read-only", "current session", "roughly four consultations", "Never forward transcript bodies", "automatic triggers", "hooks", "nudges", "advisor state", "persistent log", "Durable writes require a separate explicit user request"]) assert.match(agents, new RegExp(phrase));
  const provenance = await readFile(join(root, "dot_agents/skills/pr-review-canvas/UPSTREAM.md"), "utf8"); assert.doesNotMatch(provenance, /\/plugins\/cursor-team-kit/); assert.match(provenance, /88a07a2459/);
  assert.match(await readFile(join(root, "dot_agents/skills/pr-review-canvas/LICENSE"), "utf8"), /MIT License/);
});
