if [[ -d "/home/linuxbrew/.linuxbrew" ]]
then
  export PATH=$HOMEBREW_PREFIX/bin:$HOMEBREW_PREFIX/sbin:$PATH
  
  # If we have linux brew, add it to the path
  eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
fi
