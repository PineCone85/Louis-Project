import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password hashes use the format  scrypt:N:r:p:salt:hash  with base64url salt
 * and hash, produced by `npm run auth:hash`. Colons are used as separators so
 * the value survives .env loaders that expand `$` references.
 */
export function hashPassword(password: string): string {
  const N = 16384;
  const r = 8;
  const p = 1;
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N, r, p });
  return `scrypt:${N}:${r}:${p}:${salt.toString("base64url")}:${hash.toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.trim().split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (![N, r, p].every((value) => Number.isInteger(value) && value > 0)) return false;
  const salt = Buffer.from(parts[4], "base64url");
  const expected = Buffer.from(parts[5], "base64url");
  if (salt.length === 0 || expected.length === 0) return false;
  const actual = scryptSync(password, salt, expected.length, { N, r, p });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
