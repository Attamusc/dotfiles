sg() {
  if [[ $# -eq 0 ]] && command -v tv >/dev/null 2>&1; then
    local selected
    selected=$(_spin_cached_projects | tv \
      --no-preview \
      --no-remote \
      --input-prompt="project> ")
    [[ -n "$selected" ]] && spin go "$selected"
  else
    spin go "$@"
  fi
}

_sg() {
  # Rewrite the command line so cobra's _spin sees "spin go ..."
  words=(spin go "${words[@]:1}")
  (( CURRENT += 1 ))
  _spin
}
compdef _sg sg
