const MPEG2_POLY = 0x04c11db7;

export function crc32Mpeg2Update(
  data: Uint8Array,
  initialCrc = 0xffffffff,
): number {
  let crc = initialCrc >>> 0;
  for (const byte of data) {
    crc ^= byte << 24;
    for (let bit = 0; bit < 8; bit++) {
      crc =
        crc & 0x80000000
          ? ((crc << 1) ^ MPEG2_POLY) >>> 0
          : (crc << 1) >>> 0;
    }
  }
  return crc >>> 0;
}

export function deviceImageCrc(staged: Uint8Array): number {
  if (staged.length % 4 !== 0) {
    throw new Error(`staged image length ${staged.length} is not word-aligned`);
  }

  let crc = 0xffffffff;
  const word = new Uint8Array(4);
  for (let offset = 0; offset < staged.length; offset += 4) {
    word[0] = staged[offset + 3]!;
    word[1] = staged[offset + 2]!;
    word[2] = staged[offset + 1]!;
    word[3] = staged[offset]!;
    crc = crc32Mpeg2Update(word, crc);
  }
  return crc;
}

const IEEE_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index++) {
    let crc = index;
    for (let bit = 0; bit < 8; bit++) {
      crc =
        crc & 1 ? (0xedb88320 ^ (crc >>> 1)) >>> 0 : (crc >>> 1) >>> 0;
    }
    table[index] = crc;
  }
  return table;
})();

export function crc32Ieee(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (IEEE_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
