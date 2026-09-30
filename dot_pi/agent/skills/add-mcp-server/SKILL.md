---
name: add-mcp-server
description: Add an MCP server to pi. Use when asked to "add", "configure", or "register" an MCP server. Handles both global and project-local configurations.
---

# Add an MCP Server

Pi's built-in MCP support reads `~/.pi/agent/mcp.json` globally and `.pi/mcp.json` in trusted projects. Prefer the global file for personal servers and credentials; use project scope only when the project needs the server. Project entries replace global entries with the same name. Confirm before replacing an existing entry. Never write literal secrets: use `${NAME}` or a whole-value `!command` interpolation.

For a simple stdio server, run `pi mcp add name -- command arg...`; for project scope use `pi mcp add -l name -- command arg...`. For HTTP, use `pi mcp add name --url https://example.com/mcp --bearer-token-env-var TOKEN_NAME`. The CLI also supports `--env KEY=VALUE`, `--cwd`, `--header`, and `--exposure`. These commands change configuration but do not connect.

For settings the CLI does not support, read and edit the appropriate JSON file under `mcpServers`. A stdio entry uses `command` (one executable), `args` (array), optional `env` and `cwd`. An HTTP entry uses `url`, optional `headers` and `oauth` object (`clientId`, `clientSecret`, `scope`, `callbackUrl`, `callbackPort`). Both accept `enabled` (boolean, default true), `timeout` (seconds, default 60), `exposure`, and `toolExposure`. Do not use adapter-only fields such as `disabled`, `directTools`, `requestTimeoutMs`, `auth`, or `samplingAutoApprove`.

Exposure defaults to `codemode`, which makes tools available to `codemode` scripts without declaring each one. Use `codemode-deferred` for large, rarely used lists; `deferred` for discovery through `tool_search`; `direct` to declare tools directly; or `hidden` to prevent calls. Discover tools inside codemode with `searchTools()` and call them as `tools.mcp__name__tool(args)`. `tool_search` loads undeclared tools for direct calls. Pick exposure based on the needed interaction, not on a legacy `directTools` flag.

Run `pi mcp list` to check the connection and tool list (it exits nonzero on errors). OAuth HTTP servers may require `pi mcp login name`, which opens an approval page; ask the user to approve it. In a running Pi session, `/mcp` shows status and errors. Ask the user to run `/reload` or open a new session after changing configuration. Never report successful connectivity without checking it.
