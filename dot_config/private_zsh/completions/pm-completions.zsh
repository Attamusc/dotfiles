# ============================================================================
# CACHE INFRASTRUCTURE
# ============================================================================
# Persistent file-based caching for fast tab completion
# Cache format: Simple key=value pairs with pipe-delimited arrays
# TTL: Configurable (default 30 minutes)

# Cache configuration - users can override in .zshrc
_PM_CACHE_TTL=${_PM_CACHE_TTL:-1800}  # 30 minutes in seconds

# Returns the cache directory path
# Uses XDG_DATA_HOME if set, otherwise ~/.local/share/pm
_pm_cache_dir() {
  echo "${XDG_DATA_HOME:-$HOME/.local/share}/pm"
}

# Returns the cache file path
_pm_cache_file() {
  echo "$(_pm_cache_dir)/projects.cache"
}

# Check if cache file exists
# Returns: 0 if exists, 1 if not
_pm_cache_exists() {
  [[ -f "$(_pm_cache_file)" ]]
}

# Get cache age in seconds
# Returns: Age in seconds, or 999999 if cache doesn't exist or is invalid
_pm_cache_age() {
  local cache_file="$(_pm_cache_file)"
  
  # If cache doesn't exist, return a very large age
  if [[ ! -f "$cache_file" ]]; then
    echo "999999"
    return
  fi
  
  # Extract cache timestamp from file
  local cache_time=$(grep '^CACHE_TIME=' "$cache_file" 2>/dev/null | cut -d= -f2)
  
  # If timestamp is missing or invalid, return large age
  if [[ -z "$cache_time" ]] || [[ ! "$cache_time" =~ ^[0-9]+$ ]]; then
    echo "999999"
    return
  fi
  
  # Calculate age in seconds
  local now=$(date +%s)
  echo $((now - cache_time))
}

# Check if cache is stale (older than TTL)
# Returns: 0 if stale, 1 if fresh
_pm_cache_is_stale() {
  local age=$(_pm_cache_age)
  [[ $age -gt $_PM_CACHE_TTL ]]
}

# Build cache from filesystem
# Uses native zsh globs instead of find for 2-5x speedup
# Writes atomically using temp file to prevent corruption
_pm_build_cache() {
  local cache_dir="$(_pm_cache_dir)"
  local cache_file="$(_pm_cache_file)"
  local github_dir="$PROJECTS/github.com"
  
  # Create cache directory if it doesn't exist
  [[ ! -d "$cache_dir" ]] && mkdir -p "$cache_dir"
  
  # If projects directory doesn't exist, create empty cache
  if [[ ! -d "$github_dir" ]]; then
    {
      echo "CACHE_TIME=$(date +%s)"
      echo "OWNERS="
      echo "REPOS="
    } > "$cache_file"
    return 1
  fi
  
  # Use native zsh globs instead of find (much faster!)
  # (/) = directories only
  # (N) = null_glob (no error if no matches)
  local -a owner_dirs=($github_dir/*(N/))
  local -a repo_dirs=($github_dir/*/*(N/))
  
  # Extract basenames for owners using zsh parameter expansion
  # :t = tail modifier (equivalent to basename, no subshell needed!)
  local -a owners=("${owner_dirs[@]:t}")
  
  # Extract owner/repo format for repos
  local -a repos=()
  for repo_path in $repo_dirs; do
    # :h = head (dirname), :t = tail (basename)
    # This is pure zsh, no subshells spawned!
    local owner="${${repo_path:h}:t}"
    local repo="${repo_path:t}"
    repos+=("$owner/$repo")
  done
  
  # Write cache atomically (temp file + move prevents partial writes)
  # Use process ID in temp filename to avoid conflicts
  local temp_file="${cache_file}.tmp.$$"
  {
    echo "CACHE_TIME=$(date +%s)"
    # (j:|:) joins array with pipe separator
    echo "OWNERS=${(j:|:)owners}"
    echo "REPOS=${(j:|:)repos}"
  } > "$temp_file"
  
  # Atomic move (prevents corruption if interrupted)
  mv "$temp_file" "$cache_file"
}

