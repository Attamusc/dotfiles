export PATH="$HOME/.local/share/bob/nvim-bin:$PATH"

if (( $+commands[bob] )); then
  eval "$(bob complete zsh)"
fi
