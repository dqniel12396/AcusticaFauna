#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/acusticafauna-General/acusticafauna-Back/backend"
PY=".venv/Scripts/python.exe"
[ -x "$PY" ] || PY=".venv/bin/python"
[ -x "$PY" ] || PY="python"
"$PY" -m uvicorn app.main:app --host "${ACUSTICAFAUNA_BACKEND_HOST:-127.0.0.1}" --port "${ACUSTICAFAUNA_BACKEND_PORT:-8000}" --reload
