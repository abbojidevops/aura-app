#!/usr/bin/env bash
# Runs all backend checks against a running server (default http://localhost:3000).
# Needs a running server and ffmpeg (FFMPEG env var, or ffmpeg on PATH).
set -euo pipefail
cd "$(dirname "$0")"
node mood.mjs
node ws.cjs
node e2e.mjs
