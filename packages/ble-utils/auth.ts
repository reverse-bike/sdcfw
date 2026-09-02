import { AUTH_CHALLENGE, AUTH_RESPONSE, AUTH_SERVICE, AUTH_STATE } from "./constants.js";
import { bytesOf, withTimeout } from "./util.js";

export const DEFAULT_AUTH_KEY = new Uint8Array(20).fill(0xff);

export async function authenticate(
  server: BluetoothRemoteGATTServer,
  key: Uint8Array = DEFAULT_AUTH_KEY,
): Promise<boolean> {
  const service = await withTimeout(
    server.getPrimaryService(AUTH_SERVICE),
    10_000,
    "get auth service",
  );
  const challengeCharacteristic = await withTimeout(
    service.getCharacteristic(AUTH_CHALLENGE),
    10_000,
    "get auth challenge characteristic",
  );
  const responseCharacteristic = await withTimeout(
    service.getCharacteristic(AUTH_RESPONSE),
    10_000,
    "get auth response characteristic",
  );
  const stateCharacteristic = await withTimeout(
    service.getCharacteristic(AUTH_STATE),
    10_000,
    "get auth state characteristic",
  );

  const challenge = bytesOf(
    await withTimeout(challengeCharacteristic.readValue(), 10_000, "read auth challenge"),
  );
  const input = new Uint8Array(challenge.length + key.length);
  input.set(challenge);
  input.set(key, challenge.length);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", input));

  await withTimeout(
    responseCharacteristic.writeValueWithResponse(digest),
    10_000,
    "write auth response",
  );
  const state = bytesOf(
    await withTimeout(stateCharacteristic.readValue(), 10_000, "read auth state"),
  );
  return (state[0] ?? 0) !== 0;
}
