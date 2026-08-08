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

## MCP settings

MCP maps merge by server key. A private key adds a server or replaces the
complete public server value with the same key.

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

## Other local seams

- `.local-skills/` links untracked skills into active skill roots.
- `~/.gitconfig.local` owns credentials, signing, and work-host Git settings.
- `~/.localrc` owns private shell configuration.

Use mode `0600` for private files and `0700` for private directories where
practical.
