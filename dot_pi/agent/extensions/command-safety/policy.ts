import { isAbsolute, relative, resolve } from "node:path";
import { tmpdir } from "node:os";

const UNBOUNDED_ROOT = String.raw`["']?(?:\/|~|\$HOME|\$\{HOME\})["']?`;
const unboundedFind = new RegExp(String.raw`\bfind\s+${UNBOUNDED_ROOT}(?=\s|$)`);
const unboundedRecursiveSearch = new RegExp(
  String.raw`\b(?:grep|rg)\b[^\n;&|]*\s${UNBOUNDED_ROOT}(?=\s|$)`,
);
const discoveryCommand = /\b(?:find|grep|rg)\b/;
const longRunningCommand = /\b(?:cargo|npm|pnpm|yarn|go|pytest|make)\b/;

const recoverableDestructiveCommands = [
  ["jj abandon", /\bjj\s+abandon\b/],
  ["jj undo", /\bjj\s+undo\b/],
  ["git reset --hard", /\bgit\s+reset\b[^\n;&|]*--hard\b/],
  ["chezmoi apply --force", /\bchezmoi\s+apply\b[^\n;&|]*--force\b/],
];

const destructiveCommands = [
  ["forced git push", /\bgit\s+push\b[^\n;&|]*(?:--force(?:-with-lease)?\b|-f(?:\s|$))/],
  ["pull-request merge", /\bgh\s+pr\s+merge\b/],
  ["piped remote shell", /\bcurl\b[^\n|]*\|\s*(?:ba|z)?sh\b/],
  ["Kubernetes deletion", /\bkubectl\s+delete\b/],
  ["Terraform destroy", /\bterraform\s+destroy\b/],
  ["destructive SQL", /\b(?:DROP|TRUNCATE)\s+(?:TABLE|DATABASE|SCHEMA)\b/i],
];

// Scratch space is OS-managed and agents write there constantly. Gating it would make the
// prompt routine, and a routinely-approved gate is worse than none: it trains the reflex
// while implying coverage it does not have.
const scratchRoots = [tmpdir(), "/tmp", "/private/tmp", process.env.TMPDIR]
  .filter(Boolean)
  .map((root) => resolve(root));

function isScratch(absoluteTarget) {
  return scratchRoots.some((root) => {
    const within = relative(root, absoluteTarget);
    return within !== "" && !within.startsWith("..") && !isAbsolute(within);
  });
}

function destructiveRm(command, isSubagent) {
  const match = command.match(/\brm\s+((?:-[^\s]+\s+)+)([^\s;&|]+)/);
  if (!match) return false;

  const flags = match[1].replaceAll(/[^A-Za-z]/g, "");
  if (!flags.includes("r") || !flags.includes("f")) return false;

  const target = match[2].replace(/^["']|["']$/g, "");
  const homeRelative = /^(?:~|\$HOME|\$\{HOME\})(?:\/|$)/.test(target);

  if (!homeRelative && isScratch(resolve(target))) return false;
  if (isSubagent) return true;
  if (homeRelative) return true;

  const absoluteTarget = resolve(target);
  const fromWorkspace = relative(process.cwd(), absoluteTarget);
  return isAbsolute(target) || target.startsWith("..")
    ? fromWorkspace === ".." || fromWorkspace.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
    : false;
}

export function inspectDestructiveCommand(command, { isSubagent }) {
  let commandClass;

  if (destructiveRm(command, isSubagent)) {
    commandClass = "recursive forced removal";
  } else {
    commandClass = destructiveCommands.find(([, pattern]) => pattern.test(command))?.[0];
  }

  if (!commandClass && isSubagent) {
    commandClass = recoverableDestructiveCommands.find(([, pattern]) => pattern.test(command))?.[0];
  }
  if (!commandClass) return undefined;

  const reason = `${commandClass} requires per-invocation authorization.`;
  return isSubagent ? { block: true, reason } : { confirm: true, reason };
}

export function inspectDiscoveryCommand(command) {
  if (unboundedFind.test(command) || unboundedRecursiveSearch.test(command)) {
    return {
      block: true,
      reason:
        "Unbounded filesystem discovery is disabled for subagents. Use the todo tool for TODO references, or search the current repository or a named directory.",
    };
  }

  if (discoveryCommand.test(command) && !longRunningCommand.test(command)) {
    return { timeout: 30 };
  }

  return undefined;
}
