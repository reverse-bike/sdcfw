#!/usr/bin/env python3
"""Create a cleaned firmware dump containing only the static flash sections."""

from __future__ import annotations

import argparse
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Tuple

SOFTDEVICE_RANGE = (0x00000, 0x23000)
APP_START = 0x23000
BOOTLOADER_RANGE = (0x73000, 0x80000)

SETTINGS_OFFSET = 0x7F000
SETTINGS_SIZE = 0x164
BANK_STRUCT = struct.Struct("<III")
NRF_DFU_BANK_VALID_APP = 0x00000001


def parse_length(value: str) -> int:
    try:
        return int(value, 0)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"invalid length '{value}'") from exc


@dataclass
class BankInfo:
    image_size: int
    image_crc: int
    bank_code: int

    @classmethod
    def from_chunk(cls, chunk: bytes, offset: int) -> "BankInfo":
        return cls(*BANK_STRUCT.unpack_from(chunk, offset))


def detect_app_size(blob: bytes) -> int:
    end = SETTINGS_OFFSET + SETTINGS_SIZE
    if len(blob) < end:
        raise ValueError(
            f"dump ends at 0x{len(blob):05x}; need up to 0x{end:05x} for DFU settings"
        )
    chunk = blob[SETTINGS_OFFSET:end]
    bank0 = BankInfo.from_chunk(chunk, 24)
    bank1 = BankInfo.from_chunk(chunk, 36)

    for bank in (bank0, bank1):
        if bank.image_size and bank.bank_code & NRF_DFU_BANK_VALID_APP:
            return bank.image_size

    for bank in (bank0, bank1):
        if bank.image_size:
            return bank.image_size

    raise ValueError("could not derive app length from nrf_dfu_settings_t")


def build_clean_image(
    blob: bytes, segments: Iterable[Tuple[int, int]], total_size: int | None = None
) -> bytes:
    size = total_size or len(blob)
    cleaned = bytearray(b"\xff" * size)

    for start, end in segments:
        if end > len(blob):
            raise ValueError(
                f"requested slice 0x{start:05x}-0x{end:05x}, "
                f"but dump stops at 0x{len(blob):05x}"
            )
        if end > size:
            raise ValueError(
                f"clean target smaller than slice 0x{start:05x}-0x{end:05x} "
                f"(size 0x{size:05x})"
            )
        cleaned[start:end] = blob[start:end]

    return bytes(cleaned)


def default_output_path(dump_path: Path) -> Path:
    stem = dump_path.stem + "_cleaned"
    if dump_path.suffix:
        return dump_path.with_name(stem + dump_path.suffix)
    return dump_path.with_name(stem)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dump", type=Path, help="dirty flash dump to clean")
    parser.add_argument(
        "--app-size",
        type=parse_length,
        help="override application size (hex or decimal); default is DFU settings value",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="explicit path for cleaned dump (default: <dump>_cleaned.bin)",
    )
    args = parser.parse_args()

    blob = args.dump.read_bytes()
    app_size = args.app_size or detect_app_size(blob)
    segments = [
        SOFTDEVICE_RANGE,
        (APP_START, APP_START + app_size),
        BOOTLOADER_RANGE,
    ]

    cleaned = build_clean_image(blob, segments)

    output_path = args.output or default_output_path(args.dump)
    output_path.write_bytes(cleaned)
    print(f"Wrote cleaned dump to {output_path} ({len(cleaned)} bytes)")


if __name__ == "__main__":
    main()
