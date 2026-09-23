import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { gmailAccounts, type GmailAccount } from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { refreshAccessToken, revokeToken, GoogleAuthError } from "./oauth";

export async function getGmailAccount(): Promise<GmailAccount | null> {
  const row = await db.query.gmailAccounts.findFirst({ where: eq(gmailAccounts.id, 1) });
  return row ?? null;
}

export async function saveGmailConnection(params: {
  emailAddress: string;
  refreshToken: string;
  accessToken: string;
  expiresIn: number;
  scopes: string;
  historyId: string;
}): Promise<void> {
  const now = new Date();
  const values = {
    id: 1,
    emailAddress: params.emailAddress,
    refreshTokenEnc: encryptSecret(params.refreshToken),
    accessTokenEnc: encryptSecret(params.accessToken),
    accessTokenExpiresAt: new Date(now.getTime() + (params.expiresIn - 60) * 1000),
    scopes: params.scopes,
    historyId: params.historyId,
    watchTopic: null,
    watchExpiresAt: null,
    backfillPageToken: null,
    backfillCompletedAt: null,
    syncLockedAt: null,
    lastSyncAt: null,
    lastSyncError: null,
    lastSyncErrorAt: null,
    connectedAt: now,
    updatedAt: now,
  };
  await db.insert(gmailAccounts).values(values).onConflictDoUpdate({ target: gmailAccounts.id, set: values });
}

export async function disconnectGmail(): Promise<void> {
  const account = await getGmailAccount();
  if (!account) return;
  try {
    await revokeToken(decryptSecret(account.refreshTokenEnc));
  } catch {
    // Revocation is best effort; the stored credentials are removed regardless.
  }
  await db.delete(gmailAccounts).where(eq(gmailAccounts.id, 1));
}

/**
 * Returns a valid access token, refreshing and persisting it when the cached
 * token is missing or about to expire.
 */
export async function getValidAccessToken(account: GmailAccount): Promise<string> {
  const now = Date.now();
  if (account.accessTokenEnc && account.accessTokenExpiresAt && account.accessTokenExpiresAt.getTime() - now > 30_000) {
    return decryptSecret(account.accessTokenEnc);
  }
  const refreshToken = decryptSecret(account.refreshTokenEnc);
  try {
    const tokens = await refreshAccessToken(refreshToken);
    await db
      .update(gmailAccounts)
      .set({
        accessTokenEnc: encryptSecret(tokens.access_token),
        accessTokenExpiresAt: new Date(Date.now() + (tokens.expires_in - 60) * 1000),
        ...(tokens.refresh_token ? { refreshTokenEnc: encryptSecret(tokens.refresh_token) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(gmailAccounts.id, 1));
    return tokens.access_token;
  } catch (error) {
    if (error instanceof GoogleAuthError && error.requiresReconnect) {
      await db
        .update(gmailAccounts)
        .set({ lastSyncError: "Google access was revoked. Reconnect Gmail in Settings.", lastSyncErrorAt: new Date() })
        .where(eq(gmailAccounts.id, 1));
    }
    throw error;
  }
}

export async function updateGmailAccount(values: Partial<typeof gmailAccounts.$inferInsert>): Promise<void> {
  await db
    .update(gmailAccounts)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(gmailAccounts.id, 1));
}
