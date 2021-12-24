alias gcd='cd "`git rev-parse --show-toplevel`"'
alias grm="git status | grep deleted | awk '{print \$3}' | xargs git rm"
alias gf='git fuzzy'

g() {
  if [[ $# > 0 ]]; then
    git $@
  else
    git status --short --branch
  fi
}
