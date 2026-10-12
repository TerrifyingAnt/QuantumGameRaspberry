#!/usr/bin/env bash
# Сборка фронта и запуск backend на Raspberry Pi.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export NFC_MODE="${NFC_MODE:-hardware}"
export NFC_MOCK="${NFC_MOCK:-0}"
export PORT="${PORT:-8080}"
export HOST="${HOST:-0.0.0.0}"
export PYTHONUNBUFFERED="${PYTHONUNBUFFERED:-1}"

if [[ ! -d front/node_modules ]]; then
  (cd front && npm ci)
fi
if [[ ! -d server/node_modules ]]; then
  (cd server && npm ci)
fi

echo "[run-pi] building frontend..."
(cd front && npm run build)

echo "[run-pi] starting server on ${HOST}:${PORT} (NFC_MOCK=${NFC_MOCK})"
cd server
exec npm start