# Refresh cache in background (async, non-blocking)
# Only one refresh job runs at a time to prevent duplicate work
_pm_refresh_cache_async() {
  # Check if refresh job is already running
  # kill -0 checks if PID exists without sending signal
  if [[ -v _PM_CACHE_REFRESH_PID ]] && kill -0 $_PM_CACHE_REFRESH_PID 2>/dev/null; then
    return  # Already refreshing, don't spawn another
  fi
  
  # Start background refresh
  # &! = background job that doesn't get job control messages
  (
    _pm_build_cache 2>/dev/null
  ) &!
  _PM_CACHE_REFRESH_PID=$!
}

# Get cached owners list
# Builds cache if missing, triggers async refresh if stale
# Returns: Newline-separated list of owner names
_pm_get_cached_owners() {
  local cache_file="$(_pm_cache_file)"
  
  # Build cache synchronously if it doesn't exist
  if ! _pm_cache_exists; then
    _pm_build_cache >/dev/null 2>&1
  fi
  
  # If cache is stale, trigger async refresh (but use stale data for now)
  # This provides instant completions while updating in background
  if _pm_cache_is_stale; then
    _pm_refresh_cache_async
  fi
  
  # Read and parse owners from cache
  local owners_line=$(grep '^OWNERS=' "$cache_file" 2>/dev/null)
  if [[ -n "$owners_line" ]]; then
    local owners="${owners_line#OWNERS=}"
    # (s:|:) splits by pipe, (F) joins with newlines
    # This converts "owner1|owner2|owner3" to newline-separated output
    echo "${(F)${(s:|:)owners}}"
  fi
}

# Get cached repos list
# Builds cache if missing, triggers async refresh if stale
# Returns: Newline-separated list of "owner/repo" entries
_pm_get_cached_repos() {
  local cache_file="$(_pm_cache_file)"
  
  # Build cache synchronously if it doesn't exist
  if ! _pm_cache_exists; then
    _pm_build_cache >/dev/null 2>&1
  fi
  
  # If cache is stale, trigger async refresh (but use stale data for now)
  # This provides instant completions while updating in background
  if _pm_cache_is_stale; then
    _pm_refresh_cache_async
  fi
  
  # Read and parse repos from cache
  local repos_line=$(grep '^REPOS=' "$cache_file" 2>/dev/null)
  if [[ -n "$repos_line" ]]; then
    local repos="${repos_line#REPOS=}"
    # (s:|:) splits by pipe, (F) joins with newlines
    echo "${(F)${(s:|:)repos}}"
  fi
}

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

