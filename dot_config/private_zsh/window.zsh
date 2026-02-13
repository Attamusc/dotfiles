# Sets the window/tab title via OSC 2 escape sequences.
#
# At a prompt:  full working directory path (with ~ substitution)
# Running a command:  directory basename + command name
#
# Examples:
#   idle prompt  ->  ~/projects/myapp
#   running nvim ->  myapp: nvim

# Set the terminal title using OSC 2
function _set_title() {
  print -Pn "\e]2;$1\a"
}

# Called before each prompt — show the full working directory
function _title_precmd() {
  _set_title "%~"
}

# Called before command execution — show basename of cwd + command
function _title_preexec() {
  # $1 is the command string as typed; strip control characters
  local cmd="${1//[[:cntrl:]]/}"
  _set_title "%1~: $cmd"
}

autoload -Uz add-zsh-hook
add-zsh-hook precmd _title_precmd
add-zsh-hook preexec _title_preexec
