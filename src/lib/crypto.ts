import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { env } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";

function encryptionKey(): Buffer {
  const secret = env.authSecret;
  return Buffer.from(hkdfSync("sha256", secret, "foyer-token-encryption", "aes-256-gcm", 32));
}

/** Encrypts a UTF-8 string for storage at rest. */
export function encryptSecret(plainText: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), encrypted.toString("base64url"), tag.toString("base64url")].join(".");
}

/** Reverses {@link encryptSecret}. Throws when the payload has been tampered with. */
export function decryptSecret(payload: string): string {
  const [version, ivPart, dataPart, tagPart] = payload.split(".");
  if (version !== VERSION || !ivPart || !dataPart || !tagPart) {
    throw new Error("Unrecognised encrypted payload");
  }
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]);
  return decrypted.toString("utf8");
}

/** Constant-time string comparison that does not leak length differences. */
export function safeEqual(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
