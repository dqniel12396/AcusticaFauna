#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/acusticafauna-ML"
PY=".venv-ml/Scripts/python.exe"
[ -x "$PY" ] || PY=".venv-ml/bin/python"
[ -x "$PY" ] || PY="python"
"$PY" -m uvicorn ml_api.main:app --host 127.0.0.1 --port 8010 --reload
