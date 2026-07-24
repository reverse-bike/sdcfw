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
  const challengeCharacteristic = await service.getCharacteristic(AUTH_CHALLENGE);
  const responseCharacteristic = await service.getCharacteristic(AUTH_RESPONSE);
  const stateCharacteristic = await service.getCharacteristic(AUTH_STATE);

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
