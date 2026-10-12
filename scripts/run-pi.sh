#!/usr/bin/env bash
# Сборка фронта и запуск backend (онлайн: телефоны + цифровые карты).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export NFC_MODE="${NFC_MODE:-off}"
export TABLETOP_MODE="${TABLETOP_MODE:-0}"
export TABLETOP_CUBITS="${TABLETOP_CUBITS:-4}"
export PORT="${PORT:-8080}"
export HOST="${HOST:-0.0.0.0}"

if [[ ! -d front/node_modules ]]; then
  (cd front && npm ci)
fi
if [[ ! -d server/node_modules ]]; then
  (cd server && npm ci)
fi

echo "[run-pi] building frontend..."
(cd front && npm run build)

echo "[run-pi] starting server on ${HOST}:${PORT} (NFC_MODE=${NFC_MODE}, TABLETOP_MODE=${TABLETOP_MODE})"
cd server
exec npm start
