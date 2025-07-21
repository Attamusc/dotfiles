# Project Manager Shell Integration
# Add this to your .bashrc, .zshrc, or equivalent shell configuration file

# Main pm function that handles directory changing
function pm() {
  local pm_script_path="$HOME/.local/bin/pm"  # Adjust this path to where you install the script
  
  # Handle special commands that don't need directory changing
  case "$1" in
    "help"|"list"|"update"|"clean"|"")
      node "$pm_script_path" "$@"
      return $?
      ;;
  esac
  
  # For repo commands, capture the output and change directory
  local result
  result=$(node "$pm_script_path" "$@" 2>/dev/null)
  local exit_code=$?
  
  if [ $exit_code -eq 0 ] && [ -n "$result" ] && [ -d "$result" ]; then
    echo "Changing to: $result"
    cd "$result"
  else
    # If there was an error, run again to show the error message
    node "$pm_script_path" "$@"
    return $exit_code
  fi
}

# Optional: Add tab completion for common repo patterns
# This is a basic example - you can expand it based on your common repos
if [ -n "$BASH_VERSION" ]; then
  _pm_completion() {
    local cur="${COMP_WORDS[COMP_CWORD]}"
    local opts="help list update clean"
    
    if [ ${COMP_CWORD} -eq 1 ]; then
      COMPREPLY=($(compgen -W "$opts" -- "$cur"))
    fi
  }
  complete -F _pm_completion pm
elif [ -n "$ZSH_VERSION" ]; then
  _pm() {
    local context state state_descr line
    local -a commands
    
    commands=(
      'help:Show help information'
      'list:List all projects'
      'update:Update all projects'
      'clean:Show projects for cleanup'
    )
    
    _arguments \
      '1: :->command' \
      '*: :->args'
    
    case $state in
      command)
        _describe 'commands' commands
        ;;
    esac
  }
  compdef _pm pm
fi

# Alias for common shortcuts
alias pml="pm list"
alias pmu="pm update"
alias pmc="pm clean"
