#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/acusticafauna-General/acusticafauna-frontend"
npm run dev -- --host 127.0.0.1 --port 5173
