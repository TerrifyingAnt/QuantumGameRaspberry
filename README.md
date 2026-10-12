# «Суперпозиция» — версия для Raspberry Pi

<p align="center">
  <img src="front/src/assets/drawable/logo.png" alt="Логотип Суперпозиции" width="160">
</p>

Веб-клиент и backend для игры «Суперпозиция» на **Raspberry Pi**. Основной сценарий этой ветки — **один общий экран + физические NFC-карты** (без телефонов). Логика карт и регистров как у ESP32; эталон прошивки лежит в [`controller/`](controller), runtime — [`server/`](server).

## Возможности

- Полная игровая логика на Node.js (паритет с ESP): регистры, 21 тип карт, победа по совпадению с целью.
- Режим **общего стола** (`TABLETOP_MODE=1`): сразу партия на `/tabletop`, сенсорный выбор кубита, карты через PN532.
- Физические карты: PN532 по I²C, реестр UID → тип в `server/data/card-registry.json`.
- Kiosk: Chromium fullscreen на [`scripts/kiosk.sh`](scripts/kiosk.sh).
- Опционально телефоны (`TABLETOP_MODE=0`): лобби и тот же протокол [`EVENTS.md`](EVENTS.md).
- Без железа: `NFC_MODE=mock` и `POST /api/nfc/scan`.

## Режим одного экрана (общий стол)

Включён по умолчанию (`TABLETOP_MODE=1`). Телефоны не участвуют: два игрока сидят у одного дисплея Raspberry Pi и по очереди прикладывают карты к одному ридеру.

### Идея

На ESP у каждого был свой телефон: личный выбор цели и «свой» ряд. Здесь экран **общий**, поэтому UI перестроен под открытую информацию и явные жесты «куда бить картой» / «чей ход». Партия создаётся на сервере сразу при старте (виртуальные места **Игрок A** и **Игрок B**), киоск только отображает состояние и принимает касания.

### Схема хода

```text
[Игрок A]  ←→  [PN532]  ←→  [Игрок B]
                 ↑
         общий экран Pi
    (цель · оба регистра · подсказка)
```

1. Сервер поднимается → сразу `gameStarted` для мест A и B.
2. Kiosk открывает `/tabletop` и получает актуальное `setGameState`.
3. На экране подсвечен текущий игрок и написано, что делать.
4. Текущий игрок **касается кубита** (свой или чужой — как по правилам карты) → это `selectTarget`.
5. Прикладывает **физическую карту** к PN532 → сервер применяет эффект.
6. За ход — **2 карты** (исключения: kronecker, barrier и т.д. — как в [`RULES.md`](RULES.md)).
7. Ход переходит другому; победа — когда регистр игрока совпал с **целью**.
8. После победы кнопка «Новая партия» (`restartTabletop`).

Без выбранного кубита карта с целью не применяется. Карты без цели (`identity`, `barrier`, `reshuffle`, `kronecker_multiplication`) достаточно приложить в свой ход. Для `swap` / `rotate_*` / `quantum_lucky` после считывания на том же экране выбирают вторую цель или грань.

### Что видно на экране и зачем

Экран один — на нём только то, без чего нельзя честно и понятно играть вдвоём у стола:

| Элемент | Роль |
|---|---|
| Полоса-подсказка сверху | Следующий жест: «коснитесь кубита», «приложите карту», «выберите грань» |
| Регистр игрока A (слева) | Состояние первого места; подсветка, когда он ходит |
| **Цель** (центр) | Общий win-condition — оба смотрят в одну точку |
| Счётчик `N/2` карты хода | Сколько карт уже сыграно в текущем ходу |
| Регистр игрока B (справа) | Симметрично A; игра с открытой информацией |
| Миниатюра последней карты на кубите | Видны `measurement`, отмена через `quantum_noise` и т.п. |
| Модалки грани / ошибки / победы | Доп. ввод и итог без второго устройства |

Почему не «как на телефоне»: личный скрытый ряд и приглашения в лобби здесь бессмысленны — нет второго экрана и нет отдельного клиента на каждого игрока. Очередь и цель должны быть **явными**, иначе у одного ридера невозможно понять, кто сейчас играет и куда ляжет карта.

### Запуск режима стола

```bash
# На Pi (NFC + автостарт стола уже в скрипте)
./scripts/run-pi.sh
./scripts/kiosk.sh          # http://localhost:8080/tabletop

# Docker (TABLETOP_MODE=1 по умолчанию в compose)
docker compose up --build
# открыть http://localhost:8080/tabletop
```

