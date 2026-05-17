#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
"$ROOT/scripts/start_backend_gitbash.sh" &
"$ROOT/scripts/start_ml_api_gitbash.sh" &
"$ROOT/scripts/start_frontend_gitbash.sh" &
echo "Servicios iniciados: backend 8000, ML API 8010, frontend 5173."
wait
