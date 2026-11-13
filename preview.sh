#!/usr/bin/env bash
# Local preview: build the frontend, then serve the API + UI with uvicorn on $HOST:$PORT.
# Uses the offline provider and a local SQLite file unless the environment says otherwise.
set -euo pipefail
cd "$(dirname "$0")"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8000}"

if [ ! -x backend/.venv/bin/uvicorn ]; then
  python3 -m venv backend/.venv
  backend/.venv/bin/pip install -q -r backend/requirements-dev.txt
fi
if [ ! -d frontend/node_modules ]; then
  npm --prefix frontend ci
fi
npm --prefix frontend run build

cd backend
exec .venv/bin/uvicorn app.main:app --host "$HOST" --port "$PORT"
