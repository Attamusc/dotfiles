#!/bin/sh

set -eu

supported_targets='macOS and Fedora 44'
kernel=$(uname -s)
machine=$(uname -m)

case "$kernel" in
  Darwin)
    case "$machine" in
      arm64|x86_64) platform=darwin ;;
      *)
        echo "Unsupported macOS architecture: $machine. Supported targets: $supported_targets" >&2
        exit 1
        ;;
    esac
    ;;
  Linux)
    if [ ! -r /etc/os-release ]; then
      echo "Unsupported Linux distribution. Supported targets: $supported_targets" >&2
      exit 1
    fi
    os_id=$(sed -n 's/^ID=//p' /etc/os-release | tr -d '"')
    os_version=$(sed -n 's/^VERSION_ID=//p' /etc/os-release | tr -d '"')
    if [ "$os_id" != fedora ] || [ "$os_version" != 44 ] || [ "$machine" != x86_64 ]; then
      echo "Unsupported Linux platform: ${os_id:-unknown} ${os_version:-unknown} ${machine:-unknown}. Supported targets: $supported_targets" >&2
      exit 1
    fi
    platform=fedora
    ;;
  *)
    echo "Unsupported operating system: $kernel. Supported targets: $supported_targets" >&2
    exit 1
    ;;
esac

if command -v chezmoi >/dev/null 2>&1; then
  chezmoi=chezmoi
elif [ "$platform" = fedora ]; then
  sudo dnf install -y chezmoi
  chezmoi=$(command -v chezmoi)
else
  bin_dir="$HOME/.local/bin"
  chezmoi="$bin_dir/chezmoi"
  if command -v curl >/dev/null 2>&1; then
    sh -c "$(curl -fsLS https://get.chezmoi.io)" -- -b "$bin_dir"
  elif command -v wget >/dev/null 2>&1; then
    sh -c "$(wget -qO- https://get.chezmoi.io)" -- -b "$bin_dir"
  else
    echo "Installing chezmoi requires curl or wget." >&2
    exit 1
  fi
fi

script_dir="$(cd -P -- "$(dirname -- "$0")" && pwd -P)"
exec "$chezmoi" init --apply "--source=$script_dir"
