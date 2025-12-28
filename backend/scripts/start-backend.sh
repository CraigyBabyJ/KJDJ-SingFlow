#!/usr/bin/env bash
set -euo pipefail

# Resolve repo paths even if invoked from systemd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${BACKEND_DIR}"

# Use Node + dotenv to determine the configured PORT, default to 3000.
PORT="$(node -r dotenv/config -e "process.stdout.write(String(process.env.PORT || 3000))" 2>/dev/null || true)"
if [[ -z "${PORT}" ]]; then
  PORT="3000"
fi

log() {
  echo "[start-backend] $*" >&2
}

# Kill any stale KJDJ backend process still bound to the configured port.
if command -v lsof >/dev/null 2>&1; then
  mapfile -t LISTEN_PIDS < <(lsof -tiTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null || true)
else
  LISTEN_PIDS=()
fi

if [[ "${#LISTEN_PIDS[@]}" -gt 0 ]]; then
  for pid in "${LISTEN_PIDS[@]}"; do
    CMDLINE_FILE="/proc/${pid}/cmdline"
    if [[ -r "${CMDLINE_FILE}" ]]; then
      CMDLINE="$(tr '\0' ' ' < "${CMDLINE_FILE}")"
      if grep -q "src/server.js" <<<"${CMDLINE}"; then
        log "Killing stale backend process PID ${pid} on port ${PORT}"
        kill "${pid}" || true
      else
        log "Port ${PORT} currently in use by PID ${pid} (${CMDLINE}). Not killing."
        log "If this process is expected, update PORT in backend/.env."
        exit 1
      fi
    fi
  done
  # Give the OS a moment to release the port.
  sleep 1
fi

exec /usr/bin/env npm start
