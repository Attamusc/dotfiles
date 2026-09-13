import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { validateDefinition, validateReport } from "../../../dot_agents/skills/verify-this/scripts/validate-verification.mjs";
import { auditMaintainerDefinition } from "../../../dot_agents/skills/maintain-verification-skill/scripts/audit-verification.mjs";

const SKILLS = ["verify-this", "control-cli", "create-verification-skill", "maintain-verification-skill", "blast-radius"];
const SKILL_ROOT = new URL("../../../dot_agents/skills/", import.meta.url);
const FIXTURE_ROOT = new URL("fixtures/verification/", import.meta.url);
async function read(relative, root = FIXTURE_ROOT) { return readFile(new URL(relative, root), "utf8"); }

function frontmatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, "missing Agent Skills YAML frontmatter");
  return Object.fromEntries(match[1].split("\n").map((line) => {
    const separator = line.indexOf(":");
    assert.notEqual(separator, -1, `invalid frontmatter line: ${line}`);
    return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, "$1$2")];
  }));
}

function inDocumentOrder(source, values) {
  let position = -1;
  for (const value of values) {
    const next = source.indexOf(value, position + 1);
    assert.ok(next > position, `${value} is missing or out of order`);
    position = next;
  }
}

test("Phase 1 skills have valid, unique Agent Skills frontmatter", async () => {
  const names = [];
  for (const skill of SKILLS) { const metadata = frontmatter(await read(`${skill}/SKILL.md`, SKILL_ROOT)); assert.equal(metadata.name, skill); assert.ok(metadata.name.length <= 64); assert.ok(metadata.description.length <= 1024); names.push(metadata.name); }
  assert.equal(new Set(names).size, SKILLS.length);
});

test("definition validator enforces the complete canonical schema", async () => {
  const valid = await read("valid-definition/SKILL.md");
  assert.deepEqual(validateDefinition(valid), []);
  const foldedTooLong = valid.replace(/description: .*/, `description: >\n  ${"x".repeat(600)}\n  ${"x".repeat(500)}`);
  const workspacePath = valid.replace("Node.js is available as `node`.", "Use `/workspace/private/tool`.");
  const vagueManual = valid.replace("- Command: `node --test test/example.test.mjs`\n- Timeout: 60s", "- Command: none\n- Procedure: do things\n- Timeout: none\n- Stopping condition: whenever");
  for (const source of [foldedTooLong, workspacePath, vagueManual]) assert.notDeepEqual(validateDefinition(source), []);
  const invalid = [
    valid.replace("name: verify-example", `name: ${"a".repeat(65)}`),
    valid.replace(/description: .*/, `description: ${"x".repeat(1025)}`),
    valid.replace("`node --test test/example.test.mjs`", "/absolute/script"),
    valid.replace("`node --test test/example.test.mjs`", "`/absolute/script`"),
    valid.replace("Timeout: 60s", "Timeout: eventually"),
    valid.replace("- Pass signal:", "- Surprise: value\n- Pass signal:"),
    valid.replace("Evidence: exit status and bounded output", "Evidence: complete transcript"),
    valid.replace("- Target environment: disposable local fixture\n", ""),
    valid.replace("Requires: node", "Requires: node, mystery adapter"),
  ];
  invalid.push(
    valid.replace("Verify the example contract parser and its project-relative fixture; external integrations are excluded.", ""),
    valid.replace("Evidence: exit status and bounded output", "Evidence: credentials"),
    valid.replace("Evidence: exit status and bounded output", "Evidence: all command output"),
    valid.replace("- Pass signal:", "- Surprise-field: value\n- Pass signal:"),
    valid.replace("Node.js is available as `node`.", `Use ${"/home"}/example/private/tool.`),
    valid.replace("remove `tmp/verification-output.txt` and prove the path is absent after cleanup", "tidy up"),
  );
  for (const [index, source] of invalid.entries()) assert.notDeepEqual(validateDefinition(source), [], `invalid case ${index}`);
  for (const fixture of ["invalid-definition-missing-timeout", "invalid-definition-mutation-without-approval"]) assert.notDeepEqual(validateDefinition(await read(`${fixture}/SKILL.md`)), []);

  const canonicalViolations = [
    valid.replace("description: Runs focused checks for the example contract fixture. Use when testing verification definition parsing and validation.", 'description: "# Verification: decoy"').replace("# Verification: example contract\n\n", ""),
    valid.replace(/description: .*/, "description: !!str tagged-description"),
    ...["C:/workspace/private/tool", "/", "../outside"].map(path => valid.replace("Node.js is available as `node`.", `Use \`${path}\`.`)),
    valid.replace("### CHECK-1: Focused tests", "### CHECK-1: "),
    valid.replace("Pass signal: exit status 0", "Pass signal: file"),
    valid.replace("Cleanup: none", "Cleanup: tidy up"),
  ];
  canonicalViolations.push(
    valid.replace(/description: .*/, "description: &description anchored"),
    valid.replace(/description: .*/, "description: *description"),
    valid.replace("name: verify-example", "name: verify-example\nname: duplicate"),
    valid.replace("name: verify-example", "unknown: value\nname: verify-example"),
    valid.replace(/description: .*/, 'description: "unterminated'),
  );
  canonicalViolations.push(
    ...["null", "NULL", "~", "true", "False", "42", "3.14"].map(value => valid.replace(/description: .*/, `description: ${value}`)),
    valid.replace("remove `tmp/verification-output.txt` and prove the path is absent after cleanup", "remove `tmp/verification-output.txt` and prove `tmp/unrelated.txt` is absent"),
  );
  for (const [index, source] of canonicalViolations.entries()) assert.notDeepEqual(validateDefinition(source), [], `canonical violation ${index}`);
  for (const source of [
    valid.replace(/description: .*/, "description: Verify the project's example contract."),
    valid.replace(/description: .*/, 'description: "Quoted description."'),
    valid.replace(/description: .*/, "description: 'Literal quoted description.'"),
    valid.replace(/description: .*/, "description: >\n  Folded description\n  on two lines."),
    valid.replace(/description: .*/, "description: |\n  Literal description\n  on two lines."),
    valid.replace("Node.js is available as `node`.", "Documentation is at https://example.com/reference."),
  ]) assert.deepEqual(validateDefinition(source), []);
});

test("prose apostrophes cannot conceal forbidden definition or report paths", async () => {
  const definition = await read("valid-definition/SKILL.md");
  const report = await read("valid-report.md");
  const invalidDefinition = definition.replace(
    "Node.js is available as `node`.",
    `The project's tool is at \`${"/home"}/example/private/tool\`.`,
  );
  const invalidReport = report.replace(
    "- Target: example contract fixture",
    `- Target: project's output at \`${"/home"}/example/private.log\``,
  );

  assert.notDeepEqual(validateDefinition(invalidDefinition), []);
  assert.notDeepEqual(validateReport(invalidReport, definition), []);
  assert.deepEqual(validateDefinition(definition.replace("Node.js is available as `node`.", "The project's tool is available.")), []);
  assert.deepEqual(validateReport(report.replace("- Target: example contract fixture", "- Target: project's output"), definition), []);
});

