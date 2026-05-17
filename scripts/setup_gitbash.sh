#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
fi

python scripts/create_local_dirs.py

BACKEND="$ROOT/acusticafauna-General/acusticafauna-Back/backend"
ML="$ROOT/acusticafauna-ML"
FRONTEND="$ROOT/acusticafauna-General/acusticafauna-frontend"

if [ ! -d "$BACKEND/.venv" ]; then
  python -m venv "$BACKEND/.venv"
fi
"$BACKEND/.venv/Scripts/python.exe" -m pip install -U pip || "$BACKEND/.venv/bin/python" -m pip install -U pip
"$BACKEND/.venv/Scripts/python.exe" -m pip install -r "$BACKEND/requirements.txt" || "$BACKEND/.venv/bin/python" -m pip install -r "$BACKEND/requirements.txt"

if [ ! -d "$ML/.venv-ml" ]; then
  python -m venv "$ML/.venv-ml"
fi
"$ML/.venv-ml/Scripts/python.exe" -m pip install -U pip || "$ML/.venv-ml/bin/python" -m pip install -U pip
"$ML/.venv-ml/Scripts/python.exe" -m pip install -r "$ML/requirements-ml.txt" || "$ML/.venv-ml/bin/python" -m pip install -r "$ML/requirements-ml.txt"

cd "$FRONTEND"
npm install
cd "$ROOT"
python scripts/check_environment.py
