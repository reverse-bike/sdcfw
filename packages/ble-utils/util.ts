export type LogFn = (message: string) => void;

export class BleTimeoutError extends Error {}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new BleTimeoutError(`timeout after ${ms / 1000}s: ${label}`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new BleTimeoutError(`overall timeout (${ms / 1000}s) exceeded during ${label}`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function bytesOf(value: DataView): Uint8Array {
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

export function hex(data: Uint8Array | readonly number[]): string {
  return Array.from(data, (byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function connect(
  device: BluetoothDevice,
  options: {
    attempts?: number;
    timeoutMs?: number;
    retryDelayMs?: number;
    log?: LogFn;
  } = {},
): Promise<BluetoothRemoteGATTServer> {
  const gatt = device.gatt;
  if (!gatt) throw new Error("device has no GATT server");

  const attempts = options.attempts ?? 4;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const retryDelayMs = options.retryDelayMs ?? 2_000;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await withTimeout(gatt.connect(), timeoutMs, `connect attempt ${attempt}`);
    } catch (error) {
      lastError = error;
      options.log?.(
        `connect attempt ${attempt}/${attempts} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (attempt < attempts) await sleep(retryDelayMs);
    }
  }

  throw lastError;
}
