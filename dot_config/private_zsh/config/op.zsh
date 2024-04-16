# set 1password completions if it's installed
if which op > /dev/null; then
  # source ~/.config/op/plugins.sh

  eval "$(op completion zsh)"
fi
