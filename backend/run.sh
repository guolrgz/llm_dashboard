#!/usr/bin/env bash
# Run the FastAPI backend on 127.0.0.1:8000 (override with PORT/HOST env).
set -euo pipefail
cd "$(dirname "$0")"

bash install.sh
export PYTHONPATH="$(pwd)/vendor:$(pwd):${PYTHONPATH:-}"
export LLM_DASHBOARD_DB="${LLM_DASHBOARD_DB:-$(pwd)/data/app.db}"

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8000}"
exec python3 -m uvicorn app.main:app --host "$HOST" --port "$PORT"
