import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailAccounts, type EmailAccount, type Settings } from "@/lib/db/schema";
import { getSettings } from "@/lib/queries/settings";
import { listEmailAccounts, updateEmailAccount } from "./accounts";

export type SyncReason = "manual" | "poll" | "cron" | "push" | "connect";

export class Budget {
  private readonly deadline: number;
  constructor(ms: number) {
    this.deadline = Date.now() + ms;
  }
  get exhausted(): boolean {
    return Date.now() >= this.deadline;
  }
}

export type SyncStats = { processed: number; created: number };
export type ProviderSyncContext = { settings: Settings; budget: Budget; stats: SyncStats };

export type AccountSyncResult = {
  accountId: string;
  provider: string;
  emailAddress: string;
  ran: boolean;
  reason?: string;
  processed: number;
  created: number;
  error?: string;
};

export type SyncResult = {
  ran: boolean;
  reason?: string;
  processed: number;
  created: number;
  error?: string;
  accounts: AccountSyncResult[];
};

const LOCK_STALE_MS = 3 * 60 * 1000;
const POLL_MIN_INTERVAL_MS = 45 * 1000;

async function acquireLock(account: EmailAccount): Promise<boolean> {
  const staleBefore = new Date(Date.now() - LOCK_STALE_MS);
  const rows = await db
    .update(emailAccounts)
    .set({ syncLockedAt: new Date() })
    .where(and(eq(emailAccounts.id, account.id), or(isNull(emailAccounts.syncLockedAt), lt(emailAccounts.syncLockedAt, staleBefore))))
    .returning({ id: emailAccounts.id });
  return rows.length > 0;
}

async function releaseLock(account: EmailAccount): Promise<void> {
  await db.update(emailAccounts).set({ syncLockedAt: null }).where(eq(emailAccounts.id, account.id));
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const withFlag = error as Error & { requiresReconnect?: boolean };
    if (withFlag.requiresReconnect) return "Access has expired or was revoked. Reconnect this mailbox in Settings.";
    return error.message;
  }
  return "Unknown sync error";
}

async function syncOne(account: EmailAccount, ctx: ProviderSyncContext): Promise<void> {
  if (account.provider === "gmail") {
    const { syncGmailAccount } = await import("@/lib/gmail/sync");
    await syncGmailAccount(account, ctx);
  } else {
    const { syncOutlookAccount } = await import("@/lib/outlook/sync");
    await syncOutlookAccount(account, ctx);
  }
}

/**
 * Synchronises every connected mailbox with the CRM. Safe to call from several
 * triggers concurrently: each account carries a database lock, and the work is
 * bounded by a shared time budget so it fits a serverless invocation.
 */
export async function syncEmailAccounts(options: { reason: SyncReason; budgetMs?: number; accountIds?: string[] } = { reason: "manual" }): Promise<SyncResult> {
  let accounts = await listEmailAccounts();
  if (options.accountIds && options.accountIds.length > 0) accounts = accounts.filter((a) => options.accountIds!.includes(a.id));
  if (accounts.length === 0) return { ran: false, reason: "not_connected", processed: 0, created: 0, accounts: [] };

  // Least recently synchronised first so that no mailbox is starved by a busy one.
  accounts.sort((a, b) => (a.lastSyncAt?.getTime() ?? 0) - (b.lastSyncAt?.getTime() ?? 0));

  const budget = new Budget(options.budgetMs ?? 40_000);
  const settings = await getSettings();
  const results: AccountSyncResult[] = [];

  for (const account of accounts) {
    const base = { accountId: account.id, provider: account.provider, emailAddress: account.emailAddress };
    if (budget.exhausted) {
      results.push({ ...base, ran: false, reason: "budget", processed: 0, created: 0 });
      continue;
    }
    if (options.reason === "poll" && account.lastSyncAt && Date.now() - account.lastSyncAt.getTime() < POLL_MIN_INTERVAL_MS) {
      results.push({ ...base, ran: false, reason: "recent", processed: 0, created: 0 });
      continue;
    }
    if (!(await acquireLock(account))) {
      results.push({ ...base, ran: false, reason: "locked", processed: 0, created: 0 });
      continue;
    }
    const stats: SyncStats = { processed: 0, created: 0 };
    try {
      await syncOne(account, { settings, budget, stats });
      await updateEmailAccount(account.id, { lastSyncAt: new Date(), lastSyncError: null, lastSyncErrorAt: null });
      results.push({ ...base, ran: true, ...stats });
    } catch (error) {
      const message = describeError(error);
      console.error(`[email] sync failed for ${account.provider} ${account.emailAddress}:`, error);
      await updateEmailAccount(account.id, { lastSyncError: message, lastSyncErrorAt: new Date() });
      results.push({ ...base, ran: true, ...stats, error: message });
    } finally {
      await releaseLock(account);
    }
  }

  const ranAny = results.some((r) => r.ran);
  const errors = results.filter((r) => r.error).map((r) => `${r.emailAddress}: ${r.error}`);
  return {
    ran: ranAny,
    reason: ranAny ? undefined : results[0]?.reason,
    processed: results.reduce((sum, r) => sum + r.processed, 0),
    created: results.reduce((sum, r) => sum + r.created, 0),
    error: errors.length > 0 ? errors.join("; ") : undefined,
    accounts: results,
  };
}

/** True when at least one mailbox has not been synchronised recently and is not being synchronised right now. */
export async function emailSyncIsStale(maxAgeMs = 90_000): Promise<boolean> {
  const rows = await db
    .select({ lastSyncAt: emailAccounts.lastSyncAt, locked: emailAccounts.syncLockedAt })
    .from(emailAccounts);
  return rows.some((row) => {
    if (row.locked && Date.now() - row.locked.getTime() < LOCK_STALE_MS) return false;
    return !row.lastSyncAt || Date.now() - row.lastSyncAt.getTime() > maxAgeMs;
  });
}
