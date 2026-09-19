import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../..");

async function source(path) {
  return readFile(join(root, path), "utf8");
}

test("CLI design guidance defines the complete caller contract", async () => {
  const skill = await source("dot_agents/skills/codebase-design/SKILL.md");
  for (const requirement of [
    /explicit target and context/i,
    /no hidden current-working-directory assumptions/i,
    /machine-readable output/i,
    /stdout.*stderr.*exit status/i,
    /input, output, and time bounds/i,
    /truncation or failure/i,
    /prerequisites and unsupported states/i,
    /do not invent a fallback/i,
    /read-only or mutating/i,
    /cleanup/i,
    /source and version/i,
    /GitHub.*Obsidian/i,
  ]) assert.match(skill, requirement);
});

test("simplifier guidance rejects the four avoidable clutter classes", async () => {
  const skill = await source("dot_agents/skills/code-simplifier/SKILL.md");
  assert.match(skill, /one caller or no demonstrated requirement/i);
  assert.match(skill, /removed or deprecated cases/i);
  assert.match(skill, /library boundary/i);
  assert.match(skill, /rationale, invariants, contracts, or non-obvious safety constraints/i);
  assert.match(skill, /unrelated policy, formatting, or cleanup churn/i);
  assert.match(skill, /preserv(?:e|ing) (?:exact )?behavior/i);
  assert.match(skill, /recently modified or touched/i);
});

test("delegation and workflow guidance defines bounded ownership and evidence contracts", async () => {
  const agents = await source("dot_pi/agent/AGENTS.md");
  for (const requirement of [
    /target, scope, constraints, expected output, required evidence, and stop condition/i,
    /findings, evidence, and blockers/i,
    /parent owns synthesis and decisions/i,
    /Do not forward child transcripts/i,
    /command or artifact output/i,
    /agent assertion/i,
    /unverifiable/i,
    /Andon pause/i,
    /repeated failure, contradictory evidence, unsafe mutation, or missing owner/i,
    /writable owner and paths/i,
    /dependencies, fan-out and concurrency, time budget or timeout, and cleanup or rollback/i,
    /producer or synthesizer.*verifier/i,
    /partial evidence and the failure reason/i,
    /plan or handoff, VCS state, todo state, and relevant tests/i,
    /does not resume execution across restarts/i,
  ]) assert.match(agents, requirement);
  assert.match(agents, /Herdr remains the sole lifecycle owner/i);
});

test("managed rendering preserves Phase 4 guidance", async () => {
  const renderedAgents = execFileSync("chezmoi", ["--source", root, "cat", join(homedir(), ".pi/agent/AGENTS.md")], { cwd: root, encoding: "utf8" });
  const renderedDesign = execFileSync("chezmoi", ["--source", root, "cat", join(homedir(), ".agents/skills/codebase-design/SKILL.md")], { cwd: root, encoding: "utf8" });
  assert.match(renderedAgents, /Andon pause/i);
  assert.match(renderedAgents, /does not resume execution across restarts/i);
  assert.match(renderedDesign, /machine-readable output/i);
  assert.match(renderedDesign, /no hidden current-working-directory assumptions/i);
});
