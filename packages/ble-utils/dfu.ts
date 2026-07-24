import {
  DFU_CONTROL_POINT,
  DFU_PACKET,
  DFU_SERVICE,
} from "./constants.js";
import { crc32Ieee } from "./crc.js";
import { hex, sleep, withTimeout, type LogFn } from "./util.js";

const OP = {
  CREATE: 0x01,
  PRN: 0x02,
  CALC: 0x03,
  EXEC: 0x04,
  SELECT: 0x06,
} as const;
const RESULT_OK = 0x01;
const RESULT_EXTENDED_ERROR = 0x0b;

const RESULT_NAMES: Record<number, string> = {
  0x00: "invalid",
  0x01: "success",
  0x02: "op not supported",
  0x03: "invalid param",
  0x04: "insufficient resources",
  0x05: "invalid object",
  0x07: "unsupported type",
  0x08: "operation not permitted",
  0x0a: "operation failed",
  0x0b: "extended error",
};

const EXTENDED_ERROR_NAMES: Record<number, string> = {
  0x00: "no error",
  0x01: "invalid error code",
  0x02: "wrong command format",
  0x03: "unknown command",
  0x04: "init command invalid",
  0x05: "fw version failure",
  0x06: "hw version failure",
  0x07: "sd version failure",
  0x08: "signature missing",
  0x09: "wrong hash type",
  0x0a: "hash failed",
  0x0b: "wrong signature type",
  0x0c: "verification failed",
};

export class DfuError extends Error {
  constructor(
    message: string,
    public readonly result?: number,
    public readonly response?: Uint8Array,
  ) {
    super(message);
  }
}

export interface DfuTransferOptions {
  skipCreate?: boolean;
  skipExecute?: boolean;
  executeTimeoutMs?: number;
  executeAttempts?: number;
  executeRetryDelayMs?: number;
  expectedOffset?: number;
  expectedCrc?: number;
}

export class DfuClient {
  private readonly queue: Array<{
    op: number;
    resolve: (value: Uint8Array) => void;
  }> = [];
  private readonly prnQueue: Uint8Array[] = [];
  private readonly prnWaiters: Array<(value: Uint8Array) => void> = [];
  private prnInterval = 0;

  private constructor(
    private readonly controlPoint: BluetoothRemoteGATTCharacteristic,
    private readonly packet: BluetoothRemoteGATTCharacteristic,
    private chunkSize: number,
    private readonly log: LogFn,
  ) {
    this.controlPoint.addEventListener(
      "characteristicvaluechanged",
      this.onNotification,
    );
  }

  static async connect(
    server: BluetoothRemoteGATTServer,
    options: { chunkSize?: number; log?: LogFn } = {},
  ): Promise<DfuClient> {
    const service = await withTimeout(
      server.getPrimaryService(DFU_SERVICE),
      10_000,
      "get DFU service",
    );
    const controlPoint = await withTimeout(
      service.getCharacteristic(DFU_CONTROL_POINT),
      10_000,
      "get DFU control point",
    );
    const packet = await withTimeout(
      service.getCharacteristic(DFU_PACKET),
      10_000,
      "get DFU packet characteristic",
    );
    const client = new DfuClient(
      controlPoint,
      packet,
      options.chunkSize ?? 20,
      options.log ?? (() => {}),
    );
    await withTimeout(
      controlPoint.startNotifications(),
      10_000,
      "enable DFU notifications",
    );
    return client;
  }

