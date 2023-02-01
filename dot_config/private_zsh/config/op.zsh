# set 1password completions if it's installed
if which op > /dev/null; then
  eval "$(op completion zsh)"
fi
