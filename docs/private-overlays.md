# Machine-local overlays

`.data-private/` is gitignored and mirrors selected paths under committed
`.data/`. It holds structured configuration that must remain on one machine,
including work MCP servers and unpublished local Pi resources. Public rendering
must continue to work when the directory is absent.

Nothing in `.data-private/`, `.local-skills/`, `~/.gitconfig.local`, or
`~/.localrc` is synchronized or backed up by this repository. Keep an
independent encrypted backup when these values are required to rebuild a host.

## Pi settings

Private `packages` and `extensions` append to public arrays in public-first
order. Exact duplicates appear once. Other private top-level scalar values
override public scalars; nested objects are not promised whole-value replacement.

```json
{
  "packages": ["/machine/local/pi-package"],
  "extensions": ["/machine/local/extension.ts"]
}
```

Do not retain a local checkout when the same extension is supplied by a public
Git package; Pi treats the local path and Git URL as different package
identities and loads both.

### Pi model providers

`.data/pi/agent/model-providers.json` maps GPT and Claude model families to
providers. Override either family for one machine in
`.data-private/pi/agent/model-providers.json`; agent definitions and utility
extensions render from this map.

```json
{
  "gpt": "openai-codex",
  "claude": "anthropic"
}
```

When a machine does not use GitHub Copilot, its private Pi settings should also
set the matching `defaultProvider` and exclude the Copilot discovery extension:

```json
{
  "defaultProvider": "openai-codex",
  "extensions": ["-extensions/github-copilot-dynamic/index.ts"]
}
```

Provider authentication remains in Pi's mode-0600 `auth.json`, not in chezmoi
source data.

## MCP settings

MCP maps merge by server key. A private key adds a server or replaces the
complete public server value with the same key. Put machine-local servers in
`.data-private/pi/agent/mcp.json`; chezmoi renders that shared registry into
Pi's native format and OpenCode V2's `mcp.servers` format. OpenCode's rendered config is
mode `0600` because server entries may contain credentials. The template omits
the published `$schema` URL because it still describes V1; native settings are
validated against the V2 loader and release schema instead.

Use Pi's built-in MCP schema for this registry: `enabled: false` disables a
server, `exposure: "direct"` exposes its tools directly, and `timeout` is in
seconds. OpenCode rendering converts that timeout to milliseconds for both
`timeout.catalog` and `timeout.execution`. It inverts `enabled` into `disabled`
and sets `codemode: false` to retain V1's direct MCP tool exposure. HTTP OAuth
uses `callbackUrl` or `callbackPort`; OpenCode receives the corresponding
`redirect_uri`. For a shared HTTP server, put the explicit port in `callbackUrl`
when also setting `callbackPort`; the converter does not add a missing URL port.
It also does not translate Pi's `${NAME}` or `!command` credential interpolation
into OpenCode's syntax. Keep those Pi-only forms out of the shared registry.
Adapter-specific fields such as `directTools`, `disabled`, and
`requestTimeoutMs` are not part of this registry.

Pi loads `builtin:mcp` by default. Do not also configure `pi-mcp-adapter`.
Built-in server management uses `/mcp` or `pi mcp list`; default tool exposure
uses codemode, with tool search available for deferred tools. Existing server
credentials stay in machine-local configuration or the server's own auth store,
not in the public source.

```json
{
  "mcpServers": {
    "private-example": {
      "command": "example-command",
      "env": {
        "API_KEY": "stored-locally"
      }
    }
  }
}
```

Do not put real private values in documentation, fixtures, todo records, session
logs, or commits.

## Optional mise runtimes

Keep optional runtime versions in `~/.config/mise/config.local.toml`, which is
machine-owned rather than synchronized by chezmoi. Bootstrap runs mise from
`$HOME` with `MISE_CONFIG_DIR="$HOME/.config/mise"`, so normal global configuration
loads both the shared `config.toml` and machine-local `config.local.toml`.
For example, an LSP can require Ruby 4.0.1 while the ordinary Ruby default
remains latest:

```toml
[tools]
ruby = ["latest", "4.0.1"]
```

All declared versions are installed; the first entry supplies the ordinary
executable. A `latest` request alone does not retain an older version. Add
optional Ruby, Python, Bun, or Deno here only when needed; none is part of the
shared auto-install baseline. This file is not synchronized or backed up by
the repository.

The shared `[settings.upgrade] auto_prune = false` setting prevents future
upgrades from scheduling removal of replaced versions. It does not cancel
removals already recorded by earlier upgrades: mise can process those receipts
before an ordinary command, including `install` or `settings get`. Declare
required older versions before restoring them. Inspect pending candidates
without processing deferred removals using `mise --dry-run ls --prunable`.
See the [mise upgrade settings](https://mise.jdx.dev/configuration/settings.html#upgrade.auto_prune)
and [multiple-version rules](https://mise.jdx.dev/dev-tools/versions.html#multiple-versions).

## Other local seams

- `.local-skills/` links untracked skills into active skill roots.
- `~/.gitconfig.local` owns credentials, signing, and work-host Git settings.
- `~/.localrc` owns private shell configuration.

Use mode `0600` for private files and `0700` for private directories where
practical.
