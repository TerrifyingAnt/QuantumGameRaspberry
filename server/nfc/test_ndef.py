#!/usr/bin/env python3
"""Проверка NDEF Text без PN532."""

from nfc_bridge import build_ndef_text, parse_ndef_text


def main() -> None:
    for sample in ("pauli_x", "hadamard_3", "kronecker_multiplication"):
        payload = build_ndef_text(sample)
        assert parse_ndef_text(payload) == sample, sample
        # как будто выровняли по страницам
        padded = payload.ljust((len(payload) + 3) // 4 * 4, b"\x00")
        assert parse_ndef_text(padded) == sample
    print("ndef ok")


if __name__ == "__main__":
    main()
