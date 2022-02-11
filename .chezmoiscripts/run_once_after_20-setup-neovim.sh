#!/bin/bash

set -eufo pipefail

if [ -d /opt/homebrew/bin ]; then
  echo "M1 installation found"
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi

if [ -d /home/linuxbrew/.linuxbrew/bin ]; then
  echo "linuxbrew installation found"
  eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
fi

if command -v nvim >/dev/null 2>&1; then
  echo "neovim already installed, skipping."
  exit 0
fi

# Install neovim from HEAD with brew
brew install neovim --HEAD

# Run neovim and have it install plugins with packer
# nvim --headless -c 'autocmd User PackerComplete quitall' -c 'PackerSync'
