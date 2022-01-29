#!/bin/bash

set -eufo pipefail

if command -v nvim >/dev/null 2>&1; then
  echo "neovim already installed, skipping."
  exit 0
fi

# Install neovim from HEAD with brew
brew install neovim --HEAD

# Run neovim and have it install plugins with packer
# nvim --headless -c 'autocmd User PackerComplete quitall' -c 'PackerSync'
