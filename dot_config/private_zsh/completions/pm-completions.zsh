# Helper function for case-insensitive comparison
_pm_case_insensitive_match() {
  local str1="$1"
  local str2="$2"
  local pattern="$3"  # "exact", "prefix", or "contains"
  
  # Convert to lowercase using tr (portable across shells)
  local lower1=$(echo "$str1" | tr '[:upper:]' '[:lower:]')
  local lower2=$(echo "$str2" | tr '[:upper:]' '[:lower:]')
  
  case "$pattern" in
    "exact")
      [[ "$lower1" == "$lower2" ]]
      ;;
    "prefix")
      [[ "$lower1" == "$lower2"* ]]
      ;;
    "contains")
      [[ "$lower1" == *"$lower2"* ]]
      ;;
  esac
}
_pm_get_repos() {
  local github_dir="$PROJECTS/github.com"
  
  if [ ! -d "$github_dir" ]; then
    return 1
  fi
  
  find "$github_dir" -mindepth 2 -maxdepth 2 -type d 2>/dev/null | while read -r repo_path; do
    local owner=$(basename "$(dirname "$repo_path")")
    local repo=$(basename "$repo_path")
    echo "$owner/$repo"
  done | sort
}

# Helper function to get unique owners
_pm_get_owners() {
  local github_dir="$PROJECTS/github.com"
  
  if [ ! -d "$github_dir" ]; then
    return 1
  fi
  
  find "$github_dir" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | while read -r owner_path; do
    basename "$owner_path"
  done | sort
}

