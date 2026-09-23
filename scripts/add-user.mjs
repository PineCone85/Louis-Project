/**
 * Prints an ADDITIONAL_USERS entry for an extra sign-in.
 *
 *   npm run auth:user -- "person@example.com" "their password"
 *
 * Append the printed value to ADDITIONAL_USERS (comma-separated) in your
 * environment. Extra users share the same CRM data as the admin.
 */
import { randomBytes, scryptSync } from "node:crypto";

const [email, ...rest] = process.argv.slice(2);
const password = rest.join(" ");
if (!email || !email.includes("@") || !password || password.length < 8) {
  console.error('Usage: npm run auth:user -- "person@example.com" "a password of at least 8 characters"');
  process.exit(1);
}

const N = 16384;
const r = 8;
const p = 1;
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64, { N, r, p });
const entry = `${email.trim().toLowerCase()}:scrypt:${N}:${r}:${p}:${salt.toString("base64url")}:${hash.toString("base64url")}`;
console.log(entry);
console.error("\nAdd this to ADDITIONAL_USERS. For several users, separate entries with commas.");
