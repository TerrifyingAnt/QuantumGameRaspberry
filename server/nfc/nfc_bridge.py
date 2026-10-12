#!/usr/bin/env python3
"""PN532 I2C bridge for Superposition (Raspberry Pi).

Совместим с NDEF Text форматом ESP (controller/src/ndef_helper.cpp).

Commands on stdin (JSON lines):
  {"cmd":"write","text":"pauli_x"}
  {"cmd":"cancel"}
  {"cmd":"ping"}

Events on stdout (JSON lines):
  {"event":"ready","firmware":"1.6"}
  {"event":"tag","uid":"040d67...","text":"pauli_x"}
  {"event":"error","message":"..."}
"""

from __future__ import annotations

import json
import os
import sys
import threading
import time

REMOVE_MS = float(os.environ.get("NFC_REMOVE_MS", "0.35"))
POLL_S = float(os.environ.get("NFC_POLL_S", "0.05"))
I2C_ADDRESS = int(os.environ.get("NFC_I2C_ADDRESS", "0x24"), 0)


def log(msg: str) -> None:
    print(f"[nfc_bridge] {msg}", file=sys.stderr, flush=True)


def emit(obj: dict) -> None:
    print(json.dumps(obj, ensure_ascii=False), flush=True)


def build_ndef_text(text: str) -> bytes:
    """Тот же TLV/NDEF Text, что пишет ESP writeNDEFText."""
    text_b = text.encode("utf-8")
    text_len = len(text_b)
    payload_len = 1 + 2 + text_len  # status + "en" + text
    ndef_len = 4 + payload_len  # D1 01 PLEN 54 + payload
    if ndef_len > 254:
        raise ValueError("text too long")

    buf = bytearray()
    buf.append(0x03)
    buf.append(ndef_len & 0xFF)
    buf.append(0xD1)
    buf.append(0x01)
    buf.append(payload_len & 0xFF)
    buf.append(0x54)
    buf.append(0x02)  # UTF-8, lang len 2
    buf.extend(b"en")
    buf.extend(text_b)
    buf.append(0xFE)
    return bytes(buf)


def parse_ndef_text(raw: bytes) -> str | None:
    """Разбор NDEF Text как ESP readNDEFText."""
    if not raw:
        return None
    t = 0
    while t < 3 and t < len(raw) and raw[t] == 0x00:
        t += 1
    if t > 2 or t >= len(raw) or raw[t] != 0x03:
        return None

    if t + 1 >= len(raw):
        return None
    if raw[t + 1] == 0xFF:
        if t != 0 or len(raw) < 4:
            return None
        ndef_len = (raw[2] << 8) | raw[3]
        hdr_len = 4
    else:
        ndef_len = raw[t + 1]
        hdr_len = 2
    if ndef_len == 0:
        return None

    i = t + hdr_len
    if i >= len(raw):
        return None
    hdr = raw[i]
    i += 1
    if (hdr & 0x07) != 0x01:
        return None
    sr = bool(hdr & 0x10)
    il = bool(hdr & 0x08)
    if i >= len(raw):
        return None
    type_len = raw[i]
    i += 1
    if sr:
        if i >= len(raw):
            return None
        pay_len = raw[i]
        i += 1
    else:
        if i + 4 > len(raw):
            return None
        pay_len = (raw[i] << 24) | (raw[i + 1] << 16) | (raw[i + 2] << 8) | raw[i + 3]
        i += 4
    if il:
        if i >= len(raw):
            return None
        id_len = raw[i]
        i += 1 + id_len
    if type_len != 1 or i >= len(raw) or raw[i] != ord("T"):
        return None
    i += 1
    if i >= len(raw):
        return None
    status = raw[i]
    i += 1
    lang_len = status & 0x3F
    utf16 = bool(status & 0x80)
    i += lang_len
    if pay_len < 1 + lang_len:
        return None
    text_len = pay_len - 1 - lang_len
    if i + text_len > len(raw):
        return None
    chunk = raw[i : i + text_len]
    if utf16:
        try:
            return chunk.decode("utf-16-be")
        except Exception:
            return None
    return chunk.decode("utf-8", errors="ignore")


