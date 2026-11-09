# Private jj Workbench consumer

The implementation, native/fixture tests, release packaging and reference layout live in the **private** repository:

https://github.com/Attamusc/herdr-jj-workbench

Local checkout: `~/projects/github.com/Attamusc/herdr-jj-workbench`.

This dotfiles repository owns only:

- `dot_config/herdr-app/layouts/jj-main.json`: personal layout; no updater overwrites it.
- `dot_config/herdr-app/jj-workbench-release.json`: exact private release version and archive SHA-256.
- `dot_local/bin/executable_install-herdr-jj-workbench`: authenticated, integrity-checked consumer.
- `.chezmoiscripts/run_onchange_after_16-install-herdr-jj-workbench.sh.tmpl`: runs when the pin or installer changes.
- `tests/herdr/test-jj-workbench-release.py`: consumer safety/update fixtures.

## Authentication and ownership

Authenticate `gh` with access to `Attamusc/herdr-jj-workbench` before first bootstrap or a pin update. The installer uses `gh release download`; no token is embedded in dotfiles, URLs or rendered templates. It refuses to download unless the repository reports private, and verifies the archive SHA before opening it.

The runtime folder `~/.config/herdr-app/mods/jj-workbench` is installer-owned, **not chezmoi file-managed**. The personal layout, keybindings, settings and theme remain independent. Existing identical runtime files can be adopted; local edits, unknown files, symlinks, archive traversal and invalid payloads are refused. Generated type/jsconfig files are retained. `.jj-install-*` is a reserved temporary-file namespace.

An interrupted pin update may contain old bytes or verified new bytes. Re-running accepts only that exact transition, completes changed/added files, removes only old manifest-owned obsolete files and writes the new manifest last. It never blesses arbitrary local edits.

## Targeted install

```sh
chezmoi apply --exclude=scripts --refresh-externals=never \
  ~/.local/bin/install-herdr-jj-workbench \
  ~/.config/herdr-app/jj-workbench-release.json
python3 ~/.local/bin/install-herdr-jj-workbench
```

Do not broad-apply dotfiles for this migration. Normal subsequent bootstrap uses the pinned after-script. Update the version/hash only after standalone checks pass and a private release is verified.

Consumer checks:

```sh
python3 tests/herdr/test-jj-workbench-release.py
```

Standalone checks and supported Herdr/jj versions are documented in the private repository. The mod uses stored-state reads plus explicit Refresh, commit-and-new and forget-only workspace management; forgetting retains files and terminals. It does not initialize/migrate repositories or install a second lifecycle manager.

Rollback can select the untouched shipped layout:

```sh
herdr-app do layout.switch --name main
```

To change package version, deliberately select a compatible private release and its SHA pin. A source edit or package update is never an instruction to delete workspace directories, close terminals or restart Core.
