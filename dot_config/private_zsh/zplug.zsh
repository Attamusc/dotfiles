# Source zplug and all zplug managed plugins
export ZPLUG_HOME=/opt/homebrew/opt/zplug

source $ZPLUG_HOME/init.zsh

zplug 'zplug/zplug', hook-build:'zplug --self-manage'
zplug "qianxinfeng/vscode"
zplug "supercrabtree/k"
zplug "ajeetdsouza/zoxide"
zplug "zsh-users/zsh-autosuggestions"
zplug "zsh-users/zsh-syntax-highlighting", defer:2

if ! zplug check --verbose; then
    printf "Install? [y/N]: "
    if read -q; then
        echo; zplug install
    fi
fi

zplug load
