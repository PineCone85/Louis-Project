import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { gmailAccounts, type GmailAccount, type Settings } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { ingestEmail } from "@/lib/messaging/ingest";
import { getSettings } from "@/lib/queries/settings";
import { getGmailAccount, updateGmailAccount } from "./account";
import { GmailApiError, GmailClient, type GmailMessageRef } from "./client";
import { GoogleAuthError } from "./oauth";
import { parseGmailMessage } from "./mime";

export type SyncReason = "manual" | "poll" | "cron" | "push" | "connect";
export type SyncResult = {
  ran: boolean;
  reason?: string;
  processed: number;
  created: number;
  error?: string;
};

const BACKFILL_QUERY = "newer_than:30d -category:promotions -category:social -in:spam -in:trash";
const LOCK_STALE_MS = 3 * 60 * 1000;
const POLL_MIN_INTERVAL_MS = 45 * 1000;
const CONCURRENCY = 4;

class Budget {
  private readonly deadline: number;
  constructor(ms: number) {
    this.deadline = Date.now() + ms;
  }
  get exhausted(): boolean {
    return Date.now() >= this.deadline;
  }
}

async function acquireLock(): Promise<boolean> {
  const staleBefore = new Date(Date.now() - LOCK_STALE_MS);
  const rows = await db
    .update(gmailAccounts)
    .set({ syncLockedAt: new Date() })
    .where(and(eq(gmailAccounts.id, 1), or(isNull(gmailAccounts.syncLockedAt), lt(gmailAccounts.syncLockedAt, staleBefore))))
    .returning({ id: gmailAccounts.id });
  return rows.length > 0;
}

async function releaseLock(): Promise<void> {
  await db.update(gmailAccounts).set({ syncLockedAt: null }).where(eq(gmailAccounts.id, 1));
}

function isRelevant(ref: GmailMessageRef): boolean {
  const labels = ref.labelIds ?? [];
  if (labels.some((l) => ["DRAFT", "SPAM", "TRASH", "CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL"].includes(l))) return false;
  return labels.length === 0 || labels.includes("INBOX") || labels.includes("SENT");
}

async function processRefs(
  gmail: GmailClient,
  account: GmailAccount,
  settings: Settings,
  refs: GmailMessageRef[],
  historical: boolean,
  budget: Budget,
  stats: { processed: number; created: number },
): Promise<boolean> {
  for (let i = 0; i < refs.length; i += CONCURRENCY) {
    if (budget.exhausted) return false;
    const chunk = refs.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (ref) => {
        try {
          const full = await gmail.getMessage(ref.id, "full");
          if (!isRelevant({ id: full.id, threadId: full.threadId, labelIds: full.labelIds })) return;
          const parsed = parseGmailMessage(full);
          const olderThanConnection = parsed.sentAt.getTime() < account.connectedAt.getTime() - 60_000;
          const result = await ingestEmail({
            parsed,
            accountEmail: account.emailAddress,
            historical: historical || olderThanConnection,
            settings,
          });
          stats.processed += 1;
          if (result.created) stats.created += 1;
        } catch (error) {
          if (error instanceof GmailApiError && error.status === 404) return;
          throw error;
        }
      }),
    );
  }
  return true;
}

async function runIncremental(
  gmail: GmailClient,
  account: GmailAccount,
  settings: Settings,
  budget: Budget,
  stats: { processed: number; created: number },
): Promise<void> {
  if (!account.historyId) {
    const profile = await gmail.getProfile();
    await updateGmailAccount({ historyId: profile.historyId });
    return;
  }

  let pageToken: string | undefined;
  let latestHistoryId = account.historyId;
  const seen = new Map<string, GmailMessageRef>();

  try {
    do {
      const page = await gmail.listHistory({ startHistoryId: account.historyId, pageToken, maxResults: 100 });
      for (const entry of page.history ?? []) {
        for (const added of entry.messagesAdded ?? []) {
          if (isRelevant(added.message)) seen.set(added.message.id, added.message);
        }
      }
      if (page.historyId) latestHistoryId = page.historyId;
      pageToken = page.nextPageToken;
    } while (pageToken && !budget.exhausted);
  } catch (error) {
    if (error instanceof GmailApiError && error.status === 404) {
      // The stored history id is too old. Re-anchor and catch up with a recent search.
      const profile = await gmail.getProfile();
      const recent = await gmail.listMessages({ q: "newer_than:2d -in:spam -in:trash", maxResults: 100 });
      await processRefs(gmail, account, settings, recent.messages ?? [], false, budget, stats);
      await updateGmailAccount({ historyId: profile.historyId });
      return;
    }
    throw error;
  }

  const complete = await processRefs(gmail, account, settings, Array.from(seen.values()), false, budget, stats);
  if (complete) {
    await updateGmailAccount({ historyId: latestHistoryId });
  }
}

