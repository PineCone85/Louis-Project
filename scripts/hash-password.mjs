/**
 * Generates a password hash for ADMIN_PASSWORD_HASH.
 *
 *   npm run auth:hash -- "your password"
 *
 * Uses Node's built-in scrypt so no additional dependency is required.
 */
import { randomBytes, scryptSync } from "node:crypto";

const password = process.argv.slice(2).join(" ");
if (!password || password.length < 8) {
  console.error("Usage: npm run auth:hash -- \"a password of at least 8 characters\"");
  process.exit(1);
}

const N = 16384;
const r = 8;
const p = 1;
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64, { N, r, p });
console.log(`scrypt:${N}:${r}:${p}:${salt.toString("base64url")}:${hash.toString("base64url")}`);