  private readonly onNotification = (event: Event): void => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value) return;
    const bytes = new Uint8Array(
      value.buffer,
      value.byteOffset,
      value.byteLength,
    );
    if (bytes[0] !== 0x60) {
      this.log(`unexpected DFU notification: ${hex(bytes)}`);
      return;
    }

    const op = bytes[1]!;
    const index = this.queue.findIndex((entry) => entry.op === op);
    if (index >= 0) {
      const [entry] = this.queue.splice(index, 1);
      entry!.resolve(bytes);
    } else if (op === OP.CALC && this.prnInterval > 0) {
      const waiter = this.prnWaiters.shift();
      if (waiter) waiter(bytes);
      else this.prnQueue.push(bytes);
    } else {
      this.log(`unsolicited DFU response for 0x${op.toString(16)}: ${hex(bytes)}`);
    }
  };

  private command(
    op: number,
    parameters: readonly number[] = [],
    timeoutMs = 15_000,
  ): Promise<Uint8Array> {
    return new Promise<Uint8Array>((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.queue.findIndex((entry) => entry.op === op);
        if (index >= 0) this.queue.splice(index, 1);
        reject(
          new DfuError(
            `timeout waiting for response to DFU op 0x${op.toString(16)}`,
          ),
        );
      }, timeoutMs);
      this.queue.push({
        op,
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
      });

      const value = new Uint8Array([op, ...parameters]);
      const write = async (retries: number): Promise<void> => {
        try {
          await withTimeout(
            this.controlPoint.writeValueWithResponse(value),
            10_000,
            "DFU control point write",
          );
        } catch (error) {
          if (retries > 0) {
            await sleep(800);
            return write(retries - 1);
          }
          clearTimeout(timer);
          const index = this.queue.findIndex((entry) => entry.op === op);
          if (index >= 0) this.queue.splice(index, 1);
          reject(error);
        }
      };
      void write(2);
    });
  }

  private async expectOk(
    op: number,
    parameters: readonly number[] = [],
    timeoutMs = 15_000,
  ): Promise<Uint8Array> {
    const response = await this.command(op, parameters, timeoutMs);
    const result = response[2] ?? 0;
    if (result === RESULT_OK) return response;

    let message = `DFU op 0x${op.toString(16)} failed: ${RESULT_NAMES[result] ?? `0x${result.toString(16)}`}`;
    if (result === RESULT_EXTENDED_ERROR && response.length > 3) {
      const extended = response[3]!;
      message += `; ${EXTENDED_ERROR_NAMES[extended] ?? `extended error 0x${extended.toString(16)}`}`;
    }
    throw new DfuError(`${message}; raw=[${hex(response)}]`, result, response);
  }

  private u32le(value: number): number[] {
    return [
      value & 0xff,
      (value >>> 8) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 24) & 0xff,
    ];
  }

  async setPrn(interval: number): Promise<void> {
    await this.expectOk(OP.PRN, [interval & 0xff, (interval >>> 8) & 0xff]);
    this.prnInterval = interval;
    this.prnQueue.length = 0;
    this.prnWaiters.length = 0;
    this.log(`PRN set to ${interval}`);
  }

  private waitForPrn(timeoutMs = 10_000): Promise<Uint8Array> {
    const queued = this.prnQueue.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise<Uint8Array>((resolve, reject) => {
      const receive = (value: Uint8Array): void => {
        clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(() => {
        const index = this.prnWaiters.indexOf(receive);
        if (index >= 0) this.prnWaiters.splice(index, 1);
        reject(new DfuError("timeout waiting for packet receipt notification"));
      }, timeoutMs);
      this.prnWaiters.push(receive);
    });
  }

  async select(
    objectType: number,
  ): Promise<{ maxSize: number; offset: number; crc: number }> {
    const response = await this.expectOk(OP.SELECT, [objectType]);
    const view = new DataView(
      response.buffer,
      response.byteOffset,
      response.byteLength,
    );
    const selected = {
      maxSize: view.getUint32(3, true),
      offset: view.getUint32(7, true),
      crc: view.getUint32(11, true),
    };
    this.log(
      `select object ${objectType}: max=0x${selected.maxSize.toString(16)} offset=0x${selected.offset.toString(16)} crc=0x${selected.crc.toString(16)}`,
    );
    return selected;
  }

  async create(objectType: number, size: number): Promise<void> {
    await this.expectOk(OP.CREATE, [objectType, ...this.u32le(size)]);
    this.log(`create object ${objectType}: 0x${size.toString(16)} bytes`);
  }

  async calculateChecksum(): Promise<{ offset: number; crc: number }> {
    const response = await this.expectOk(OP.CALC);
    const view = new DataView(
      response.buffer,
      response.byteOffset,
      response.byteLength,
    );
    return {
      offset: view.getUint32(3, true),
      crc: view.getUint32(7, true),
    };
  }

  async execute(timeoutMs = 15_000): Promise<void> {
    await this.expectOk(OP.EXEC, [], timeoutMs);
  }

  async executeWithRetries(
    attempts = 1,
    delayMs = 2_000,
    timeoutMs = 15_000,
  ): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        await this.execute(timeoutMs);
        return;
      } catch (error) {
        if (
          !(error instanceof DfuError) ||
          error.result !== 0x0a ||
          attempt >= attempts
        ) {
          throw error;
        }
        this.log(
          `execute failed; retrying ${attempt}/${attempts - 1} after ${delayMs}ms`,
        );
        await sleep(delayMs);
      }
    }
  }

  private async stream(data: Uint8Array, baseOffset = 0): Promise<void> {
    let offset = 0;
    let writes = 0;
    let nextCheckpoint = Math.floor(baseOffset / 0x400 + 1) * 0x400;

    while (offset < data.length) {
      const length = Math.min(this.chunkSize, data.length - offset);
      const receipt =
        this.prnInterval > 0 && (writes + 1) % this.prnInterval === 0
          ? this.waitForPrn()
          : undefined;
      try {
        const chunk = data.slice(offset, offset + length);
        await withTimeout(
          this.packet.writeValueWithoutResponse(chunk),
          10_000,
          `DFU packet write at 0x${(baseOffset + offset).toString(16)}`,
        );
        offset += length;
        writes++;
      } catch (error) {
        this.log(
          `packet write failed at 0x${(baseOffset + offset).toString(16)} with chunk ${this.chunkSize}: ${error instanceof Error ? error.message : String(error)}`,
        );
        if (this.chunkSize <= 20) throw error;
        this.chunkSize =
          this.chunkSize > 100 ? 100 : this.chunkSize > 58 ? 58 : 20;
        this.log(`reducing chunk size to ${this.chunkSize}`);
        continue;
      }

      if (receipt) {
        const response = await receipt;
        const view = new DataView(
          response.buffer,
          response.byteOffset,
          response.byteLength,
        );
        this.log(`PRN receipt: offset=0x${view.getUint32(3, true).toString(16)}`);
      }

      await sleep(30);
      const absoluteOffset = baseOffset + offset;
      if (absoluteOffset >= nextCheckpoint && offset < data.length) {
        await sleep(500);
        const progress = await this.calculateChecksum();
        if (progress.offset !== absoluteOffset) {
          throw new DfuError(
            `offset mismatch at checkpoint: device=0x${progress.offset.toString(16)} expected=0x${absoluteOffset.toString(16)}`,
          );
        }
        this.log(
          `checkpoint: offset=0x${progress.offset.toString(16)} crc=0x${progress.crc.toString(16)}`,
        );
        nextCheckpoint += 0x400;
      }
    }

    this.log(`streamed ${writes} writes; waiting for the receive queue`);
    await sleep(1_500);
  }

  async transferObject(
    objectType: number,
    data: Uint8Array,
    options: DfuTransferOptions = {},
  ): Promise<void> {
    if (!options.skipCreate) {
      await this.create(objectType, data.length);
      if (objectType === 0x02) await sleep(2_000);
    }
    const expectedOffset = options.expectedOffset ?? data.length;
    const baseOffset = expectedOffset - data.length;
    if (baseOffset < 0) throw new DfuError("invalid DFU transfer offsets");

    await this.stream(data, baseOffset);
    const result = await this.calculateChecksum();
    const expectedCrc = options.expectedCrc ?? crc32Ieee(data);
    if (result.offset !== expectedOffset) {
      throw new DfuError(
        `offset mismatch after streaming: device=0x${result.offset.toString(16)} expected=0x${expectedOffset.toString(16)}`,
      );
    }
    if (result.crc !== expectedCrc) {
      throw new DfuError(
        `CRC mismatch after streaming: device=0x${result.crc.toString(16)} expected=0x${expectedCrc.toString(16)}`,
      );
    }
    this.log(
      `checksum verified: offset=0x${result.offset.toString(16)} crc=0x${result.crc.toString(16)}`,
    );
    if (options.skipExecute) return;

    await this.executeWithRetries(
      options.executeAttempts ?? 1,
      options.executeRetryDelayMs ?? 2_000,
      options.executeTimeoutMs ?? 15_000,
    );
    this.log("object executed");
  }
}
