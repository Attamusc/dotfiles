import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";

export function requireExactCandidateIdentity(candidate, revision) {
  if (!candidate) throw new Error("PI_WORKFLOWS_CANDIDATE must name a clean detached Git worktree");
  if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error("required candidate revision must be a full Git hash");
  const root = resolve(candidate);
  if (!existsSync(join(root, ".git"))) throw new Error("candidate must be a real detached Git worktree; marker-only archives are rejected");

  const head = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const branch = spawnSync("git", ["-C", root, "symbolic-ref", "-q", "HEAD"], { encoding: "utf8" }).stdout;
  const dirty = execFileSync("git", ["-C", root, "status", "--porcelain=v1", "--untracked-files=all"], { encoding: "utf8" });
  if (head !== revision) throw new Error(`candidate HEAD ${head} does not match required ${revision}`);
  if (branch.trim()) throw new Error("candidate must have a detached HEAD");
  if (dirty) throw new Error("candidate must have no modified tracked or untracked non-ignored files");
  return { root };
}

export function requireExactCandidate(candidate, revision) {
  const { root } = requireExactCandidateIdentity(candidate, revision);
  const compiler = join(root, "node_modules/.bin/tsc");
  if (!existsSync(compiler) || !realpathSync(compiler).startsWith(`${realpathSync(root)}/`)) {
    throw new Error("candidate-owned TypeScript compiler is required");
  }
  return { root, compiler };
}
