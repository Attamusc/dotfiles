# !! Contents within this block are managed by 'mamba shell init' !!
export MAMBA_EXE='/opt/homebrew/bin/mamba';
export MAMBA_ROOT_PREFIX='/Users/attamusc/zsh';
__mamba_setup="$("$MAMBA_EXE" shell hook --shell zsh --root-prefix "$MAMBA_ROOT_PREFIX" 2> /dev/null)"
if [ $? -eq 0 ]; then
    eval "$__mamba_setup"
else
    alias mamba="$MAMBA_EXE"  # Fallback on help from mamba activate
fi
unset __mamba_setup