# Helper function for case-insensitive comparison
# Optimized to use native zsh string operations (no subshells)
_pm_case_insensitive_match() {
  local str1="$1"
  local str2="$2"
  local pattern="$3"  # "exact", "prefix", or "contains"
  
  # Use native zsh lowercase conversion (:l modifier)
  # This is 10-100x faster than spawning tr subprocess!
  local lower1="${str1:l}"
  local lower2="${str2:l}"
  
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
# Legacy functions - kept for backward compatibility
# These now redirect to cached versions for performance
_pm_get_repos() {
  _pm_get_cached_repos
}

_pm_get_owners() {
  _pm_get_cached_owners
}

# Tab completion for Bash
if [ -n "$BASH_VERSION" ]; then
  _pm_completion() {
    local cur="${COMP_WORDS[COMP_CWORD]}"
    
    if [ ${COMP_CWORD} -eq 1 ]; then
      local commands="help list update clean cache-refresh debug-completion"
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
        # Use mapfile/readarray in bash for better performance (no subshells per line)
        local repos
        repos=$(_pm_get_repos 2>/dev/null)
        if [ -n "$repos" ]; then
          local -a repo_array
          mapfile -t repo_array <<< "$repos"
          for repo in "${repo_array[@]}"; do
            [[ -n "$repo" ]] && _pm_case_insensitive_match "$repo" "$cur" "prefix" && all_completions+=("$repo")
          done
        fi
      elif [[ -n "$cur" ]] && [[ "$cur" == [a-zA-Z]* ]]; then
        # Check for exact owner match
        local owners
        owners=$(_pm_get_owners 2>/dev/null)
        local exact_owner=""
        
        if [ -n "$owners" ]; then
          local -a owner_array
          mapfile -t owner_array <<< "$owners"
          for owner in "${owner_array[@]}"; do
            if [[ -n "$owner" ]] && _pm_case_insensitive_match "$owner" "$cur" "exact"; then
              exact_owner="$owner"
              break
            fi
          done
        fi
        
        if [ -n "$exact_owner" ]; then
          # Exact owner match - show their repos
          local repos
          repos=$(_pm_get_repos 2>/dev/null)
          if [ -n "$repos" ]; then
            local -a repo_array
            mapfile -t repo_array <<< "$repos"
            for repo in "${repo_array[@]}"; do
              if [[ -n "$repo" ]]; then
                local repo_owner="${repo%%/*}"
                [[ "$repo_owner" == "$exact_owner" ]] && all_completions+=("$repo")
              fi
            done
          fi
        else
          # Partial match - show matching owners
          if [ -n "$owners" ]; then
            local -a owner_array
            mapfile -t owner_array <<< "$owners"
            for owner in "${owner_array[@]}"; do
              [[ -n "$owner" ]] && _pm_case_insensitive_match "$owner" "$cur" "prefix" && all_completions+=("$owner")
            done
          fi
        fi
      else
        # Empty input - only show commands (not owners/repos)
        # This keeps "pm <TAB>" clean
        :  # No-op, commands already added above
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
    local commands=("help" "list" "update" "clean" "cache-refresh" "debug-completion")
    
    # Add commands that match (case-insensitive)
    for cmd in "${commands[@]}"; do
      if _pm_case_insensitive_match "$cmd" "$current_word" "prefix"; then
        all_matches+=("$cmd")
      fi
    done
    
    # Only show owners/repos if user has started typing something
    # This keeps "pm <TAB>" clean (only shows commands)
    # while "pm a<TAB>" shows matching owners/repos
    if [[ -n "$current_word" ]]; then
      # Get all owners and repos from cache (fast!)
      local owners repos
      owners=$(_pm_get_owners 2>/dev/null)
      repos=$(_pm_get_repos 2>/dev/null)
      
      # Handle cache errors gracefully
      # Only show warning once per shell session to avoid noise
      if ! _pm_cache_exists && [[ -z "$owners" ]] && [[ -z "$repos" ]]; then
        if [[ ! -v _PM_CACHE_WARNING_SHOWN ]]; then
          zle -M "⚠ PM cache build failed - completions may be limited"
          _PM_CACHE_WARNING_SHOWN=1
        fi
        # Still show commands even if cache failed
      fi
      
      # Add all matching owners (case-insensitive)
      # Use native zsh array splitting: (@f) splits by newlines
      if [[ -n "$owners" ]]; then
        local -a owner_array=("${(@f)owners}")
        for owner in $owner_array; do
          [[ -n "$owner" ]] && _pm_case_insensitive_match "$owner" "$current_word" "prefix" && all_matches+=("$owner")
        done
      fi
      
      # Add all matching repos (case-insensitive)
      if [[ -n "$repos" ]]; then
        local -a repo_array=("${(@f)repos}")
        for repo in $repo_array; do
          [[ -n "$repo" ]] && _pm_case_insensitive_match "$repo" "$current_word" "prefix" && all_matches+=("$repo")
        done
      fi
    fi
    
    # Remove duplicates using zsh unique flag (-U)
    # This is O(n) instead of O(n²) with nested loops!
    local -aU unique_matches=("${all_matches[@]}")
    
    # Add completions - use different approaches for different types
    if [ ${#unique_matches[@]} -gt 0 ]; then
      local -a commands_desc owners_desc repos_desc
      
      for match in "${unique_matches[@]}"; do
        case "$match" in
          "help"|"list"|"update"|"clean"|"cache-refresh"|"debug-completion"|"complete")
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
        
        # Add owners (using cached data for speed)
        local owners
        owners=$(_pm_get_owners 2>/dev/null)
        if [[ -n "$owners" ]]; then
          local -a owner_array=("${(@f)owners}")
          all_options+=("${owner_array[@]}")
        fi
        
        # Add repos (using cached data for speed)
        local repos
        repos=$(_pm_get_repos 2>/dev/null)
        if [[ -n "$repos" ]]; then
          local -a repo_array=("${(@f)repos}")
          all_options+=("${repo_array[@]}")
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
