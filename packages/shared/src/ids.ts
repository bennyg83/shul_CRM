// ---------------------------------------------------------------------------
// Record IDs: UUIDv7 (RFC 9562). 48-bit Unix-ms timestamp + 74 random bits, so
// IDs sort by creation time (compact SQLite indexes) and need no coordination
// between shuls, devices, or imports. No dependency: Web Crypto exists in Node
// and every browser.
// ---------------------------------------------------------------------------

/** Matches any RFC 9562 UUID (versions 1-8, variant 10xx). */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** New time-ordered UUIDv7, e.g. "0192f0c4-5e1a-7b3c-9d2e-4f6a8b0c1d2e". */
export function newId(now: number = Date.now()): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Bytes 0-5: big-endian millisecond timestamp.
  let t = now;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = t % 256;
    t = Math.floor(t / 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
