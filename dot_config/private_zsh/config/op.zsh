# set 1password completions if it's installed
if (( $+commands[op] )); then
  # source ~/.config/op/plugins.sh

  eval "$(op completion zsh)"
fi