test("acceptance gate rejects operator-attached absolute paths and encoded traversal", async () => {
  const valid = await read("valid-definition/SKILL.md");
  assert.notDeepEqual(validateDefinition(valid.replace("node --test test/example.test.mjs", `node --test test/example.test.mjs >${"/home"}/example/result.log`)), []);
  assert.notDeepEqual(validateDefinition(valid.replace("contract parser and fixtures", "`%2e%2e/evidence.json#scripts.test`")), []);
  assert.notDeepEqual(validateDefinition(valid.replace("contract parser and fixtures", "`%ZZ/evidence.json#scripts.test`")), []);
  assert.deepEqual(validateDefinition(valid.replace("Node.js is available as `node`.", "Documentation is at https://example.com/a%20path.")), []);

  const curlDefinition = valid.replace("Requires: node", "Requires: curl");
  assert.deepEqual(validateDefinition(curlDefinition.replace("node --test test/example.test.mjs", "curl https://example.com")), []);
  assert.deepEqual(validateDefinition(curlDefinition.replace("node --test test/example.test.mjs", "curl 'https://example.com/reference?next=/docs'")), []);
  assert.deepEqual(validateDefinition(curlDefinition.replace("node --test test/example.test.mjs", "curl 'https://example.com/reference?mode=full&next=/docs'")), []);
  assert.deepEqual(validateDefinition(curlDefinition.replace("node --test test/example.test.mjs", 'curl "https://example.com/reference?mode=full&next=/docs"')), []);
  assert.notDeepEqual(validateDefinition(curlDefinition.replace("node --test test/example.test.mjs", "curl 'https://example.com/reference?mode=full&next=/docs")), []);
  assert.notDeepEqual(validateDefinition(curlDefinition.replace("node --test test/example.test.mjs", `curl https://example.com>${"/home"}/example/result.log`)), []);
  assert.notDeepEqual(validateDefinition(valid.replace("node --test test/example.test.mjs", `CONFIG=${"/home"}/example/config node --test test/example.test.mjs`)), []);
  assert.notDeepEqual(validateDefinition(valid.replace("node --test test/example.test.mjs", `node --config=${"/home"}/example/config --test test/example.test.mjs`)), []);
});

test("definitive gate enforces definition lexical and evidence semantics", async () => {
  const valid = await read("valid-definition/SKILL.md");
  assert.notDeepEqual(validateDefinition(valid.replace("node --test test/example.test.mjs", `node --test test/example.test.mjs>${"/home"}/example/result.log`)), []);
  assert.notDeepEqual(validateDefinition(valid.replace("Evidence: exit status and bounded output", "Evidence: command output")), []);
  assert.deepEqual(validateDefinition(valid.replace(/description: .*/, 'description: "Verify\\x20the example contract."')), []);
  assert.deepEqual(validateDefinition(valid.replace("Node.js is available as `node`.", "Node.js is 100% available as node.")), []);
});

test("canonical evidence and post-cleanup clauses reject release-gate reproductions", async () => {
  const definition = await read("valid-definition/SKILL.md");
  const report = await read("valid-report.md");

  assert.notDeepEqual(validateDefinition(definition.replace("Evidence: exit status and bounded output", "Evidence: avoid bounded output")), []);
  assert.notDeepEqual(validateDefinition(definition.replace("Evidence: exit status and bounded output", "Evidence: bounded output is avoided")), []);
  assert.notDeepEqual(validateDefinition(definition.replace("prove the path is absent after cleanup", "prove the path was absent before cleanup")), []);
  assert.notDeepEqual(validateReport(report.replace("was absent after cleanup", "was absent before cleanup"), definition), []);

  assert.deepEqual(validateDefinition(definition), []);
  assert.deepEqual(validateDefinition(definition.replace("Evidence: exit status and bounded output", "Evidence: bounded evidence excerpt")), []);
  assert.deepEqual(validateDefinition(definition.replace("Evidence: exit status and bounded output", "Evidence: bounded native runtime record")), []);
  assert.deepEqual(validateDefinition(definition.replaceAll("after cleanup", "after removal")), []);
  assert.deepEqual(validateDefinition(definition.replaceAll("after cleanup", "after the action")), []);
  assert.deepEqual(validateReport(report, definition), []);
  assert.deepEqual(validateReport(report.replace("was absent after cleanup", "was absent after removal"), definition), []);
  assert.deepEqual(validateReport(report.replace("was absent after cleanup", "was absent after the action"), definition), []);
  assert.deepEqual(validateReport(report.replace("was absent after cleanup", "remains absent after cleanup"), definition), []);
});

test("final acceptance rejects malformed quoting and negated definition obligations", async () => {
  const valid = await read("valid-definition/SKILL.md");
  for (const source of [
    valid.replace(/description: .*/, 'description: "Verify" junk"'),
    valid.replace("Evidence: exit status and bounded output", "Evidence: not bounded output"),
    valid.replace("Evidence: exit status and bounded output", "Evidence: never bounded output"),
    valid.replace("Evidence: exit status and bounded output", "Evidence: unbounded output"),
    valid.replace("Evidence: exit status and bounded output", "Evidence: bounded output is not retained"),
    valid.replace("Evidence: exit status and bounded output", "Evidence: retain results without bounded output"),
    valid.replace("Evidence: exit status and bounded output", "Evidence: retain results excluding bounded output"),
    valid.replace("Evidence: exit status and bounded output", "Evidence: retain results lacking bounded output"),
    valid.replace("Evidence: exit status and bounded output", "Evidence: retain results missing bounded output"),
    valid.replace("remove `tmp/verification-output.txt` and prove the path is absent after cleanup", "remove `tmp/verification-output.txt` and do not prove the path is absent after cleanup"),
    valid.replace("remove `tmp/verification-output.txt` and prove the path is absent after cleanup", "remove `tmp/verification-output.txt` and prove the path is not absent"),
  ]) assert.notDeepEqual(validateDefinition(source), []);
  assert.deepEqual(validateDefinition(valid.replace(/description: .*/, 'description: "Verify \\"quoted\\" syntax."')), []);
});

