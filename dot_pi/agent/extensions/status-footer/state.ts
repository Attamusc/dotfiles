import { existsSync } from "node:fs";
import { dirname, join, parse } from "node:path";

export type JjState = {
  kind: "jj";
  changeId: string;
  currentBookmarks: string[];
  nearestBookmark: string | null;
  ahead: number | null;
  conflicts: number;
  additions: number;
  deletions: number;
};

export type GitState = {
  kind: "git";
  branch: string;
  dirty: boolean;
};

export type VcsState = JjState | GitState | null;

export const JJ_REVSET = "latest(::@ & bookmarks())::@ | @";
export const JJ_TEMPLATE = [
  'if(current_working_copy, "current\\t" ++ change_id.shortest(8) ++ "\\t" ++ ',
  'local_bookmarks.map(|b| b.name()).join(",") ++ "\\t" ++ ',
  'conflicted_files.len() ++ "\\t" ++ self.diff().stat().total_added() ++ "\\t" ++ ',
  'self.diff().stat().total_removed() ++ "\\n", ',
  'if(local_bookmarks, "base\\t" ++ change_id.shortest(8) ++ "\\t" ++ ',
  'local_bookmarks.map(|b| b.name()).join(",") ++ "\\n", "step\\n"))',
].join("");

export function findJjWorkspace(start: string): string | null {
  let directory = start;
  const root = parse(directory).root;

  while (true) {
    if (existsSync(join(directory, ".jj"))) return directory;
    if (directory === root) return null;
    directory = dirname(directory);
  }
}

export function parseJjState(output: string): JjState | null {
  const lines = output.split("\n").filter(Boolean);
  const current = lines.find((line) => line.startsWith("current\t"));
  if (!current) return null;

  const [, changeId = "", bookmarkText = "", conflicts = "0", additions = "0", deletions = "0"] =
    current.split("\t");
  if (!changeId) return null;

  const base = lines.find((line) => line.startsWith("base\t"));
  const nearestBookmark = base?.split("\t")[2]?.split(",").filter(Boolean)[0] ?? null;
  const currentBookmarks = bookmarkText.split(",").filter(Boolean);
  const revisionsAboveBase = lines.filter(
    (line) => line === "step" || line.startsWith("base\t"),
  ).length;

  return {
    kind: "jj",
    changeId,
    currentBookmarks,
    nearestBookmark,
    ahead: nearestBookmark ? revisionsAboveBase : null,
    conflicts: Number(conflicts) || 0,
    additions: Number(additions) || 0,
    deletions: Number(deletions) || 0,
  };
}

export function parseGitState(output: string): GitState | null {
  const lines = output.split("\n").filter(Boolean);
  const head = lines.find((line) => line.startsWith("# branch.head "))?.slice(14);
  if (!head) return null;

  const oid = lines.find((line) => line.startsWith("# branch.oid "))?.slice(13);
  const branch = head === "(detached)" ? `detached@${oid?.slice(0, 8) || "unknown"}` : head;
  const dirty = lines.some((line) => !line.startsWith("# "));

  return { kind: "git", branch, dirty };
}

export function formatTokenCount(tokens: number): string {
  if (tokens < 1_000) return `${tokens}`;
  if (tokens < 1_000_000) return `${Math.round(tokens / 1_000)}k`;
  return `${(tokens / 1_000_000).toFixed(1)}M`;
}

export function formatCost(cost: number, subscription: boolean): string {
  let value: string;
  if (cost === 0) value = "$0";
  else if (cost < 1) value = `$${cost.toFixed(3)}`;
  else value = `$${cost.toFixed(2)}`;
  return subscription ? `${value} (sub)` : value;
}

export function sanitizeLabel(text: string): string {
  return text
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeStatusLine(text: string): string {
  return text.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();
}
