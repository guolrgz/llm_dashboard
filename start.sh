#!/usr/bin/env bash
# One-command launcher: FastAPI backend (127.0.0.1:8000) + Vite console (5173).
#
#   bash start.sh
#
# Ports already in use are left untouched, so the script is safe to re-run.
set -euo pipefail
cd "$(dirname "$0")"

need_backend=1
need_frontend=1
if curl -fsS --max-time 1 http://127.0.0.1:8000/health >/dev/null 2>&1; then
  echo "[start] backend already running on :8000"
  need_backend=0
fi
if curl -fsS --max-time 1 http://127.0.0.1:5173/ >/dev/null 2>&1; then
  echo "[start] console dev server already running on :5173"
  need_frontend=0
fi

if [ ! -d node_modules ]; then
  npm install --no-audit --no-fund
fi
if [ ! -d backend/vendor/fastapi ]; then
  bash backend/install.sh
fi

if [ "$need_backend" = "1" ]; then
  echo "[start] launching backend on 127.0.0.1:8000 (log: backend.log)"
  nohup bash backend/run.sh > backend.log 2>&1 &
  for _ in $(seq 1 60); do
    if curl -fsS --max-time 1 http://127.0.0.1:8000/health >/dev/null 2>&1; then
      echo "[start] backend ready"
      break
    fi
    sleep 0.5
  done
fi

if [ "$need_frontend" = "1" ]; then
  exec npm run dev -- --host 0.0.0.0 --port 5173
fi

echo "[start] all services already running:"
echo "  console: http://127.0.0.1:5173/"
echo "  api:     http://127.0.0.1:8000/docs"
