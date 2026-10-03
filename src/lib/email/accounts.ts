import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailAccounts, type EmailAccount, type EmailProvider, type EmailSyncState } from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { GoogleAuthError, refreshAccessToken as refreshGoogleToken, revokeToken as revokeGoogleToken } from "@/lib/gmail/oauth";
import { MicrosoftAuthError, refreshMicrosoftToken } from "@/lib/outlook/oauth";

export async function listEmailAccounts(): Promise<EmailAccount[]> {
  return db.query.emailAccounts.findMany({ orderBy: [asc(emailAccounts.connectedAt)] });
}

export async function getEmailAccount(id: string): Promise<EmailAccount | null> {
  const row = await db.query.emailAccounts.findFirst({ where: eq(emailAccounts.id, id) });
  return row ?? null;
}

export async function findEmailAccount(provider: EmailProvider, emailAddress: string): Promise<EmailAccount | null> {
  const row = await db.query.emailAccounts.findFirst({
    where: and(eq(emailAccounts.provider, provider), eq(emailAccounts.emailAddress, emailAddress.toLowerCase())),
  });
  return row ?? null;
}

/** The mailbox used when a message is not a reply within an existing conversation. */
export async function getDefaultEmailAccount(): Promise<EmailAccount | null> {
  const [first] = await listEmailAccounts();
  return first ?? null;
}

export type SaveEmailAccountInput = {
  provider: EmailProvider;
  emailAddress: string;
  displayName?: string | null;
  refreshToken: string;
  accessToken: string;
  expiresIn: number;
  scopes: string;
  syncState: EmailSyncState;
};

/** Creates the account or replaces the credentials of an existing one for the same mailbox. */
export async function saveEmailAccount(input: SaveEmailAccountInput): Promise<EmailAccount> {
  const now = new Date();
  const values = {
    provider: input.provider,
    emailAddress: input.emailAddress.toLowerCase(),
    displayName: input.displayName ?? null,
    refreshTokenEnc: encryptSecret(input.refreshToken),
    accessTokenEnc: encryptSecret(input.accessToken),
    accessTokenExpiresAt: new Date(now.getTime() + Math.max(60, input.expiresIn - 60) * 1000),
    scopes: input.scopes,
    syncState: input.syncState,
    watchId: null,
    watchExpiresAt: null,
    backfillCompletedAt: null,
    syncLockedAt: null,
    lastSyncAt: null,
    lastSyncError: null,
    lastSyncErrorAt: null,
    connectedAt: now,
    updatedAt: now,
  };
  const [row] = await db
    .insert(emailAccounts)
    .values(values)
    .onConflictDoUpdate({ target: [emailAccounts.provider, emailAccounts.emailAddress], set: values })
    .returning();
  return row;
}

export async function updateEmailAccount(id: string, values: Partial<typeof emailAccounts.$inferInsert>): Promise<void> {
  await db
    .update(emailAccounts)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(emailAccounts.id, id));
}

/** Merges provider cursors into the account's sync state. */
export async function updateSyncState(account: EmailAccount, patch: EmailSyncState): Promise<EmailSyncState> {
  const next: EmailSyncState = {
    ...account.syncState,
    ...(patch.gmail ? { gmail: { ...account.syncState.gmail, ...patch.gmail } } : {}),
    ...(patch.outlook ? { outlook: { ...account.syncState.outlook, ...patch.outlook } } : {}),
  };
  await updateEmailAccount(account.id, { syncState: next });
  account.syncState = next;
  return next;
}

/** Removes the connection. Revocation at the provider is best effort. */
export async function disconnectEmailAccount(id: string): Promise<void> {
  const account = await getEmailAccount(id);
  if (!account) return;
  try {
    if (account.provider === "gmail") await revokeGoogleToken(decryptSecret(account.refreshTokenEnc));
    if (account.provider === "outlook" && account.watchId) {
      const { GraphClient } = await import("@/lib/outlook/client");
      await new GraphClient(account).deleteSubscription(account.watchId).catch(() => undefined);
    }
  } catch {
    // The stored credentials are removed regardless.
  }
  await db.delete(emailAccounts).where(eq(emailAccounts.id, id));
}

/**
 * Returns a valid access token for the account, refreshing and persisting it
 * when the cached token is missing or about to expire. Rotated refresh tokens
 * (Microsoft issues a new one on every refresh) are stored as well.
 */
export async function getValidAccessToken(account: EmailAccount): Promise<string> {
  const now = Date.now();
  if (account.accessTokenEnc && account.accessTokenExpiresAt && account.accessTokenExpiresAt.getTime() - now > 30_000) {
    return decryptSecret(account.accessTokenEnc);
  }
  const refreshToken = decryptSecret(account.refreshTokenEnc);
  try {
    const tokens =
      account.provider === "gmail" ? await refreshGoogleToken(refreshToken) : await refreshMicrosoftToken(refreshToken);
    const expiresAt = new Date(Date.now() + Math.max(60, tokens.expires_in - 60) * 1000);
    await updateEmailAccount(account.id, {
      accessTokenEnc: encryptSecret(tokens.access_token),
      accessTokenExpiresAt: expiresAt,
      ...(tokens.refresh_token ? { refreshTokenEnc: encryptSecret(tokens.refresh_token) } : {}),
    });
    account.accessTokenEnc = encryptSecret(tokens.access_token);
    account.accessTokenExpiresAt = expiresAt;
    return tokens.access_token;
  } catch (error) {
    const reconnect =
      (error instanceof GoogleAuthError && error.requiresReconnect) || (error instanceof MicrosoftAuthError && error.requiresReconnect);
    if (reconnect) {
      await updateEmailAccount(account.id, {
        lastSyncError: `${account.provider === "gmail" ? "Google" : "Microsoft"} access has expired or was revoked. Reconnect this account in Settings.`,
        lastSyncErrorAt: new Date(),
      });
    }
    throw error;
  }
}

/** Which providers can be connected, based on the configured OAuth credentials. */
export function configuredProviders(): EmailProvider[] {
  const providers: EmailProvider[] = [];
  if (env.google.configured) providers.push("gmail");
  if (env.microsoft.configured) providers.push("outlook");
  return providers;
}
