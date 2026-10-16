#!/usr/bin/env bash
# Runs all backend test suites.
#
# Required environment variables:
#   DATABASE_URL: PostgreSQL connection string (e.g. postgres://aura:aura@localhost:5432/aura)
#   FFMPEG: Path to ffmpeg binary (e.g. /usr/bin/ffmpeg or C:/path/to/ffmpeg.exe; FFMPEG_PATH also supported, or ffmpeg on PATH)
#
# Optional environment variables:
#   BASE_URL: URL of a running AURA server (e.g. http://localhost:3000).
#             If unset, this script spawns an ephemeral server on a free port,
#             waits for /healthz, runs the suites, and shuts it down on exit.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$SCRIPT_DIR"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Error: DATABASE_URL is not set." >&2
  exit 1
fi

if [ -n "${FFMPEG:-}" ]; then
  export FFMPEG_PATH="${FFMPEG_PATH:-$FFMPEG}"
fi

SERVER_PID=""

cleanup() {
  local rc=$?
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    if command -v taskkill >/dev/null 2>&1; then
      taskkill //F //T //PID "$SERVER_PID" >/dev/null 2>&1 || true
    fi
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  exit "$rc"
}

if [ -z "${BASE_URL:-}" ]; then
  PORT=$(node -e 'const s=require("net").createServer(); s.listen(0, ()=>{console.log(s.address().port); s.close();})')
  export PORT
  export BASE_URL="http://127.0.0.1:$PORT"

  trap cleanup EXIT INT TERM

  node "$ROOT_DIR/server/index.js" &
  SERVER_PID=$!

  node wait.mjs "$BASE_URL"
fi

node mood.mjs
node ws.cjs
node e2e.mjs
node follow_requests.mjs
node admin.mjs
node delete_account.mjs
node security.mjs
node account_features.mjs
