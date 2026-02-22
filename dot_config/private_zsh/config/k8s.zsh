# Load kubectl completion if it's installed
if (( $+commands[kubectl] )); then source <(kubectl completion zsh); fi
