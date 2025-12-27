#!/usr/bin/env bash
set -euo pipefail

# Ensure user-local pipx install is discoverable when run from cron/systemd.
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:$PATH"

if ! command -v pipx >/dev/null 2>&1; then
  echo "pipx not found on PATH" >&2
  exit 1
fi

pipx upgrade yt-dlp
