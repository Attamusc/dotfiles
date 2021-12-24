# Homebrew
# if we're using linuxbrew, then setup some special vars
if [[ -d "/home/linuxbrew/.linuxbrew" ]]
then
  export HOMEBREW_PREFIX=/home/linuxbrew/.linuxbrew
  export HOMEBREW_CELLAR=$HOMEBREW_PREFIX/Cellar
  export HOMEBREW_REPOSITORY=$HOMEBREW_PREFIX/Homebrew
fi

if [[ -d "/opt/homebrew" ]]
then
  export HOMEBREW_PREFIX="/opt/homebrew"
  export HOMEBREW_CELLAR="/opt/homebrew/Cellar"
  export HOMEBREW_REPOSITORY="/opt/homebrew"
fi

export USER_BIN=$HOME/.config/bin

# Languages
if [[ -d "$HOMEBREW_PREFIX" ]]
then
  export GO_HOME=$($HOMEBREW_PREFIX/bin/brew --prefix go)/libexec
else
  export GO_HOME=$(brew --prefix go)/libexec
fi

export CARGO_HOME=$HOME/.cargo
export GOPATH=$PROJECTS/go-space

export TMUXIFIER_HOME=~/.tmuxifier
export HEROKU_HOME=/usr/local/heroku
export GIT_FUZZY_HOME=$PROJECTS/tools/git-fuzzy

# Set up our default PATH variable
export PATH=$HOME/.local/bin:$HOME/.dotfiles/bin:/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:/usr/sbin:/sbin

# Add our special directories
export PATH=$USER_BIN:$HEROKU_HOME/bin:$TMUXIFIER_HOME/bin:$GOPATH/bin:$GO_HOME/bin:$GIT_FUZZY_HOME/bin:$PATH

# if we're using linuxbrew, then setup some special vars
if [[ -d "/home/linuxbrew/.linuxbrew" ]]
then
  export MANPATH="/home/linuxbrew/.linuxbrew/share/man:$MANPATH"
  export INFOPATH="/home/linuxbrew/.linuxbrew/share/info:$INFOPATH"
fi

# If we're using arm homebrew, make sure we add homebrew to the path
if [[ -d "/opt/homebrew" ]]
then
  export PATH="/opt/homebrew/bin:/opt/homebrew/sbin${PATH+:$PATH}";
  export MANPATH="/opt/homebrew/share/man${MANPATH+:$MANPATH}:";
  export INFOPATH="/opt/homebrew/share/info:${INFOPATH:-}";
fi

# mkdir .git/safe in the root of repositories you trust
export PATH=".git/safe/../../bin:.git/safe/../../node_modules/.bin:$PATH"

# Set our MANPATH for `man`
export MANPATH="/usr/share/man:/share/man:$MANPATH"