test("final gate definition reproductions are structurally rejected", async () => {
  const valid = await read("valid-definition/SKILL.md");
  assert.notDeepEqual(validateDefinition(valid.replace(/description: .*/, "description: 0.")), []);
  assert.deepEqual(validateDefinition(valid.replace(/description: .*/, "description: Verify the project's example contract.")), []);
  const checkZero = valid.replace("### CHECK-1: Focused tests", `### CHECK-0: Invalid identifier
- Target: invalid check
- Safety: read-only
- Requires: none
- Command: \`node --version\`
- Timeout: 30s
- Pass signal: exit status 0
- Failure means: invalid check failed
- Evidence: bounded output
- Cleanup: none

### CHECK-1: Focused tests`);
  assert.notDeepEqual(validateDefinition(checkZero), []);

  const check2 = valid.match(/^### CHECK-2:[\s\S]*?(?=^## Report)/m)[0];
  const movedDangerousCheck = valid
    .replace(check2, "")
    .replace(/\s*$/, `\n\n${check2.replace("Safety: mutating", "Safety: dangerous")}`);
  assert.notDeepEqual(validateDefinition(movedDangerousCheck), []);
});

test("definition validator rejects Pi-invalid YAML and exactness violations", async () => {
  const valid = await read("valid-definition/SKILL.md");
  const invalid = [
    valid.replace(/description: .*/, "description: @invalid-yaml"),
    valid.replace("# Verification: example contract", "# Verification:example contract"),
    valid.replace("`node --test test/example.test.mjs`", `\`CONFIG=${"/home"}/example/config node --test test/example.test.mjs\``),
    valid.replace("`node --test test/example.test.mjs`", `\`node --config=${"/home"}/example/config --test test/example.test.mjs\``),
    valid.replace("Requires: node", "Requires: none, node"),
    valid.replace("Cleanup: none", "Cleanup: remove things and prove things are absent"),
    valid.replace("Target environment: disposable local fixture", "Target environment: x"),
    valid.replace("Mutation: creates `tmp/verification-output.txt`", "Mutation: x"),
  ];
  for (const [index, source] of invalid.entries()) assert.notDeepEqual(validateDefinition(source), [], `exactness violation ${index}`);
});

test("report metadata placement and optional-check PASS follow the contract", async () => {
  const valid = await read("valid-report.md");
  const definition = await read("valid-definition/SKILL.md");
  assert.deepEqual(validateReport(valid.replace("example contract fixture", "'https://example.com/reference?mode=full&next=/docs'"), definition), []);
  assert.deepEqual(validateReport(valid.replace("example contract fixture", '"https://example.com/reference?mode=full&next=/docs"'), definition), []);
  assert.notDeepEqual(validateReport(valid.replace("- Target: example contract fixture", `- Target: \`${"/home"}/example/fixture\``), definition), []);
  const metadata = valid.match(/- Target:[\s\S]*?- Date:[^\n]+\n/)[0];
  const relocated = valid.replace(metadata, "").replace("## Limitations and unsupported checks\n", `## Limitations and unsupported checks\n\n${metadata}`);
  assert.notDeepEqual(validateReport(relocated, definition), []);
  const optional = valid
    .replace("- Scope: contract parser and project-relative fixtures; external integrations excluded", "- Scope: Optional checks: CHECK-1; required checks: CHECK-2")
    .replace("| CHECK-1 | pass | measured |", "| CHECK-1 | skipped | unverified |")
    .replace("- None.", "- CHECK-1 was not run because the optional test was intentionally omitted.")
    .replace("PASS — all required checks passed with measured or observed evidence and cleanup completed.", "PASS — required CHECK-2 passed; optional CHECK-1 was skipped.");
  assert.deepEqual(validateReport(optional, definition), []);
});

test("report validator enforces definition, exact tables, identities, vocabularies, and verdicts", async () => {
  const valid = await read("valid-report.md");
  const definition = await read("valid-definition/SKILL.md");
  assert.deepEqual(validateReport(valid, definition), []);
  assert.notDeepEqual(validateReport(valid.replace("| Check | Status | Evidence grade | Evidence reference |", "| One | Two | Three | Four |"), definition), []);
  const withoutCheck2 = valid.replace(/^\| CHECK-2 \|.*\|$/gm, "").replace(/^\| EVIDENCE-[34] \|.*\|$/gm, "");
  assert.notDeepEqual(validateReport(withoutCheck2, definition), []);
  const invalid = [
    valid.replace("| node | available |", "| node | maybe |"),
    valid.replace("| CHECK-2 | remove", "| CHECK-3 | remove"),
    valid.replace("| CHECK-1 | pass | measured | EVIDENCE-2", "| CHECK-1 | pass | measured | EVIDENCE-99"),
    valid.replace("| CHECK-1 | none | not-required |", "| CHECK-1 | none | unknown |"),
    valid.replace(/^\| node \| available \|.*\|$/m, "| node | available | |"),
    valid.replace("| CHECK-1 | pass | measured", "| CHECK-1 | fail | measured"),
    valid.replace("bounded version check", "complete environment dump"),
  ];
  invalid.push(
    valid.replace(/^\| CHECK-[12] \|.*\|$/gm, "").replace(/^\| EVIDENCE-[1-4] \|.*\|$/gm, "").replace("PASS — all required checks passed with measured or observed evidence and cleanup completed.", "PASS — all required checks passed."),
    valid.replace("| CHECK-2 | remove `tmp/verification-output.txt` and prove the path is absent after cleanup | complete | EVIDENCE-4 |", "| CHECK-2 | remove `tmp/verification-output.txt` and prove the path is absent after cleanup | incomplete | cleanup failed |"),
    valid.replace("| node | available |", "| node | unavailable |").replace("| CHECK-1 | pass |", "| CHECK-1 | pass |"),
    valid.replace("`test/example.test.mjs`, `tmp/verification-output.txt`", `\`${"/home"}/example/secret\``),
    valid.replace(/^PASS —.*$/m, "PASS"),
  );
  for (const [index, source] of invalid.entries()) assert.notDeepEqual(validateReport(source, definition), [], `invalid report case ${index}`);
  for (const fixture of ["invalid-report-pass-unverified.md", "invalid-report-unknown-status.md"]) assert.notDeepEqual(validateReport(await read(fixture), definition), []);

  const semanticViolations = [
    valid.replace("| CHECK-1 | pass | measured |", "| CHECK-1 | skipped | unverified |").replace("PASS — all required checks passed with measured or observed evidence and cleanup completed.", "INCOMPLETE — CHECK-1 was skipped."),
    valid.replace("| CHECK-1 | pass | measured |", "| CHECK-1 | unsupported | unverified |").replace("PASS — all required checks passed with measured or observed evidence and cleanup completed.", "INCOMPLETE — CHECK-1 was unsupported."),
    valid.replace("EVIDENCE-2 session artifact or native runtime record", `EVIDENCE-2 ${"/home"}/example/native-record`),
    valid.replace("| node | available | EVIDENCE-1 records the bounded version check |", "| node | available | EVIDENCE-1 records the bounded version check |\n| docker | available | `docker version` |"),
    valid.replace("| node | available | EVIDENCE-1 records the bounded version check |", "| node | available | EVIDENCE-1 records the bounded version check |\n| node | available | duplicate evidence |"),
  ];
  semanticViolations.push(
    valid.replace("- None.", `- Evidence retained at \`${"/home"}/example/private.log\`.`),
    `${valid}\n## Verdict\n\nFAIL — duplicate conflicting verdict.\n`,
  );
  for (const [index, source] of semanticViolations.entries()) assert.notDeepEqual(validateReport(source, definition), [], `report semantic violation ${index}`);

  const noCapabilitiesDefinition = definition.replaceAll("Requires: node", "Requires: none");
  const noCapabilitiesReport = valid.replace(/^\| node \| available \|.*\|\n/m, "");
  assert.deepEqual(validateDefinition(noCapabilitiesDefinition), []);
  assert.deepEqual(validateReport(noCapabilitiesReport, noCapabilitiesDefinition), []);
});

test("acceptance gate enforces cleanup, optional checks, limitations, and verdict semantics", async () => {
  const valid = await read("valid-report.md");
  const definition = await read("valid-definition/SKILL.md");
  const unrelatedCleanup = valid.replace(
    "| EVIDENCE-4 | command output | `tmp/verification-output.txt` was absent after cleanup |",
    "| EVIDENCE-4 | command output | `tmp/verification-output.txt` was the cleanup target; `tmp/unrelated.txt` was absent |",
  );
  assert.notDeepEqual(validateReport(unrelatedCleanup, definition), []);

  const skipped = valid
    .replace("| CHECK-1 | pass | measured |", "| CHECK-1 | skipped | unverified |")
    .replace("- None.", "- Due to scheduled maintenance, CHECK-1 was skipped.")
    .replace(/^PASS —.*$/m, "INCOMPLETE — required CHECK-1 was skipped due to maintenance.");
  assert.deepEqual(validateReport(skipped, definition), []);
  const lowercaseOptional = skipped.replace("contract parser and project-relative fixtures; external integrations excluded", "optional checks: CHECK-1; required checks: CHECK-2").replace(/^INCOMPLETE —.*$/m, "PASS — CHECK-2 passed and optional CHECK-1 was skipped.");
  assert.notDeepEqual(validateReport(lowercaseOptional, definition), []);

  const optionalFailure = valid
    .replace("contract parser and project-relative fixtures; external integrations excluded", "Optional checks: CHECK-1; required checks: CHECK-2")
    .replace("| CHECK-1 | pass | measured |", "| CHECK-1 | fail | measured |")
    .replace(/^PASS —.*$/m, "FAIL — optional CHECK-1 failed while required CHECK-2 passed.");
  assert.notDeepEqual(validateReport(optionalFailure, definition), []);

  const incompleteWithOptionalFailure = valid
    .replace("contract parser and project-relative fixtures; external integrations excluded", "Optional checks: CHECK-1; required checks: CHECK-2")
    .replace("| CHECK-1 | pass | measured | EVIDENCE-2 session artifact or native runtime record |", "| CHECK-1 | fail | measured | EVIDENCE-2 session artifact or native runtime record |")
    .replace("| CHECK-2 | pass | observed | EVIDENCE-3 direct file observation |", "| CHECK-2 | error | measured | EVIDENCE-3 native runtime record |")
    .replace("| EVIDENCE-2 | command output | test command exited 0; one test passed |", "| EVIDENCE-2 | command output | test command exited 1; one test failed |")
    .replace("| EVIDENCE-3 | direct observation | command exited 0; generated file contained the single line `verified` before cleanup |", "| EVIDENCE-3 | runtime record | execution error occurred before a result was produced |")
    .replace("- None.", "- CHECK-2 could not produce a result because execution failed.")
    .replace(/^PASS —.*$/m, "INCOMPLETE — required CHECK-2 had an execution error; optional CHECK-1 failed.");
  assert.deepEqual(validateReport(incompleteWithOptionalFailure, definition), []);
});

test("definitive gate enforces report path, identity, and cleanup semantics", async () => {
  const valid = await read("valid-report.md");
  const definition = await read("valid-definition/SKILL.md");
  assert.notDeepEqual(validateReport(valid.replace("EVIDENCE-2 session artifact or native runtime record", `EVIDENCE-2 test/result>${"/home"}/example/native-record`), definition), []);

  const wrongCheck = valid
    .replace("| CHECK-1 | pass | measured |", "| CHECK-1 | skipped | unverified |")
    .replace("- None.", "- CHECK-10 was not run because maintenance prevented it.")
    .replace(/^PASS —.*$/m, "INCOMPLETE — required CHECK-1 was skipped.");
  assert.notDeepEqual(validateReport(wrongCheck, definition), []);

  for (const noun of ["state", "process"]) {
    const terminalCleanup = valid.replace(
      "`tmp/verification-output.txt` was absent after cleanup",
      `\`tmp/verification-output.txt\` was absent after cleanup; no owned ${noun} remains after cleanup`,
    );
    assert.deepEqual(validateReport(terminalCleanup, definition), [], noun);
  }

  for (const invalidSuffix of [
    "; no owned state remains",
    "; no owned state remains after removal",
    ", no owned state remains after cleanup",
  ]) {
    const invalidTerminalCleanup = valid.replace(
      "`tmp/verification-output.txt` was absent after cleanup",
      `\`tmp/verification-output.txt\` was absent after cleanup${invalidSuffix}`,
    );
    assert.notDeepEqual(validateReport(invalidTerminalCleanup, definition), [], invalidSuffix);
  }

  const suffixes = ["after cleanup", "after removal", "after the action"];
  const contradictionRelations = [
    "is present",
    "was present",
    "remains present",
    "remained present",
    "exists",
    "existed",
    "is running",
    "was running",
    "remains running",
    "remained running",
  ];
  for (const relation of contradictionRelations) {
    for (const suffix of suffixes) {
      const contradiction = `${relation} ${suffix}`;
      const source = valid.replace(
        "`tmp/verification-output.txt` was absent after cleanup",
        `\`tmp/verification-output.txt\` was absent after cleanup, but \`tmp/verification-output.txt\` ${contradiction}`,
      );
      assert.notDeepEqual(validateReport(source, definition), [], contradiction);
    }
  }

  for (const coordinated of ["was present", "was running", "existed"]) {
    const source = valid.replace(
      "`tmp/verification-output.txt` was absent after cleanup",
      `\`tmp/verification-output.txt\` was absent after cleanup, but ${coordinated} after cleanup`,
    );
    assert.notDeepEqual(validateReport(source, definition), [], coordinated);
  }

  for (const relation of ["was absent", "remains absent"]) {
    for (const suffix of suffixes) {
      const terminal = `${relation} ${suffix}`;
      assert.deepEqual(validateReport(valid.replace("was absent after cleanup", terminal), definition), [], terminal);
    }
  }

  for (const state of ["gone", "restored", "stopped", "terminated"]) {
    const required = `restore \`tmp/verification-output.txt\` and prove the target was ${state} after the action`;
    const stateDefinition = definition.replace("remove `tmp/verification-output.txt` and prove the path is absent after cleanup", required);
    const stateReport = valid
      .replaceAll("remove `tmp/verification-output.txt` and prove the path is absent after cleanup", required)
      .replace("`tmp/verification-output.txt` was absent after cleanup", `\`tmp/verification-output.txt\` remains ${state} after the action`);
    assert.deepEqual(validateReport(stateReport, stateDefinition), [], state);
  }
});

test("pass evidence establishes every supported declared signal", async () => {
  const valid = await read("valid-report.md");
  const definition = await read("valid-definition/SKILL.md");

  const invalidEvidence = [
    "test command exited 1; one test failed",
    "test command exited 0; test command did not exit 0",
    "test command exited 0; command exited 1; one test failed",
  ];
  for (const evidence of invalidEvidence) {
    assert.notDeepEqual(validateReport(valid.replace("test command exited 0; one test passed", evidence), definition), [], evidence);
  }
  for (const evidence of ["command exited 0; unrelated log contained `verified`", "command exited 0; the output file did not contain `verified`"]) {
    assert.notDeepEqual(validateReport(valid.replace("command exited 0; the output file contained the single line `verified` before cleanup", evidence), definition), [], evidence);
  }

  const signals = [
    ["exit status 0", "command exited 0"],
    ["process status is complete", "process status was complete"],
    ["status ready", "status was ready"],
    ["returned value true", "returned value was true"],
    ["count 3", "count was 3"],
    ["file state absent", "file state was absent"],
    ["process state stopped", "process state was stopped"],
    ["output contains `passed`", "output contained `passed`"],
    ["value equals `ok`", "value equaled `ok`"],
    ["output matches `^ok$`", "output matched `^ok$`"],
    ["dialog is visible", "dialog was visible"],
    ["success appears", "success appeared"],
  ];
  for (const [signal, evidence] of signals) {
    const signalDefinition = definition.replace("exit status 0", () => signal);
    const signalReport = value => valid.replace("test command exited 0; one test passed", () => value);
    assert.deepEqual(validateReport(signalReport(evidence), signalDefinition), [], signal);
    assert.notDeepEqual(validateReport(signalReport(`not ${evidence}`), signalDefinition), [], `negated ${signal}`);
    const opposite = signal === "success appears"
      ? "success did not appear"
      : evidence.replace(/(?:0|complete|ready|true|3|absent|stopped|`passed`|`ok`|`\^ok\$`|visible)$/, "wrong");
    assert.notDeepEqual(validateReport(signalReport(`${evidence} and ${opposite}`), signalDefinition), [], `and conflict ${signal}`);
    assert.notDeepEqual(validateReport(signalReport(`${evidence} but ${opposite}`), signalDefinition), [], `but conflict ${signal}`);
    assert.notDeepEqual(validateReport(signalReport(`the unrelated ${evidence}`), signalDefinition), [], `wrong subject ${signal}`);
  }

  for (const evidence of ["command exited 0 with no failures", "test command exited 0 with no failures", "exit status was 0 with no failures"]) {
    assert.deepEqual(validateReport(valid.replace("test command exited 0; one test passed", evidence), definition), [], evidence);
  }

  for (const [signal, positive, negative, conflicting] of [
    ["output contains `passed`", "output contained `passed`", "output did not contain `passed`", "output contained `passed`; output contained `failed`"],
    ["value equals `ok`", "value equaled `ok`", "value was not equal to `ok`", "value equaled `ok`; value equaled `bad`"],
    ["output matches `^ok$`", "output matched `^ok$`", "output does not match `^ok$`", "output matched `^ok$`; output matched `^bad$`"],
    ["dialog is visible", "dialog was visible", "dialog was not visible", "dialog was visible; dialog was absent"],
  ]) {
    const signalDefinition = definition.replace("exit status 0", () => signal);
    assert.deepEqual(validateReport(valid.replace("test command exited 0; one test passed", () => positive), signalDefinition), [], positive);
    for (const evidence of [negative, conflicting]) assert.notDeepEqual(validateReport(valid.replace("test command exited 0; one test passed", () => evidence), signalDefinition), [], evidence);
  }

  for (const [signal, positive, localNegative, differentValue] of [
    ["output contains `passed`", "output contained `passed`", "output not contained `passed`", null],
    ["value equals `ok`", "value equaled `ok`", "value not equaled `ok`", "value equaled `bad ok`"],
    ["output matches `^ok$`", "output matched `^ok$`", "output not matched `^ok$`", "output matched `prefix ^ok$ suffix`"],
  ]) {
    const signalDefinition = definition.replace("exit status 0", () => signal);
    const signalReport = evidence => valid.replace("test command exited 0; one test passed", () => evidence);
    assert.notDeepEqual(validateReport(signalReport(localNegative), signalDefinition), [], localNegative);
    for (const conjunction of ["and", "but"]) {
      const conflict = `${positive} ${conjunction} ${localNegative}`;
      assert.notDeepEqual(validateReport(signalReport(conflict), signalDefinition), [], conflict);
    }
    if (differentValue) assert.notDeepEqual(validateReport(signalReport(differentValue), signalDefinition), [], differentValue);
  }

  for (const [signal, evidence] of [
    ["value equals `all checks passed`", "value equaled `all checks passed`"],
    ["value equals all checks passed", "value equaled all checks passed"],
    ["output matches `^all checks passed$`", "output matched `^all checks passed$`"],
    ["output matches ^all checks passed$", "output matched ^all checks passed$"],
  ]) {
    const signalDefinition = definition.replace("exit status 0", () => signal);
    const signalReport = valid.replace("test command exited 0; one test passed", () => evidence);
    assert.deepEqual(validateReport(signalReport, signalDefinition), [], signal);
  }

  const reservedSuffixWords = ["with", "before", "after", "during", "from", "at", "in"];
  for (const relation of ["contains", "equals", "matches"]) {
    for (const suffixWord of reservedSuffixWords) {
      const value = relation === "matches" ? `^all checks ${suffixWord} record$` : `all checks ${suffixWord} record`;
      const pastRelation = { contains: "contained", equals: "equaled", matches: "matched" }[relation];
      for (const quoted of [false, true]) {
        const renderedValue = quoted ? `\`${value}\`` : value;
        const signal = `${relation === "equals" ? "value" : "output"} ${relation} ${renderedValue}`;
        const evidence = `${relation === "equals" ? "value" : "output"} ${pastRelation} ${renderedValue}`;
        const signalDefinition = definition.replace("exit status 0", () => signal);
        const signalReport = valid.replace("test command exited 0; one test passed", () => evidence);
        assert.deepEqual(validateReport(signalReport, signalDefinition), [], `${relation} ${suffixWord} ${quoted ? "quoted" : "unquoted"}`);
      }
    }
  }

  for (const relation of ["contains", "equals", "matches"]) {
    for (const suffixWord of reservedSuffixWords) {
      const value = relation === "matches" ? `^all checks ${suffixWord} record$` : `all checks ${suffixWord} record`;
      const pastRelation = { contains: "contained", equals: "equaled", matches: "matched" }[relation];
      for (const quoted of [false, true]) {
        const renderedValue = quoted ? `\`${value}\`` : value;
        const subject = relation === "equals" ? "value" : "output";
        const signalDefinition = definition.replace("exit status 0", () => `${subject} ${relation} ${renderedValue}`);
        const signalReport = valid.replace("test command exited 0; one test passed", () => `${subject} ${pastRelation} ${renderedValue} with no failures`);
        assert.deepEqual(validateReport(signalReport, signalDefinition), [], `${relation} ${suffixWord} with later suffix ${quoted ? "quoted" : "unquoted"}`);
      }
    }
  }

  for (const suffixWord of reservedSuffixWords) {
    const expected = `passed ${suffixWord} production`;
    const signalDefinition = definition.replace("exit status 0", () => `output contains \`${expected}\``);
    for (const evidence of [
      `output contained all ${expected} records`,
      `output contained all ${expected} records with no failures`,
      `output contained \`all ${expected} records\` with no failures`,
    ]) {
      const signalReport = valid.replace("test command exited 0; one test passed", () => evidence);
      assert.deepEqual(validateReport(signalReport, signalDefinition), [], `contains spanning ${suffixWord}: ${evidence}`);
    }
  }

  for (const [suffixWord, suffixProse] of [
    ["with", "passed in the summary"],
    ["before", "passed was logged"],
    ["after", "passed appeared"],
    ["during", "passed verification"],
    ["from", "passed source"],
    ["at", "passed checkpoint"],
    ["in", "passed report"],
  ]) {
    for (const quoted of [false, true]) {
      const failedValue = quoted ? "`failed`" : "failed";
      const evidence = `output contained ${failedValue} ${suffixWord} ${suffixProse}`;
      const signalDefinition = definition.replace("exit status 0", () => "output contains `passed`");
      const signalReport = valid.replace("test command exited 0; one test passed", () => evidence);
      assert.notDeepEqual(validateReport(signalReport, signalDefinition), [], `contains suffix ${suffixWord} ${quoted ? "quoted" : "unquoted"}`);
    }
  }

  for (const [signal, evidence] of [
    ["output contains `passed`", "output contained `passed` with no failures"],
    ["value equals `ok`", "value equaled `ok` with no failures"],
    ["output matches `^ok$`", "output matched `^ok$` with no failures"],
    ["value equals ok", "value equaled ok after the retry"],
    ["value equals `all checks passed`", "value equaled `all checks passed` during the final run"],
    ["value equals all checks passed", "value equaled all checks passed from the native record"],
    ["output matches `^all checks passed$`", "output matched `^all checks passed$` before cleanup"],
    ["output matches ^all checks passed$", "output matched ^all checks passed$ in the final run"],
  ]) {
    const signalDefinition = definition.replace("exit status 0", () => signal);
    const signalReport = valid.replace("test command exited 0; one test passed", () => evidence);
    assert.deepEqual(validateReport(signalReport, signalDefinition), [], evidence);
  }

  for (const [signal, evidence] of [
    ["value equals `ok`", "value equaled `bad ok` with no failures"],
    ["value equals ok", "value equaled bad ok after the retry"],
    ["value equals `all checks passed`", "value equaled `bad all checks passed` during the final run"],
    ["value equals all checks passed", "value equaled bad all checks passed from the native record"],
    ["output matches `^ok$`", "output matched `prefix ^ok$ suffix` with no failures"],
    ["output matches ^ok$", "output matched prefix ^ok$ suffix at the final step"],
    ["output matches `^all checks passed$`", "output matched `prefix ^all checks passed$ suffix` before cleanup"],
    ["output matches ^all checks passed$", "output matched prefix ^all checks passed$ suffix in the final run"],
  ]) {
    const signalDefinition = definition.replace("exit status 0", () => signal);
    const signalReport = valid.replace("test command exited 0; one test passed", () => evidence);
    assert.notDeepEqual(validateReport(signalReport, signalDefinition), [], evidence);
  }

  const unsupported = definition.replace("exit status 0", "output smells acceptable");
  assert.notDeepEqual(validateDefinition(unsupported), []);
});

test("additional checks consume actual positive identifier gaps", async () => {
  const valid = await read("valid-report.md");
  const definition = (await read("valid-definition/SKILL.md")).replaceAll("CHECK-2", "CHECK-3");
  const withGapThenTail = valid
    .replaceAll("CHECK-2", "CHECK-3")
    .replace("| CHECK-3 | pass | observed | EVIDENCE-3 direct file observation |", "| CHECK-3 | pass | observed | EVIDENCE-3 direct file observation |\n| CHECK-2 | pass | measured | EVIDENCE-2 |\n| CHECK-4 | pass | measured | EVIDENCE-2 |")
    .replace("| CHECK-3 | remove `tmp/verification-output.txt` and prove the path is absent after cleanup | complete | EVIDENCE-4 |", "| CHECK-3 | remove `tmp/verification-output.txt` and prove the path is absent after cleanup | complete | EVIDENCE-4 |\n| CHECK-2 | none | not-required | no state created |\n| CHECK-4 | none | not-required | no state created |")
    .replace("- None.", "- Additional repository-evidence checks CHECK-2 and CHECK-4 were run.");
  assert.deepEqual(validateReport(withGapThenTail, definition), []);
  assert.notDeepEqual(validateReport(withGapThenTail.replaceAll("CHECK-2", "CHECK-5"), definition), []);
  assert.notDeepEqual(validateReport(withGapThenTail.replace("CHECK-2 and CHECK-4", "CHECK-20 and CHECK-40"), definition), []);
  assert.notDeepEqual(validateReport(withGapThenTail.replace("CHECK-2 and CHECK-4", "CHECK-2_suffix and CHECK-4_suffix"), definition), []);
});

test("required incomplete cleanup forces ERROR and INCOMPLETE", async () => {
  const valid = await read("valid-report.md");
  const definition = await read("valid-definition/SKILL.md");
  const incompleteCleanup = valid.replace(
    "| CHECK-2 | remove `tmp/verification-output.txt` and prove the path is absent after cleanup | complete | EVIDENCE-4 |",
    "| CHECK-2 | remove `tmp/verification-output.txt` and prove the path is absent after cleanup | incomplete | cleanup remains unproven |",
  );
  const invalidFail = incompleteCleanup
    .replace("| CHECK-2 | pass | observed | EVIDENCE-3 direct file observation |", "| CHECK-2 | fail | observed | EVIDENCE-3 direct file observation |")
    .replace(/^PASS —.*$/m, "FAIL — required CHECK-2 failed and cleanup remains incomplete.");
  assert.notDeepEqual(validateReport(invalidFail, definition), []);

  const validError = incompleteCleanup
    .replace("| CHECK-2 | pass | observed | EVIDENCE-3 direct file observation |", "| CHECK-2 | error | observed | EVIDENCE-3 direct file observation |")
    .replace(/^PASS —.*$/m, "INCOMPLETE — CHECK-2 cleanup remains incomplete.");
  assert.deepEqual(validateReport(validError, definition), []);
});

test("final acceptance rejects negative cleanup proof and unsafe report cells", async () => {
  const valid = await read("valid-report.md");
  const definition = await read("valid-definition/SKILL.md");
  for (const terminal of ["not absent", "never absent", "not gone", "not restored", "not stopped", "not terminated", "isn't absent"]) {
    const source = valid.replace("was absent after cleanup", `was ${terminal} after cleanup`);
    assert.notDeepEqual(validateReport(source, definition), [], terminal);
  }
  assert.notDeepEqual(validateReport(valid.replace("| EVIDENCE-1 | command output |", `| EVIDENCE-1 | \`${"/home"}/example/log\` |`), definition), []);
});

test("final gate report reproductions are structurally rejected", async () => {
  const valid = await read("valid-report.md");
  const definition = await read("valid-definition/SKILL.md");
  const blast = valid.match(/- Affected paths:[\s\S]*?- Rollback scope:[^\n]+/)[0];
  const movedBlast = valid.replace(blast, "- None.").replace("## Limitations and unsupported checks\n", `## Limitations and unsupported checks\n\n${blast}\n`);
  const cleanupNotChecked = valid.replace("| CHECK-2 | remove `tmp/verification-output.txt` and prove the path is absent after cleanup | complete | EVIDENCE-4 |", "| CHECK-2 | remove `tmp/verification-output.txt` and prove the path is absent after cleanup | complete | cleanup was not checked |");
  const contradictoryVerdict = valid.replace("PASS — all required checks passed with measured or observed evidence and cleanup completed.", "PASS — all required checks passed with measured or observed evidence and cleanup completed.\nFAIL — contradictory second verdict.");
  const absoluteContract = valid.replace("verification definition and report fixtures", `\`${"/home"}/example/private-contract\``);
  const contradictoryCleanup = valid.replace(
    "| CHECK-2 | remove `tmp/verification-output.txt` and prove the path is absent after cleanup | complete | EVIDENCE-4 |",
    "| CHECK-2 | remove `tmp/verification-output.txt` and prove the path is absent after cleanup | complete | cleanup proof: `tmp/unrelated.txt` is absent; the output path remains present |",
  );
  for (const source of [movedBlast, cleanupNotChecked, contradictoryVerdict, absoluteContract, contradictoryCleanup]) assert.notDeepEqual(validateReport(source, definition), []);
});

test("validator CLI accepts valid fixtures and keeps failures bounded and secret-safe", () => {
  const validator = new URL("../../../dot_agents/skills/verify-this/scripts/validate-verification.mjs", import.meta.url);
  const validDefinition = new URL("valid-definition/SKILL.md", FIXTURE_ROOT);
  const validReport = new URL("valid-report.md", FIXTURE_ROOT);
  const definitionRun = spawnSync(process.execPath, [validator.pathname, "definition", validDefinition.pathname], { encoding: "utf8" });
  assert.equal(definitionRun.status, 0, definitionRun.stderr);
  const reportRun = spawnSync(process.execPath, [validator.pathname, "report", validReport.pathname, "--definition", validDefinition.pathname], { encoding: "utf8" });
  assert.equal(reportRun.status, 0, reportRun.stderr);
  const invalid = new URL("invalid-report-pass-unverified.md", FIXTURE_ROOT);
  const run = spawnSync(process.execPath, [validator.pathname, "report", invalid.pathname, "--definition", validDefinition.pathname], { encoding: "utf8" });
  assert.notEqual(run.status, 0);
  assert.ok(run.stderr.length < 4096);
  assert.doesNotMatch(run.stderr, /Verification Report|agent summarized the outcome/);
});

test("canonical CLI rejects all five cross-artifact reproductions", async () => {
  const validator = new URL("../../../dot_agents/skills/verify-this/scripts/validate-verification.mjs", import.meta.url).pathname;
  const definition = await read("valid-definition/SKILL.md");
  const report = await read("valid-report.md");
  const directory = await mkdtemp(join(tmpdir(), "verification-probes-"));
  try {
    const definitionPath = join(directory, "definition.md");
    const reportPath = join(directory, "report.md");
    const definitions = [
      definition.replace(/description: .*/, `description: >\n  ${"x".repeat(600)}\n  ${"x".repeat(500)}`),
      definition.replace("Node.js is available as `node`.", "Use `/workspace/private/tool`."),
      definition.replace("- Command: `node --test test/example.test.mjs`\n- Timeout: 60s", "- Command: none\n- Procedure: do things\n- Timeout: none\n- Stopping condition: whenever"),
    ];
    for (const invalid of definitions) { await writeFile(definitionPath, invalid); assert.notEqual(spawnSync(process.execPath, [validator, "definition", definitionPath]).status, 0); }
    await writeFile(definitionPath, definition);
    for (const invalid of [report.replace("| Check | Status | Evidence grade | Evidence reference |", "| One | Two | Three | Four |"), report.replace(/^\| CHECK-2 \|.*\|$/gm, "").replace(/^\| EVIDENCE-[34] \|.*\|$/gm, "")]) {
      await writeFile(reportPath, invalid);
      assert.notEqual(spawnSync(process.execPath, [validator, "report", reportPath, "--definition", definitionPath]).status, 0);
    }
  } finally { await rm(directory, { recursive: true }); }
});

test("maintainer audits concrete definitions against repository evidence", async () => {
  for (const state of ["current", "stale", "missing", "ambiguous"]) {
    const root = new URL(`maintainer/${state}/`, FIXTURE_ROOT);
    const expected = JSON.parse(await readFile(new URL("expected.json", root), "utf8"));
    assert.deepEqual(await auditMaintainerDefinition(new URL("SKILL.md", root), root), expected);
  }

  const fixture = new URL("maintainer/current/", FIXTURE_ROOT);
  const directory = await mkdtemp(join(tmpdir(), "maintainer-entry-probe-"));
  try {
    await writeFile(join(directory, "SKILL.md"), await readFile(new URL("SKILL.md", fixture), "utf8"));
    await writeFile(join(directory, "package.json"), '{"scripts":{"test":"node --test test/renamed.test.mjs","lint":"node --test test/current.test.mjs"}}\n');
    const [audit] = await auditMaintainerDefinition(new URL(`file://${directory}/SKILL.md`), new URL(`file://${directory}/`));
    assert.equal(audit.state, "stale");
  } finally { await rm(directory, { recursive: true }); }
});

test("maintainer resolves npm script wrappers and forwarded arguments", async () => {
  const fixture = new URL("maintainer/current/", FIXTURE_ROOT);
  const directory = await mkdtemp(join(tmpdir(), "maintainer-npm-wrapper-"));
  const outside = join(directory, "..", `outside-${Date.now()}.test.mjs`);
  try {
    const base = await readFile(new URL("SKILL.md", fixture), "utf8");
    await writeFile(join(directory, "package.json"), '{"scripts":{"test":"node --test test/current.test.mjs","lint":"node lint.mjs","empty":"   "}}\n');
    await writeFile(join(directory, "api-contract"), "repository target\n");
    await import("node:fs/promises").then(({ mkdir }) => mkdir(join(directory, "src")));
    await writeFile(outside, "outside target\n");
    await symlink(outside, join(directory, "linked-outside.test.mjs"));
    for (const [command, citation, expected] of [
      ["npm test", "scripts.test", "current"],
      ["npm test -- api-contract", "scripts.test", "current"],
      ["npm run lint -- src", "scripts.lint", "current"],
      ["npm test -- linked-outside.test.mjs", "scripts.test", "stale"],
      ["npm test -- test/removed.test.mjs", "scripts.test", "stale"],
      ["npm test -- arbitrary-text", "scripts.test", "stale"],
      ["npm run empty -- api-contract", "scripts.empty", "stale"],
      ["npm run lint", "scripts.test", "stale"],
      ["node --test test/current.test.mjs", "scripts.test", "current"],
    ]) {
      const definition = base
        .replace("node --test test/current.test.mjs", command)
        .replace("scripts.test", citation);
      await writeFile(join(directory, "SKILL.md"), definition);
      const [audit] = await auditMaintainerDefinition(new URL(`file://${directory}/SKILL.md`), new URL(`file://${directory}/`));
      assert.equal(audit.state, expected, `${command} against ${citation}`);
    }
  } finally {
    await rm(outside, { force: true });
    await rm(directory, { recursive: true });
  }
});

test("maintainer rejects citations that resolve outside the repository", async () => {
  const fixture = new URL("maintainer/current/", FIXTURE_ROOT);
  const directory = await mkdtemp(join(tmpdir(), "maintainer-containment-"));
  const repository = join(directory, "repository");
  try {
    await import("node:fs/promises").then(({ mkdir }) => mkdir(repository));
    const definition = (await readFile(new URL("SKILL.md", fixture), "utf8")).replace("package.json#scripts.test", "%2e%2e/evidence.json#scripts.test");
    await writeFile(join(repository, "SKILL.md"), definition);
    await writeFile(join(directory, "evidence.json"), '{"scripts":{"test":"node --test test/current.test.mjs"}}\n');
    const [audit] = await auditMaintainerDefinition(new URL(`file://${repository}/SKILL.md`), new URL(`file://${repository}/`));
    assert.notEqual(audit.state, "current");
    assert.match(audit.currentEvidence, /outside repository/);
  } finally { await rm(directory, { recursive: true }); }
});

test("maintainer classifies Markdown command assertions by direction", async () => {
  const fixture = new URL("maintainer/current/", FIXTURE_ROOT);
  const directory = await mkdtemp(join(tmpdir(), "maintainer-direction-"));
  try {
    const definition = (await readFile(new URL("SKILL.md", fixture), "utf8")).replace("package.json#scripts.test", "docs.md#test-command");
    await writeFile(join(directory, "SKILL.md"), definition);
    for (const [line, expected] of [
      ["Use `node --test test/current.test.mjs` instead of `node --test test/old.test.mjs`.", "current"],
      ["Test command: `node --test test/current.test.mjs`", "current"],
      ["Command: `node --test test/current.test.mjs`", "current"],
      ["The test command is no longer `node --test test/current.test.mjs`.", "stale"],
      ["Use `node --test test/new.test.mjs` instead of `node --test test/current.test.mjs`.", "stale"],
      ["Do not execute `node --test test/current.test.mjs`; use `node --test test/renamed.test.mjs` instead.", "stale"],
      ["`node --test test/current.test.mjs` is prohibited; use `node --test test/renamed.test.mjs`.", "stale"],
      ["`node --test test/current.test.mjs` was forbidden; use `node --test test/renamed.test.mjs`.", "stale"],
      ["`node --test test/current.test.mjs` is disabled; use `node --test test/renamed.test.mjs`.", "stale"],
      ["`node --test test/current.test.mjs` is unsupported; use `node --test test/renamed.test.mjs`.", "stale"],
    ]) {
      await writeFile(join(directory, "docs.md"), `# Test command\n\n${line}\n`);
      const [audit] = await auditMaintainerDefinition(new URL(`file://${directory}/SKILL.md`), new URL(`file://${directory}/`));
      assert.equal(audit.state, expected, line);
    }
  } finally { await rm(directory, { recursive: true }); }
});

test("maintainer marks an explicitly replaced Markdown command stale", async () => {
  const fixture = new URL("maintainer/current/", FIXTURE_ROOT);
  const directory = await mkdtemp(join(tmpdir(), "maintainer-replaced-command-"));
  try {
    const definition = (await readFile(new URL("SKILL.md", fixture), "utf8")).replace("package.json#scripts.test", "docs.md#test-command");
    await writeFile(join(directory, "SKILL.md"), definition);
    await writeFile(join(directory, "docs.md"), "# Test command\n\nDo not run `node --test test/current.test.mjs`; it was replaced by `node --test test/renamed.test.mjs`.\n");
    const [audit] = await auditMaintainerDefinition(new URL(`file://${directory}/SKILL.md`), new URL(`file://${directory}/`));
    assert.equal(audit.state, "stale");
    assert.match(audit.currentEvidence, /replaced/);
  } finally { await rm(directory, { recursive: true }); }
});

test("maintainer marks a directly prohibited Markdown command stale", async () => {
  const fixture = new URL("maintainer/current/", FIXTURE_ROOT);
  const directory = await mkdtemp(join(tmpdir(), "maintainer-never-run-command-"));
  try {
    const definition = (await readFile(new URL("SKILL.md", fixture), "utf8")).replace("package.json#scripts.test", "docs.md#test-command");
    await writeFile(join(directory, "SKILL.md"), definition);
    await writeFile(join(directory, "docs.md"), "# Test command\n\nNever run `node --test test/current.test.mjs`; use `node --test test/renamed.test.mjs` instead.\n");
    const [audit] = await auditMaintainerDefinition(new URL(`file://${directory}/SKILL.md`), new URL(`file://${directory}/`));
    assert.equal(audit.state, "stale");
  } finally { await rm(directory, { recursive: true }); }
});

test("maintainer marks a non-affirmative Markdown command mention ambiguous", async () => {
  const fixture = new URL("maintainer/current/", FIXTURE_ROOT);
  const directory = await mkdtemp(join(tmpdir(), "maintainer-command-mention-"));
  try {
    const definition = (await readFile(new URL("SKILL.md", fixture), "utf8")).replace("package.json#scripts.test", "docs.md#test-command");
    await writeFile(join(directory, "SKILL.md"), definition);
    await writeFile(join(directory, "docs.md"), "# Test command\n\nRun `node --test test/current.test.mjs`.\n");
    const [current] = await auditMaintainerDefinition(new URL(`file://${directory}/SKILL.md`), new URL(`file://${directory}/`));
    assert.equal(current.state, "current");
    await writeFile(join(directory, "docs.md"), "# Test command\n\nIs `node --test test/current.test.mjs` still the test command?\n");
    const [ambiguous] = await auditMaintainerDefinition(new URL(`file://${directory}/SKILL.md`), new URL(`file://${directory}/`));
    assert.equal(ambiguous.state, "ambiguous");
  } finally { await rm(directory, { recursive: true }); }
});

test("maintainer marks conflicting duplicate Markdown sections ambiguous", async () => {
  const fixture = new URL("maintainer/current/", FIXTURE_ROOT);
  const directory = await mkdtemp(join(tmpdir(), "maintainer-duplicate-section-"));
  try {
    const definition = (await readFile(new URL("SKILL.md", fixture), "utf8")).replace("package.json#scripts.test", "docs.md#test-command");
    await writeFile(join(directory, "SKILL.md"), definition);
    await writeFile(join(directory, "docs.md"), "# Test command\n\nRun `node --test test/current.test.mjs`.\n\n# Test command\n\nRun `node --test test/renamed.test.mjs`.\n");
    const [audit] = await auditMaintainerDefinition(new URL(`file://${directory}/SKILL.md`), new URL(`file://${directory}/`));
    assert.equal(audit.state, "ambiguous");
  } finally { await rm(directory, { recursive: true }); }
});

test("validators reject common recognizable credential values", async () => {
  const definition = await read("valid-definition/SKILL.md");
  const report = await read("valid-report.md");
  const dummyCredentials = [
    "Authorization: Basic ZHVtbXk6ZHVtbXk=",
    "Authorization: Bearer dummyBearerToken1234567890",
    "github_pat_11AAABBBCCCDDDEEE_1234567890123456789012",
    "AKIAIOSFODNN7EXAMPLE",
    "api_token = 'dummyHighEntropyTokenValue1234567890'",
    "-----BEGIN PRIVATE KEY-----",
    "https://dummy-user:dummy-password@example.com/path",
  ];
  for (const value of dummyCredentials) {
    assert.notDeepEqual(validateDefinition(definition.replace("Node.js is available as `node`.", value)), [], value);
    assert.notDeepEqual(validateReport(report.replace("- Target: example contract fixture", `- Target: ${value}`), definition), [], value);
  }
  assert.deepEqual(validateDefinition(definition.replace("Node.js is available as `node`.", "Use a redacted Authorization header fixture.")), []);
});

test("protocol artifacts require blast-radius fields and all maintainer classifications", async () => {
  const blast = await read("blast-radius/SKILL.md", SKILL_ROOT);
  for (const field of ["Changed paths", "Direct consumers", "Contracts", "Migrations", "Rollback scope", "Verification implications", "Unknowns"]) assert.match(blast, new RegExp(`^- ${field}:`, "m"));
  const maintain = await read("maintain-verification-skill/SKILL.md", SKILL_ROOT);
  for (const [state, evidence] of [["current", "establishes"], ["stale", "contradicts"], ["missing", "absent"], ["ambiguous", "conflict"]]) assert.match(maintain, new RegExp("- `" + state + "` —[^\\n]*" + evidence, "i"));
});

test("generator and maintainer require proposal before any write", async () => {
  for (const skill of ["create-verification-skill", "maintain-verification-skill"]) {
    const source = await read(`${skill}/SKILL.md`, SKILL_ROOT);
    const proposalHeading = skill === "create-verification-skill" ? "Present before writing" : "Propose before persistence";
    const writeHeading = skill === "create-verification-skill" ? "Write only the approved" : "Apply only the approved";
    inDocumentOrder(source, [proposalHeading, "explicit approval", writeHeading]);
    assert.match(source, /(?:approval is declined or absent|approval is declined, absent)[^\n]*stop/i);
  }
});

test("Phase 1 protocol encodes ISC-X2, ISC-X3, and ISC-X4 anti-criteria", async () => {
  const docs = await read("../../../docs/pi-verification.md", import.meta.url);
  assert.doesNotMatch(SKILLS.join("\n"), /deslop/);
  assert.match(docs, /neither indexes transcripts nor forwards them automatically/);
  assert.match(docs, /no workflow can resume execution across a process or host restart/);
  assert.match(docs, /adds no .*service/i);
});

test("verification skills preserve pinned provenance", async () => {
  for (const skill of SKILLS) { const source = await read(`${skill}/UPSTREAM.md`, SKILL_ROOT); assert.match(source, /889ec4b68fa5aab0e867dad71ec3fdf386ae48f3/); assert.match(source, /^- License: MIT$/m); assert.match(source, /^## Local deviations$/m); assert.match(source, /UPSTREAM-SKILL\.md/); }
});

test("control-cli remains a Herdr-only protocol without process-management code", async () => {
  const source = await read("control-cli/SKILL.md", SKILL_ROOT);
  assert.doesNotMatch(source, /\btmux\b/i); assert.doesNotMatch(source, /\b(?:child_process|spawnSync|execFile|execSync|fork)\s*\(/); assert.match(source, /does not implement a terminal, PTY, daemon, pane manager, process supervisor, status reporter/); assert.match(source, /`pi-interactive-subagents` \+ Herdr/); assert.match(source, /Do not improvise a substitute runtime/);
});
