# Project Manager Shell Integration
# Add this to your .bashrc, .zshrc, or equivalent shell configuration file

# Main pm function that handles directory changing
function pm() {
  local pm_script_path="$HOME/.local/bin/pm"  # Adjust this path to where you install the script
  
  # Check if script exists
  if [ ! -f "$pm_script_path" ]; then
    echo "Error: pm script not found at $pm_script_path" >&2
    echo "Please make sure the Node.js script is installed at the correct path" >&2
    return 1
  fi
  
  # Handle special commands that don't need directory changing
  case "$1" in
    "help"|"list"|"update"|"clean"|"")
      node "$pm_script_path" "$@"
      return $?
      ;;
  esac
  
  local repo_arg="$1"
  
  # Check if argument looks like a partial repo name (no slash, but has letters)
  # and is NOT an exact owner/repo match
  if [[ "$repo_arg" != */* ]] && [[ -n "$repo_arg" ]] && [[ "$repo_arg" == [a-zA-Z]* ]]; then
    # Check if this is an exact owner match (case-insensitive)
    local owners
    owners=$(_pm_get_owners 2>/dev/null)
    local exact_owner=""
    
    if [ -n "$owners" ]; then
      while IFS= read -r owner; do
        if _pm_case_insensitive_match "$owner" "$repo_arg" "exact"; then
          exact_owner="$owner"
          break
        fi
      done <<< "$owners"
    fi
    
    if [ -z "$exact_owner" ]; then
      # This might be a partial owner name, try fuzzy matching
      local fuzzy_result
      fuzzy_result=$(_pm_fuzzy_select "$repo_arg" 2>/dev/null)
      local fuzzy_exit=$?
      
      if [ $fuzzy_exit -eq 0 ] && [ -n "$fuzzy_result" ]; then
        echo "Selected: $fuzzy_result"
        repo_arg="$fuzzy_result"
      elif [ $fuzzy_exit -eq 1 ]; then
        # No matches found, proceed with original argument (might be a new repo)
        :
      else
        # User cancelled fuzzy selection
        return 1
      fi
    fi
  fi
  
  # For repo commands, capture the output and change directory
  local full_output
  full_output=$(node "$pm_script_path" "$repo_arg" 2>&1)
  local exit_code=$?
  
  if [ $exit_code -eq 0 ]; then
    # Extract the directory path (last line that looks like a path)
    local result
    result=$(echo "$full_output" | grep -E '^/' | tail -n 1)
    
    if [ -n "$result" ] && [ -d "$result" ]; then
      echo "Changing to: $result"
      cd "$result"
    else
      # Show the full output if we can't extract a valid path
      echo "$full_output"
    fi
  else
    # If there was an error, show the full output
    echo "$full_output"
    return $exit_code
  fi
}

# Enhanced fuzzy selection with case-insensitive matching
_pm_fuzzy_select() {
  local partial="$1"
  local matches=()
  
  # Get all owners and repos
  local owners
  owners=$(_pm_get_owners 2>/dev/null)
  local repos
  repos=$(_pm_get_repos 2>/dev/null)
  
  # Check for exact owner match first (case-insensitive)
  local exact_owner=""
  if [ -n "$owners" ]; then
    while IFS= read -r owner; do
      if [ -n "$owner" ] && _pm_case_insensitive_match "$owner" "$partial" "exact"; then
        exact_owner="$owner"
        break
      fi
    done <<< "$owners"
  fi
  
  if [ -n "$exact_owner" ]; then
    # Exact owner match - show repos for this owner
    if [ -n "$repos" ]; then
      while IFS= read -r repo; do
        if [ -n "$repo" ]; then
          local repo_owner="${repo%%/*}"
          if [[ "$repo_owner" == "$exact_owner" ]]; then
            matches+=("$repo")
          fi
        fi
      done <<< "$repos"
    fi
  else
    # No exact owner match - find partial matches
    
    # Add matching owners
    if [ -n "$owners" ]; then
      while IFS= read -r owner; do
        if [ -n "$owner" ] && _pm_case_insensitive_match "$owner" "$partial" "prefix"; then
          matches+=("$owner")
        fi
      done <<< "$owners"
    fi
    
    # Add matching repos
    if [ -n "$repos" ]; then
      while IFS= read -r repo; do
        if [ -n "$repo" ] && _pm_case_insensitive_match "$repo" "$partial" "contains"; then
          matches+=("$repo")
        fi
      done <<< "$repos"
    fi
  fi
  
  # Remove duplicates
  local unique_matches=()
  for match in "${matches[@]}"; do
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
  
  if [ ${#unique_matches[@]} -eq 0 ]; then
    return 1
  elif [ ${#unique_matches[@]} -eq 1 ]; then
    echo "${unique_matches[0]}"
    return 0
  else
    # Use fzf if available
    if command -v fzf >/dev/null 2>&1; then
      local selected
      selected=$(printf '%s\n' "${unique_matches[@]}" | fzf \
        --height=40% \
        --layout=reverse \
        --border \
        --prompt="Select: " \
        --query="$partial" \
        --preview='echo "Repository: {}"' \
        --preview-window=up:1)
      
      if [ -n "$selected" ]; then
        echo "$selected"
        return 0
      else
        return 1
      fi
    else
      # Fallback to numbered selection
      echo "Multiple matches found:" >&2
      for i in "${!unique_matches[@]}"; do
        echo "  $((i+1)). ${unique_matches[i]}" >&2
      done
      echo -n "Select (1-${#unique_matches[@]}): " >&2
      read -r selection
      
      # Check if selection is a valid number
      case "$selection" in
        ''|*[!0-9]*) return 1 ;;  # Not a number
        *) 
          if [ "$selection" -ge 1 ] && [ "$selection" -le ${#unique_matches[@]} ]; then
            echo "${unique_matches[$((selection-1))]}"
            return 0
          else
            return 1
          fi
          ;;
      esac
    fi
  fi
}

# Convenient aliases
alias pml="pm list"
alias pmu="pm update"
alias pmc="pm clean"
