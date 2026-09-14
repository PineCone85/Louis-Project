import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { loginAttempts } from "@/lib/db/schema";
import { sha256Hex } from "@/lib/crypto";

const MAX_FAILURES = 8;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

function keyFor(identifier: string): string {
  return sha256Hex(`login:${identifier}`);
}

/** Returns the number of seconds the caller must wait, or 0 when a login may proceed. */
export async function loginLockRemaining(identifier: string): Promise<number> {
  const row = await db.query.loginAttempts.findFirst({ where: eq(loginAttempts.key, keyFor(identifier)) });
  if (!row?.lockedUntil) return 0;
  const remaining = row.lockedUntil.getTime() - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

export async function recordLoginFailure(identifier: string): Promise<void> {
  const key = keyFor(identifier);
  const now = new Date();
  const row = await db.query.loginAttempts.findFirst({ where: eq(loginAttempts.key, key) });
  const withinWindow = row?.firstFailedAt && now.getTime() - row.firstFailedAt.getTime() < WINDOW_MS;
  const failedCount = withinWindow ? (row?.failedCount ?? 0) + 1 : 1;
  const lockedUntil = failedCount >= MAX_FAILURES ? new Date(now.getTime() + LOCK_MS) : null;
  await db
    .insert(loginAttempts)
    .values({ key, failedCount, firstFailedAt: withinWindow ? row?.firstFailedAt : now, lockedUntil })
    .onConflictDoUpdate({
      target: loginAttempts.key,
      set: { failedCount, firstFailedAt: withinWindow ? row?.firstFailedAt : now, lockedUntil },
    });
}

export async function clearLoginFailures(identifier: string): Promise<void> {
  await db.delete(loginAttempts).where(eq(loginAttempts.key, keyFor(identifier)));
}
