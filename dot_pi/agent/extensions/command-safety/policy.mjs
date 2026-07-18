const UNBOUNDED_ROOT = String.raw`["']?(?:\/|~|\$HOME|\$\{HOME\})["']?`;
const unboundedFind = new RegExp(String.raw`\bfind\s+${UNBOUNDED_ROOT}(?=\s|$)`);
const unboundedRecursiveSearch = new RegExp(
  String.raw`\b(?:grep|rg)\b[^\n;&|]*\s${UNBOUNDED_ROOT}(?=\s|$)`,
);
const discoveryCommand = /\b(?:find|grep|rg)\b/;
const longRunningCommand = /\b(?:cargo|npm|pnpm|yarn|go|pytest|make)\b/;

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
