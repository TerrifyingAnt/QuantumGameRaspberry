#!/usr/bin/env bash
# Chromium kiosk на локальном экране Pi.
set -euo pipefail

URL="${1:-http://localhost:8080/tabletop}"
CHROME="${CHROMIUM_BIN:-}"

if [[ -z "$CHROME" ]]; then
  for candidate in chromium-browser chromium google-chrome; do
    if command -v "$candidate" >/dev/null 2>&1; then
      CHROME="$candidate"
      break
    fi
  done
fi

if [[ -z "$CHROME" ]]; then
  echo "Chromium not found. Install chromium-browser or set CHROMIUM_BIN." >&2
  exit 1
fi

# Ждём HTTP, если сервер ещё поднимается
for _ in $(seq 1 60); do
  if curl -sf "http://localhost:8080/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

exec "$CHROME" \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --check-for-update-interval=31536000 \
  --autoplay-policy=no-user-gesture-required \
  "$URL"