# Tab completion for Bash
if [ -n "$BASH_VERSION" ]; then
  _pm_completion() {
    local cur="${COMP_WORDS[COMP_CWORD]}"
    
    if [ ${COMP_CWORD} -eq 1 ]; then
      local commands="help list update clean"
      local all_completions=()
      
      # Add commands
      for cmd in $commands; do
        if [[ "$cmd" == "$cur"* ]]; then
          all_completions+=("$cmd")
        fi
      done
      
      # Determine what to complete based on input
      if [[ "$cur" == */* ]]; then
        # Has slash - complete repo paths
        local repos
        repos=$(_pm_get_repos 2>/dev/null)
        if [ -n "$repos" ]; then
          while IFS= read -r repo; do
            if [ -n "$repo" ] && _pm_case_insensitive_match "$repo" "$cur" "prefix"; then
              all_completions+=("$repo")
            fi
          done <<< "$repos"
        fi
      elif [[ -n "$cur" ]] && [[ "$cur" == [a-zA-Z]* ]]; then
        # Check for exact owner match
        local owners
        owners=$(_pm_get_owners 2>/dev/null)
        local exact_owner=""
        
        if [ -n "$owners" ]; then
          while IFS= read -r owner; do
            if [ -n "$owner" ] && _pm_case_insensitive_match "$owner" "$cur" "exact"; then
              exact_owner="$owner"
              break
            fi
          done <<< "$owners"
        fi
        
        if [ -n "$exact_owner" ]; then
          # Exact owner match - show their repos
          local repos
          repos=$(_pm_get_repos 2>/dev/null)
          if [ -n "$repos" ]; then
            while IFS= read -r repo; do
              if [ -n "$repo" ]; then
                local repo_owner="${repo%%/*}"
                if [[ "$repo_owner" == "$exact_owner" ]]; then
                  all_completions+=("$repo")
                fi
              fi
            done <<< "$repos"
          fi
        else
          # Partial match - show matching owners
          if [ -n "$owners" ]; then
            while IFS= read -r owner; do
              if [ -n "$owner" ] && _pm_case_insensitive_match "$owner" "$cur" "prefix"; then
                all_completions+=("$owner")
              fi
            done <<< "$owners"
          fi
        fi
      else
        # Empty input - show owners and commands
        local owners
        owners=$(_pm_get_owners 2>/dev/null)
        if [ -n "$owners" ]; then
          while IFS= read -r owner; do
            if [ -n "$owner" ]; then
              all_completions+=("$owner")
            fi
          done <<< "$owners"
        fi
      fi
      
      # Use fzf for interactive completion if available and we have multiple options
      if command -v fzf >/dev/null 2>&1 && [ ${#all_completions[@]} -gt 1 ] && [ -n "$cur" ]; then
        local selected
        selected=$(printf '%s\n' "${all_completions[@]}" | fzf \
          --height=40% \
          --layout=reverse \
          --border \
          --prompt="pm > " \
          --query="$cur" \
          --select-1 \
          --exit-0 \
          --preview='echo "Option: {}"' \
          --preview-window=up:1 \
          2>/dev/tty)
        
        if [ -n "$selected" ]; then
          READLINE_LINE="pm $selected"
          READLINE_POINT=${#READLINE_LINE}
          return 0
        fi
      fi
      
      # Regular completion
      COMPREPLY=($(compgen -W "${all_completions[*]}" -- "$cur"))
    fi
  }
  
  complete -F _pm_completion pm
fi

# Tab completion for Zsh
if [ -n "$ZSH_VERSION" ]; then
  # Fast completion function with case-insensitive matching for all options
  _pm() {
    local current_word="$words[CURRENT]"
    local -a all_matches
    
    # Get basic commands
    local commands=("help" "list" "update" "clean")
    
    # Add commands that match (case-insensitive)
    for cmd in "${commands[@]}"; do
      if _pm_case_insensitive_match "$cmd" "$current_word" "prefix"; then
        all_matches+=("$cmd")
      fi
    done
    
    # Get all owners and repos for case-insensitive matching
    local owners repos
    owners=$(_pm_get_owners 2>/dev/null)
    repos=$(_pm_get_repos 2>/dev/null)
    
    # Add all matching owners (case-insensitive)
    if [ -n "$owners" ]; then
      while IFS= read -r owner; do
        if [ -n "$owner" ] && _pm_case_insensitive_match "$owner" "$current_word" "prefix"; then
          all_matches+=("$owner")
        fi
      done <<< "$owners"
    fi
    
    # Add all matching repos (case-insensitive)
    if [ -n "$repos" ]; then
      while IFS= read -r repo; do
        if [ -n "$repo" ] && _pm_case_insensitive_match "$repo" "$current_word" "prefix"; then
          all_matches+=("$repo")
        fi
      done <<< "$repos"
    fi
    
    # Remove duplicates while preserving order
    local -a unique_matches
    for match in "${all_matches[@]}"; do
      local duplicate=false
      for existing in "${unique_matches[@]}"; do
        if [[ "$existing" == "$match" ]]; then
          duplicate=true
          break
        fi
      done
      if [ "$duplicate" = false ]; then
        unique_matches+=("$match")
      fi
    done
    
    # Add completions - use different approaches for different types
    if [ ${#unique_matches[@]} -gt 0 ]; then
      local -a commands_desc owners_desc repos_desc
      
      for match in "${unique_matches[@]}"; do
        case "$match" in
          "help"|"list"|"update"|"clean")
            commands_desc+=("$match:Command")
            ;;
          */*)
            repos_desc+=("$match:Repository")
            ;;
          *)
            # Owner - add without space for easier continuation
            owners_desc+=("$match:Owner")
            ;;
        esac
      done
      
      # Add completions with different space handling
      if [ ${#commands_desc[@]} -gt 0 ]; then
        _describe 'commands' commands_desc
      fi
      if [ ${#repos_desc[@]} -gt 0 ]; then
        _describe 'repositories' repos_desc
      fi
      if [ ${#owners_desc[@]} -gt 0 ]; then
        # For owners, prevent space to allow easy continuation with /
        local -a owner_names
        for desc in "${owners_desc[@]}"; do
          owner_names+=("${desc%%:*}")
        done
        compadd -S '' -d owners_desc -a owner_names
      fi
    fi
  }
  
  # Separate fzf widget that only triggers on manual key bindings
  if command -v fzf >/dev/null 2>&1; then
    _pm_fzf_widget() {
      local tokens=(${(z)LBUFFER})
      local cmd="${tokens[1]}"
      
      if [[ "$cmd" == "pm" ]]; then
        local current="${tokens[2]:-}"
        local all_options=()
        
        # Add commands
        all_options+=("help" "list" "update" "clean")
        
        # Add owners
        local owners
        owners=$(_pm_get_owners 2>/dev/null)
        if [ -n "$owners" ]; then
          while IFS= read -r owner; do
            if [ -n "$owner" ]; then
              all_options+=("$owner")
            fi
          done <<< "$owners"
        fi
        
        # Add repos
        local repos
        repos=$(_pm_get_repos 2>/dev/null)
        if [ -n "$repos" ]; then
          while IFS= read -r repo; do
            if [ -n "$repo" ]; then
              all_options+=("$repo")
            fi
          done <<< "$repos"
        fi
        
        # Use fzf to select
        local selected
        selected=$(printf '%s\n' "${all_options[@]}" | fzf \
          --height=40% \
          --layout=reverse \
          --border \
          --prompt="pm > " \
          --query="$current" \
          --select-1 \
          --exit-0 \
          --preview='echo "Option: {}"' \
          --preview-window=up:1)
        
        if [ -n "$selected" ]; then
          LBUFFER="pm $selected"
          RBUFFER=""
        fi
      fi
      
      zle reset-prompt
    }
    
    zle -N _pm_fzf_widget
    bindkey '^ ' _pm_fzf_widget    # Ctrl+Space
    bindkey '^[f' _pm_fzf_widget   # Alt+f
  fi
  
  compdef _pm pm
fi
