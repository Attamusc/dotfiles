import crypto from "node:crypto";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { mkdir, rename, symlink } from "node:fs/promises";
import path from "node:path";

export function repositoryRoot(cwd) {
  let current = realpathSync(cwd);
  while (true) {
    if (existsSync(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return realpathSync(cwd);
    current = parent;
  }
}

export function projectScopeSlug(cwd) {
  const root = repositoryRoot(cwd);
  const digest = crypto.createHash("sha256").update(root).digest("hex").slice(0, 8);
  return `${path.basename(root)}-${digest}`;
}

export function scopedTodosDir(cwd, historyDir) {
  return path.join(historyDir, projectScopeSlug(cwd), "todos");
}

async function linkLegacyTodos(legacyTodos, scopedTodos) {
  await mkdir(path.dirname(legacyTodos), { recursive: true });
  try {
    await symlink(scopedTodos, legacyTodos, "dir");
  } catch (error) {
    if (
      error?.code === "EEXIST" &&
      existsSync(legacyTodos) &&
      realpathSync(legacyTodos) === realpathSync(scopedTodos)
    ) {
      return;
    }
    throw error;
  }
}

export async function migrateLegacyTodos(cwd, historyDir) {
  const legacyTodos = path.join(historyDir, path.basename(cwd), "todos");
  const scopedTodos = scopedTodosDir(cwd, historyDir);
  if (legacyTodos === scopedTodos) return;

  if (!existsSync(scopedTodos) && existsSync(legacyTodos) && lstatSync(legacyTodos).isSymbolicLink()) {
    return;
  }

  if (existsSync(scopedTodos)) {
    if (existsSync(legacyTodos) && realpathSync(legacyTodos) !== realpathSync(scopedTodos)) {
      throw new Error(`Both legacy and repository-scoped todo directories exist: ${legacyTodos}, ${scopedTodos}`);
    }
    if (!existsSync(legacyTodos)) await linkLegacyTodos(legacyTodos, scopedTodos);
    return;
  }
  if (!existsSync(legacyTodos)) return;

  await mkdir(path.dirname(scopedTodos), { recursive: true });
  try {
    await rename(legacyTodos, scopedTodos);
  } catch (error) {
    if (!(error?.code === "ENOENT" && existsSync(scopedTodos))) throw error;
  }
  await linkLegacyTodos(legacyTodos, scopedTodos);
}
