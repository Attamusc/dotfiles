export BOB_CONFIG="$HOME/.config/bob/config.toml"
export PATH="$HOME/.local/share/bob/nvim-bin:$PATH"

if (( $+commands[bob] )); then
  eval "$(bob complete zsh)"
fi
