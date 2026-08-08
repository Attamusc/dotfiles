if [[ -d "$HOME/.cargo" ]]; then
  source "$HOME/.cargo/env"
  path=("$HOME/.local/bin" ${path:#"$HOME/.local/bin"})
  export PATH
fi