async function runBackfill(
  gmail: GmailClient,
  account: GmailAccount,
  settings: Settings,
  budget: Budget,
  stats: { processed: number; created: number },
): Promise<void> {
  if (account.backfillCompletedAt) return;
  let pageToken = account.backfillPageToken ?? undefined;
  while (!budget.exhausted) {
    const page = await gmail.listMessages({ q: BACKFILL_QUERY, maxResults: 25, pageToken });
    const complete = await processRefs(gmail, account, settings, page.messages ?? [], true, budget, stats);
    if (!complete) return;
    pageToken = page.nextPageToken;
    if (!pageToken) {
      await updateGmailAccount({ backfillCompletedAt: new Date(), backfillPageToken: null });
      return;
    }
    await updateGmailAccount({ backfillPageToken: pageToken });
  }
}

/** Registers or renews Gmail push notifications when a Pub/Sub topic is configured. */
export async function ensureGmailWatch(gmail: GmailClient, account: GmailAccount): Promise<void> {
  const topic = env.google.pubsubTopic;
  if (!topic) return;
  const renewBefore = Date.now() + 24 * 60 * 60 * 1000;
  if (account.watchTopic === topic && account.watchExpiresAt && account.watchExpiresAt.getTime() > renewBefore) return;
  const response = await gmail.watch(topic);
  await updateGmailAccount({
    watchTopic: topic,
    watchExpiresAt: new Date(Number(response.expiration)),
  });
}

/**
 * Synchronises the connected mailbox with the CRM. Safe to call from several
 * triggers concurrently: a database lock ensures a single run at a time and
 * the work is bounded by a time budget so it fits a serverless invocation.
 */
export async function syncGmail(options: { reason: SyncReason; budgetMs?: number } = { reason: "manual" }): Promise<SyncResult> {
  const account = await getGmailAccount();
  if (!account) return { ran: false, reason: "not_connected", processed: 0, created: 0 };

  if (options.reason === "poll" && account.lastSyncAt && Date.now() - account.lastSyncAt.getTime() < POLL_MIN_INTERVAL_MS) {
    return { ran: false, reason: "recent", processed: 0, created: 0 };
  }

  if (!(await acquireLock())) return { ran: false, reason: "locked", processed: 0, created: 0 };

  const budget = new Budget(options.budgetMs ?? 40_000);
  const stats = { processed: 0, created: 0 };
  const gmail = new GmailClient(account);

  try {
    const settings = await getSettings();
    await runIncremental(gmail, account, settings, budget, stats);
    await runBackfill(gmail, account, settings, budget, stats);
    try {
      await ensureGmailWatch(gmail, account);
    } catch (error) {
      console.error("[gmail] watch renewal failed:", error);
    }
    await updateGmailAccount({ lastSyncAt: new Date(), lastSyncError: null, lastSyncErrorAt: null });
    return { ran: true, ...stats };
  } catch (error) {
    const message =
      error instanceof GoogleAuthError && error.requiresReconnect
        ? "Google access has expired or was revoked. Reconnect Gmail in Settings."
        : error instanceof Error
          ? error.message
          : "Unknown sync error";
    console.error("[gmail] sync failed:", error);
    await updateGmailAccount({ lastSyncError: message, lastSyncErrorAt: new Date() });
    return { ran: true, ...stats, error: message };
  } finally {
    await releaseLock();
  }
}

/** True when the connected account has not been synchronised recently. */
export async function gmailSyncIsStale(maxAgeMs = 90_000): Promise<boolean> {
  const [row] = await db
    .select({ lastSyncAt: gmailAccounts.lastSyncAt, locked: gmailAccounts.syncLockedAt })
    .from(gmailAccounts)
    .where(eq(gmailAccounts.id, 1));
  if (!row) return false;
  if (row.locked && Date.now() - row.locked.getTime() < LOCK_STALE_MS) return false;
  return !row.lastSyncAt || Date.now() - row.lastSyncAt.getTime() > maxAgeMs;
}
