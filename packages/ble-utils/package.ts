export interface DfuPackage {
  dat: Uint8Array;
  bin: Uint8Array;
  fwVersion: number;
  hwVersion: number;
  sdReq: number[];
  type: number;
  appSize: number;
  hashType: number;
  hash: Uint8Array;
  signatureType: number;
  signature: Uint8Array;
  vendorExt: Uint8Array | null;
  hashMatches: boolean;
}

class ProtoReader {
  private offset = 0;

  constructor(private readonly buffer: Uint8Array) {}

  get done(): boolean {
    return this.offset >= this.buffer.length;
  }

  varint(): number {
    let result = 0;
    let shift = 0;
    for (;;) {
      const byte = this.buffer[this.offset++];
      if (byte === undefined) throw new Error("truncated varint");
      result |= (byte & 0x7f) << shift;
      shift += 7;
      if ((byte & 0x80) === 0) return result >>> 0;
      if (shift > 35) throw new Error("varint too long");
    }
  }

  bytes(): Uint8Array {
    const length = this.varint();
    const value = this.buffer.subarray(this.offset, this.offset + length);
    if (value.length !== length) throw new Error("truncated bytes");
    this.offset += length;
    return value;
  }

  tag(): [field: number, wire: number] {
    const tag = this.varint();
    return [tag >>> 3, tag & 7];
  }

  skip(wire: number, field: number): void {
    if (wire === 0) this.varint();
    else if (wire === 2) this.bytes();
    else throw new Error(`field ${field}: unexpected wire ${wire}`);
  }
}

export async function parseDfuPackage(dat: Uint8Array, bin: Uint8Array): Promise<DfuPackage> {
  const outer = new ProtoReader(dat);
  let signed: Uint8Array | undefined;
  while (!outer.done) {
    const [field, wire] = outer.tag();
    if (wire !== 2) throw new Error(`outer field ${field}: unexpected wire ${wire}`);
    const value = outer.bytes();
    if (field === 2) signed = value;
  }
  if (!signed) throw new Error("no SignedCommand in .dat");

  let command: Uint8Array | undefined;
  let signatureType = -1;
  let signature: Uint8Array | undefined;
  const signedReader = new ProtoReader(signed);
  while (!signedReader.done) {
    const [field, wire] = signedReader.tag();
    if (field === 1) command = signedReader.bytes();
    else if (field === 2) signatureType = signedReader.varint();
    else if (field === 3) signature = signedReader.bytes();
    else signedReader.skip(wire, field);
  }
  if (!command || !signature) throw new Error("incomplete SignedCommand");

  let init: Uint8Array | undefined;
  const commandReader = new ProtoReader(command);
  while (!commandReader.done) {
    const [field, wire] = commandReader.tag();
    if (field === 2) init = commandReader.bytes();
    else commandReader.skip(wire, field);
  }
  if (!init) throw new Error("no InitCommand in Command");

  let fwVersion = 0;
  let hwVersion = 0;
  const sdReq: number[] = [];
  let type = 0;
  let appSize = 0;
  let hashType = -1;
  let hash: Uint8Array | undefined;
  let vendorExt: Uint8Array | null = null;
  const initReader = new ProtoReader(init);

  while (!initReader.done) {
    const [field, wire] = initReader.tag();
    switch (field) {
      case 1:
        fwVersion = initReader.varint();
        break;
      case 2:
        hwVersion = initReader.varint();
        break;
      case 3: {
        const packed = new ProtoReader(initReader.bytes());
        while (!packed.done) sdReq.push(packed.varint());
        break;
      }
      case 4:
        type = initReader.varint();
        break;
      case 5:
      case 6:
        initReader.varint();
        break;
      case 7:
        appSize = initReader.varint();
        break;
      case 8: {
        const hashReader = new ProtoReader(initReader.bytes());
        while (!hashReader.done) {
          const [hashField, hashWire] = hashReader.tag();
          if (hashField === 1) hashType = hashReader.varint();
          else if (hashField === 2) hash = hashReader.bytes();
          else hashReader.skip(hashWire, hashField);
        }
        break;
      }
      case 9:
        initReader.varint();
        break;
      case 10:
        vendorExt = initReader.bytes();
        break;
      default:
        initReader.skip(wire, field);
    }
  }
  if (!hash) throw new Error("no payload hash in InitCommand");

  const digestInput = new Uint8Array(bin);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", digestInput));
  const hashMatches =
    hash.length === digest.length &&
    hash.every((byte, index) => byte === digest[digest.length - 1 - index]);

  return {
    dat,
    bin,
    fwVersion,
    hwVersion,
    sdReq,
    type,
    appSize,
    hashType,
    hash,
    signatureType,
    signature,
    vendorExt,
    hashMatches,
  };
}

export const STAGED_CRC_LEN = 0x7000;

export function stagedImage(bin: Uint8Array): Uint8Array {
  if (bin.length > STAGED_CRC_LEN) {
    throw new Error(
      `payload 0x${bin.length.toString(16)} exceeds staged CRC region 0x${STAGED_CRC_LEN.toString(16)}`,
    );
  }
  const staged = new Uint8Array(STAGED_CRC_LEN).fill(0xff);
  staged.set(bin);
  return staged;
}
