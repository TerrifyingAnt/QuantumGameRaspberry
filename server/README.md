# Backend Raspberry Pi

Node.js + TypeScript сервер с игровой логикой (порт с ESP) и WebSocket API из [`EVENTS.md`](../EVENTS.md).

```bash
npm install
NFC_MOCK=1 npm run dev          # без PN532
npm start                       # production (нужен front/dist)
```

NFC: Python-мост [`nfc/nfc_bridge.py`](nfc/nfc_bridge.py). Mock: `POST /api/nfc/scan`.
