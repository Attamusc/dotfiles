# Set up our default PATH variable
export PATH=$HOME/.local/bin:$HOME/.dotfiles/bin:/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:/usr/sbin:/sbin

# Homebrew
if [ -d $HOME/homebrew/bin ]; then
  eval "$($HOME/homebrew/bin/brew shellenv)"
fi

if [ -d /opt/homebrew/bin ]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi

if [ -d /home/linuxbrew/.linuxbrew/bin ]; then
  eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
fi

export USER_BIN=$HOME/.config/bin

# Languages
export GO_HOME=$(brew --prefix go)/libexec
export CARGO_HOME=$HOME/.cargo
export GOPATH=$PROJECTS/go-space
export BUN_HOME=$HOME/.bun

export TMUXIFIER_HOME=~/.tmuxifier
export HEROKU_HOME=/usr/local/heroku
export GIT_FUZZY_HOME=$PROJECTS/tools/git-fuzzy
export OPENCODE_HOME=$HOME/.opencode

# Add our special directories
export PATH=$USER_BIN:$HEROKU_HOME/bin:$OPENCODE_HOME/bin:$BUN_HOME/bin:$TMUXIFIER_HOME/bin:$GOPATH/bin:$GO_HOME/bin:$GIT_FUZZY_HOME/bin:$PATH

# mkdir .git/safe in the root of repositories you trust
export PATH=".git/safe/../../bin:.git/safe/../../node_modules/.bin:$PATH"

# Set our MANPATH for `man`
export MANPATH="/usr/share/man:/share/man:$MANPATH"