| Переменная | Default | Описание |
|---|---|---|
| `TABLETOP_MODE` | `1` | `1` — общий стол; `0` — лобби/телефоны |
| `TABLETOP_CUBITS` | `4` | Число кубитов в регистрах при автостарте |

Проверка: `GET /api/tabletop` → `"enabled": true`.

Телефонный режим: `TABLETOP_MODE=0` (лобби на `/`, приглашения, личные экраны `/game`).

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

## Что нужно для запуска

Docker **не обязателен**. Ниже — минимальный набор под каждый сценарий.

### Без Docker: разработка на ПК (mock NFC)

| Что | Зачем |
|---|---|
| **Node.js 20+** и npm | Backend (`server/`) и фронт (`front/`) |
| Браузер | Открыть стол `/tabletop` |
| PN532 / Python | **Не нужны** — карты через `POST /api/nfc/scan` |

```powershell
# Windows
.\scripts\run-dev.ps1
# стол: http://127.0.0.1:5173/tabletop  (Vite), API/WS: :8080
```

```bash
# Linux / macOS
cd server && NFC_MOCK=1 npm install && npm run dev
# в другом терминале:
cd front && npm install && npm run dev
# стол: http://127.0.0.1:5173/tabletop
```

Mock-скан карты:

```bash
curl -X POST http://127.0.0.1:8080/api/nfc/scan \
  -H "Content-Type: application/json" \
  -d "{\"uid\":\"aabbccdd\",\"text\":\"pauli_x\"}"
```

### Без Docker: Raspberry Pi с ридером

| Что | Зачем |
|---|---|
| Raspberry Pi 3/4/5 + дисплей | Общий экран |
| Raspberry Pi OS | Хост |
| **Node.js 20+**, npm | `run-pi.sh` собирает фронт и стартует сервер |
| **Python 3** + `pip install -r server/nfc/requirements.txt` | Мост PN532 (`adafruit-blinka`, `adafruit-circuitpython-pn532`) |
| I²C включён (`raspi-config`) | Шина к ридеру |
| Adafruit **PN532** по I²C | Физические карты (SDA/SCL — обычно GPIO2/GPIO3) |
| Chromium (для киоска) | `scripts/kiosk.sh` |

```bash
chmod +x scripts/*.sh
./scripts/run-pi.sh          # сборка front + сервер на :8080
./scripts/kiosk.sh           # fullscreen → /tabletop
```

### С Docker

| Что | Зачем |
|---|---|
| Docker + Docker Compose | Сборка и запуск образа |
| Node/Python на хосте | **Не нужны** (внутри контейнера) |
| PN532 | Только с overlay `docker-compose.hardware.yml` на Pi |

```bash
# ПК или Pi без ридера (mock NFC)
docker compose up --build
# стол: http://localhost:8080/tabletop

# Pi с PN532
docker compose -f docker-compose.yml -f docker-compose.hardware.yml up --build
```

Реестр карт — volume `superposition-data`. Остановка: `docker compose down`.

## Сборка и запуск (кратко)

Можно **напрямую** (Node на хосте) или через **Docker Compose** — один и тот же backend/фронт. Детали зависимостей — в разделе выше.

Переменные окружения сервера:

| Переменная | Default | Описание |
|---|---|---|
| `PORT` | `8080` | HTTP + WS |
| `HOST` | `0.0.0.0` | Слушать на всех интерфейсах |
| `TABLETOP_MODE` | `1` | Общий стол без телефонов |
| `TABLETOP_CUBITS` | `4` | Кубитов при автостарте стола |
| `NFC_MODE` | `auto` / в Docker `mock` | `mock` \| `hardware` \| `auto` |
| `NFC_MOCK` | — | Совместимость: `1` = mock |
| `PYTHON_BIN` | `python3` | Интерпретатор моста |
| `FRONT_DIST` | `front/dist` | Сборка клиента |

## Подключение телефонов (если `TABLETOP_MODE=0`)

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
| Экран | только телефоны | общий стол `/tabletop` (или телефоны при `TABLETOP_MODE=0`) |

## Если что-то не работает

- **Нет фронта:** `cd front && npm run build`, затем перезапуск сервера.
- **PN532 не находится:** `sudo raspi-config` → Interface → I2C; `i2cdetect -y 1` (адрес часто `0x24`).
- **Mock на ПК:** `NFC_MOCK=1`, затем `POST /api/nfc/scan`.
- **WebSocket с Vite:** прокси `/ws` уже в [`front/vite.config.ts`](front/vite.config.ts).