class Bridge:
    def __init__(self) -> None:
        try:
            import board
            import busio
            from adafruit_pn532.i2c import PN532_I2C
        except ImportError as exc:
            emit({"event": "error", "message": f"missing dependency: {exc}"})
            log(f"missing dependency: {exc}")
            log("pip install -r requirements.txt")
            sys.exit(1)

        try:
            i2c = busio.I2C(board.SCL, board.SDA)
            # reset=None, req=None — только I2C, как в типичной схеме на Pi
            self.pn532 = PN532_I2C(i2c, address=I2C_ADDRESS, debug=False)
            fw = self.pn532.firmware_version
            if fw is None:
                raise RuntimeError("PN532 not responding (check I2C / mode jumpers)")
            ic, ver, rev, _support = fw
            self.firmware = f"{ver}.{rev}"
            log(f"PN532 firmware {self.firmware} (ic={ic}, addr=0x{I2C_ADDRESS:02x})")
            self.pn532.SAM_configuration()
        except Exception as exc:
            emit({"event": "error", "message": str(exc)})
            log(f"init failed: {exc}")
            sys.exit(2)

        self.write_text: str | None = None
        self.lock = threading.Lock()
        self.present_uid: bytes | None = None
        self.missing_since: float | None = None
        emit({"event": "ready", "firmware": self.firmware})

    def set_write(self, text: str | None) -> None:
        with self.lock:
            self.write_text = text

    def _read_pages(self, start: int, count: int) -> bytes | None:
        chunks: list[bytes] = []
        for page in range(start, start + count):
            block = self.pn532.ntag2xx_read_block(page)
            if block is None:
                if not chunks:
                    return None
                break
            chunks.append(bytes(block))
        return b"".join(chunks)

    def _try_write_ndef(self, text: str) -> bool:
        try:
            payload = build_ndef_text(text)
            for i in range(0, len(payload), 4):
                page = 4 + i // 4
                chunk = payload[i : i + 4].ljust(4, b"\x00")
                ok = self.pn532.ntag2xx_write_block(page, list(chunk))
                if not ok:
                    log(f"write failed at page {page}")
                    return False
            return True
        except Exception as exc:
            log(f"write failed: {exc}")
            return False

    def _try_read_text(self) -> str | None:
        raw = self._read_pages(4, 16)
        if raw is None:
            return None
        text = parse_ndef_text(raw)
        if text:
            return text.strip() or None
        # Fallback: сырой ASCII (старые тестовые метки)
        ascii_raw = raw.split(b"\x00", 1)[0].decode("utf-8", errors="ignore").strip()
        if ascii_raw and all(32 <= ord(c) < 127 for c in ascii_raw):
            return ascii_raw
        return None

    def loop(self) -> None:
        while True:
            try:
                uid = self.pn532.read_passive_target(timeout=0.1)
            except Exception as exc:
                log(f"poll error: {exc}")
                time.sleep(0.5)
                continue

            now = time.monotonic()
            if uid is not None:
                uid_b = bytes(uid)
                self.missing_since = None
                if self.present_uid != uid_b:
                    self.present_uid = uid_b
                    with self.lock:
                        pending = self.write_text
                    text = None
                    if pending:
                        if self._try_write_ndef(pending):
                            text = pending
                            with self.lock:
                                self.write_text = None
                            log(f"wrote NDEF text: {pending}")
                        else:
                            log("write failed, still emitting tag")
                            text = self._try_read_text()
                    else:
                        text = self._try_read_text()

                    event: dict = {"event": "tag", "uid": uid_b.hex()}
                    if text:
                        event["text"] = text
                    emit(event)
                    log(f"tag {uid_b.hex()}" + (f' text="{text}"' if text else ""))
            else:
                if self.present_uid is not None:
                    if self.missing_since is None:
                        self.missing_since = now
                    elif now - self.missing_since >= REMOVE_MS:
                        self.present_uid = None
                        self.missing_since = None
            time.sleep(POLL_S)


def stdin_loop(bridge: Bridge) -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        cmd = msg.get("cmd")
        if cmd == "write" and isinstance(msg.get("text"), str):
            bridge.set_write(msg["text"])
            log(f"write armed: {msg['text']}")
        elif cmd == "cancel":
            bridge.set_write(None)
            log("write cancelled")
        elif cmd == "ping":
            emit({"event": "pong"})


def main() -> None:
    bridge = Bridge()
    t = threading.Thread(target=stdin_loop, args=(bridge,), daemon=True)
    t.start()
    bridge.loop()


if __name__ == "__main__":
    main()
