# Private Spin picker consumer

The mod implementation and behavior tests live in the private repository:

https://github.com/Attamusc/herdr-spin-picker

Local checkout: `~/projects/github.com/Attamusc/herdr-spin-picker`.

This dotfiles repository owns only:

- `dot_config/herdr-app/spin-picker-source.json`: exact private commit and SHA-256 of both runtime files.
- `dot_local/bin/executable_install-herdr-spin-picker`: authenticated, integrity-checked installer and targeted shortcut binding.
- `.chezmoiscripts/run_onchange_after_17-install-herdr-spin-picker.sh.tmpl`: runs when the pin or installer changes.
- `tests/herdr/test-spin-picker-install.py`: isolated consumer safety fixtures.

The runtime folder `~/.config/herdr-app/mods/spin-picker` is installer-owned, not chezmoi file-managed. The public dotfiles repository contains neither the mod source nor its behavior tests. The installer does not change the jj workbench, layouts, terminal structure, or Core lifecycle.

## Use

**Ctrl+P** opens the picker. This takes that key away from terminal programs, including the shell's previous-history action. The existing **Cmd+P** picker is unchanged.

- Type to filter; use the arrow keys to select a result.
- Select an **open space** and press **Enter** to switch to that exact space.
- Select a **Spin project** and press **Enter** to always create a new local space in that project's directory, even if another space already uses the repo. No modifier key is needed.
- Result labels show the action: **switch** for open spaces, **new space** for Spin projects.
- **Escape** dismisses the picker.

Without a shortcut:

```sh
herdr-app do mod.open --name spin-picker
```

The picker starts a shell, not development services. It does not clone projects or create jj workspaces. Existing remote spaces can be selected; Spin discovery and new project spaces stay local. The project list refreshes when the picker opens, with no background polling.

## Authentication and installation

Authenticate `gh` with access to `Attamusc/herdr-spin-picker` before bootstrap or a pin update. The installer checks repository privacy, fetches the two allowed files at an immutable full commit using `gh api`, and verifies both hashes before installing. No token is stored in either repository or a URL.

Apply only the consumer files, without unrelated scripts or configuration:

```sh
chezmoi apply --exclude=scripts --refresh-externals=never --error-on-conflict \
  ~/.local/bin/install-herdr-spin-picker \
  ~/.config/herdr-app/spin-picker-source.json
python3 ~/.local/bin/install-herdr-spin-picker
herdr-app check ~/.config/herdr-app/mods/spin-picker
```

An identical existing runtime can be adopted. Local edits, unknown files, missing installer-owned files, symlinks, invalid pins and hash mismatches are refused. Herdr-generated `gpui-kit.d.ts` and `jsconfig.json` are preserved as unowned metadata. The manifest is written last so an interrupted update can resume from verified old or new bytes.

The installer merges only `global.ctrl-p` into an existing `~/.config/herdr-app/keys.json`, preserving all other shortcuts. A conflicting Ctrl+P binding or scoped override stops installation instead of being overwritten. If Herdr has not created its key file yet, start Herdr once and rerun the installer; it will not create an incomplete replacement for Herdr's defaults.

Herdr reloads mods and keys live. No app or Core restart is needed.

## Verification and updates

Consumer fixtures use temporary home directories and a stub `gh`; they never change live runtime state:

```sh
python3 tests/herdr/test-spin-picker-install.py
```

The private repository owns `npm test` and the native mod check. Its Node tests mock the host; physical keyboard delivery still needs a manual smoke check in Herdr.

For an update, test and push the private source first. Then update the full commit and the two hashes in `spin-picker-source.json`, run the consumer fixtures and authenticated install, and commit the public pin change. Do not copy private source back into this repository.

Removing the Ctrl+P binding disables the shortcut without closing any project spaces or terminals.
