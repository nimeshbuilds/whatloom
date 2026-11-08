#!/bin/zsh
set -eu

WHATLOOM_DIRECTORY="$(cd -- "$(dirname -- "$0")" && pwd)"
export PATH="$HOME/local/node/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
WHATLOOM_NODE="$(command -v node || true)"

if [[ -z "$WHATLOOM_NODE" ]]; then
  print "Whatloom needs Node.js 22.13 or newer, including npm."
  print "Install Node.js, then double-click Start Whatloom.command again."
  read -r "WHATLOOM_DISMISS?Press Return to close this window."
  exit 1
fi

exec "$WHATLOOM_NODE" "$WHATLOOM_DIRECTORY/scripts/launch-local.mjs"
