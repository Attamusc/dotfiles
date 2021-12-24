# Make sure colors work in neovim in tmux
export NVIM_TUI_ENABLE_TRUE_COLOR=1

# Additional options for tmuxifier to call tmux with
# -2 forces tmux into 256 color mode
export TMUXIFIER_TMUX_OPTS="-2"

export EDITOR="nvim"
export LESS=iRS
export FZF_DEFAULT_COMMAND='ag -g ""'
export FZF_DEFAULT_OPTS='--height 40% --reverse'

export LSCOLORS="exfxcxdxbxegedabagacad"
export CLICOLOR=true
export DISABLE_AUTO_TITLE=true

# Add custom functions
fpath=($ZSH/functions $fpath)

# Add brew installed zsh completions
if [ -d "/usr/local/share/zsh-completions" ]; then
  fpath=(/usr/local/share/zsh-completions $fpath)
fi

if [ -d "/opt/homebrew/share/zsh/site-functions" ]; then
  fpath=(/opt/homebrew/share/zsh/site-functions $fpath)
fi

autoload -U $ZSH/functions/*(:t)

HISTFILE=$HOME/.zsh_history
HISTSIZE=10000
SAVEHIST=10000

setopt NO_BG_NICE
setopt NO_HUP
setopt NO_LIST_BEEP
setopt LOCAL_OPTIONS
setopt LOCAL_TRAPS
setopt HIST_VERIFY
setopt SHARE_HISTORY
setopt EXTENDED_HISTORY
setopt PROMPT_SUBST
setopt CORRECT
setopt COMPLETE_IN_WORD
setopt IGNORE_EOF

setopt APPEND_HISTORY
setopt INC_APPEND_HISTORY SHARE_HISTORY
setopt HIST_IGNORE_ALL_DUPS
setopt HIST_REDUCE_BLANKS

setopt NO_COMPLETE_ALIASES

zle -N newtab

bindkey "^A" beginning-of-line
bindkey "^E" end-of-line
bindkey '^R' history-incremental-pattern-search-backward
bindkey "^P" history-search-backward
bindkey "^Y" accept-and-hold
bindkey "^N" insert-last-word
bindkey '^?' backward-delete-char
