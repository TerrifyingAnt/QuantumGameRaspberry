# Multi-stage: фронт + Node backend (Raspberry Pi / x86).
# Прямой запуск без Docker по-прежнему: scripts/run-pi.sh, scripts/run-dev.ps1

FROM node:22-bookworm AS front-builder
WORKDIR /app/front
COPY front/package.json front/package-lock.json ./
RUN npm ci
COPY front/ ./
RUN npm run build

FROM node:22-bookworm AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    i2c-tools \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./

# Python NFC-мост (на x86 без железа пакеты могут не трогать GPIO до runtime)
RUN pip3 install --break-system-packages --no-cache-dir -r nfc/requirements.txt \
  || echo "[docker] Python NFC deps skipped (ok for NFC_MOCK=1)"

COPY --from=front-builder /app/front/dist /app/front/dist

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    FRONT_DIST=/app/front/dist \
    CARD_REGISTRY_PATH=/app/server/data/card-registry.json \
    NFC_BRIDGE_SCRIPT=/app/server/nfc/nfc_bridge.py \
    PYTHON_BIN=python3 \
    PYTHONUNBUFFERED=1 \
    NFC_MODE=mock \
    NFC_MOCK=1

EXPOSE 8080
VOLUME ["/app/server/data"]

CMD ["npm", "start"]
