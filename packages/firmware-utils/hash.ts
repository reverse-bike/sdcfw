/**
 * Lowercase hex SHA-256 over raw bytes, matching `shasum -a 256`.
 *
 * Uses Web Crypto so the same code runs in the browser and in Bun.
 */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  const view = new Uint8Array(data.byteLength);
  view.set(data);
  const digest = await crypto.subtle.digest("SHA-256", view);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
