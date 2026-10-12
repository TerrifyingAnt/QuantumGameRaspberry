# «Суперпозиция» — версия для Raspberry Pi

<p align="center">
  <img src="front/src/assets/drawable/logo.png" alt="Логотип Суперпозиции" width="160">
</p>

Веб-клиент и backend для игры «Суперпозиция» на **Raspberry Pi**: PN532 считывает физические карты, экран Pi показывает UI в режиме kiosk, телефоны опционально подключаются по Wi‑Fi через тот же WebSocket API.

Ветка `analog-version/raspberry-pi`. Папка [`controller/`](controller) — эталон логики ESP32 (не используется в runtime). Рабочий сервер — [`server/`](server).

## Возможности

- Полная игровая логика на Node.js (паритет с ESP): регистры, 21 тип карт, победа по совпадению с целью.
- Физические карты: PN532 по I²C, реестр UID → тип в `server/data/card-registry.json`.
- Локальный экран: Chromium kiosk (`?kiosk=1`).
- Опциональные телефоны: HTTP + WS на порту `8080`, тот же протокол [`EVENTS.md`](EVENTS.md).
- Режим без железа: `NFC_MOCK=1` и `POST /api/nfc/scan`.

## Как проходит партия

1. Запустите backend на Pi (`scripts/run-pi.sh`) и kiosk (`scripts/kiosk.sh`).
2. (Опционально) Подключите телефон к той же сети и откройте `http://<ip-pi>:8080`.
3. В лобби задайте имена, выберите соперника и число кубитов.
4. В свой ход выберите кубит на экране и приложите карту к PN532.
5. Совпадение регистра с целью — победа.

## Состав репозитория

| Путь | Описание |
|---|---|
| [server](server) | Backend: игра, WebSocket, NFC-мост |
| [front](front) | React-клиент |
| [controller](controller) | Архив прошивки ESP32 (эталон) |
| [scripts/run-pi.sh](scripts/run-pi.sh) | Сборка фронта + запуск сервера |
| [scripts/kiosk.sh](scripts/kiosk.sh) | Chromium fullscreen |
| [docker-compose.yml](docker-compose.yml) | Запуск через Docker (mock NFC по умолчанию) |
| [docker-compose.hardware.yml](docker-compose.hardware.yml) | Overlay для PN532 на Pi |
| [RULES.md](RULES.md) | Правила |
| [cards.md](cards.md) | Карты |
| [EVENTS.md](EVENTS.md) | WebSocket-протокол |

## Требования (Pi)

| Компонент | Требование |
|---|---|
| Плата | Raspberry Pi 3/4/5 с дисплеем |
| NFC | Adafruit PN532 по **I²C** (SDA/SCL — обычно GPIO2/GPIO3) |
| ОС | Raspberry Pi OS с Node.js 20+, Python 3 |
| Python | `pip install -r server/nfc/requirements.txt` (+ включённый I²C: `raspi-config`) |

## Сборка и запуск

Можно **напрямую** (Node на хосте) или через **Docker Compose** — один и тот же backend/фронт.

### Docker Compose

```bash
# Без ридера (NFC_MOCK=1) — ПК или Pi
docker compose up --build

# Открыть http://localhost:8080  (kiosk: http://localhost:8080/?kiosk=1)
# Mock-скан: curl -X POST http://localhost:8080/api/nfc/scan \
#   -H "Content-Type: application/json" \
#   -d "{\"uid\":\"aabbccdd\",\"text\":\"pauli_x\"}"

# С PN532 на Raspberry Pi (I²C /dev/i2c-1)
docker compose -f docker-compose.yml -f docker-compose.hardware.yml up --build
```

Реестр карт и настройки пишутся в volume `superposition-data`. Остановка: `docker compose down`.

### Напрямую (без Docker)

```bash
# На Pi с PN532
chmod +x scripts/*.sh
./scripts/run-pi.sh          # в одном терминале / systemd
./scripts/kiosk.sh           # на экране

# Разработка без ридера (Windows/Linux)
# PowerShell: .\scripts\run-dev.ps1
# или:
cd server && set NFC_MOCK=1 && npm install && npm run dev
# в другом терминале: cd front && npm run dev  → http://127.0.0.1:5173
# mock-скан: POST http://127.0.0.1:8080/api/nfc/scan {"uid":"aabbccdd","text":"pauli_x"}
```

Переменные окружения сервера:

| Переменная | Default | Описание |
|---|---|---|
| `PORT` | `8080` | HTTP + WS |
| `HOST` | `0.0.0.0` | Слушать на всех интерфейсах |
| `NFC_MOCK` | `0` | `1` — без PN532 |
| `PYTHON_BIN` | `python3` | Интерпретатор моста |
| `FRONT_DIST` | `front/dist` | Сборка клиента |

## Подключение телефонов

1. Pi и телефон в одной Wi‑Fi (или hotspot Pi).
2. Узнать IP: `hostname -I`.
3. Открыть `http://<ip>:8080` — клиент сам подключится к `ws://<ip>:8080/ws`.

## NFC / кардридер PN532

Пины (I²C1): **SDA → GPIO2 (pin 3)**, **SCL → GPIO3 (pin 5)**, **VCC → 3V3 (pin 1)**, **GND → GND**. На модуле режим **I2C**.

```bash
sudo raspi-config   # Interface → I2C → Enable
sudo apt install -y i2c-tools python3-pip
i2cdetect -y 1      # ожидается адрес 0x24
cd server && pip3 install -r nfc/requirements.txt

# Напрямую на Pi с ридером:
NFC_MODE=hardware ./scripts/run-pi.sh

# Docker на Pi с ридером:
docker compose -f docker-compose.yml -f docker-compose.hardware.yml up --build
```

- Мост: [`server/nfc/nfc_bridge.py`](server/nfc/nfc_bridge.py) — poll + debounce, NDEF Text как на ESP.
- Статус: `GET /api/nfc/status` (`mode`: `hardware` | `mock` | …).
- `NFC_MODE=auto` — пробует PN532, иначе mock; `hardware` — только ридер; `mock` — только `POST /api/nfc/scan`.
- Запись типа (`writeCard` на Info) пишет NDEF на NTAG и обновляет реестр.
- Готовые карты: UID в реестре **или** NDEF-текст типа на метке (fallback).

## Отличие от ESP

| | ESP32 (`controller/`) | Raspberry Pi (`server/`) |
|---|---|---|
| Runtime | Arduino / SPIFFS | Node + static `front/dist` |
| Wi‑Fi AP | SoftAP `BoardGame` | Обычная сеть / свой hotspot ОС |
| WS | порт 81 | `/ws` на порту HTTP |
| Реестр карт | NVS | JSON-файл |
| Экран | только телефоны | kiosk + телефоны |

## Если что-то не работает

- **Нет фронта:** `cd front && npm run build`, затем перезапуск сервера.
- **PN532 не находится:** `sudo raspi-config` → Interface → I2C; `i2cdetect -y 1` (адрес часто `0x24`).
- **Mock на ПК:** `NFC_MOCK=1`, затем `POST /api/nfc/scan`.
- **WebSocket с Vite:** прокси `/ws` уже в [`front/vite.config.ts`](front/vite.config.ts).
