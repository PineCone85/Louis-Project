import type { EmailAccount } from "@/lib/db/schema";
import { updateEmailAccount, updateSyncState } from "@/lib/email/accounts";
import type { ProviderSyncContext } from "@/lib/email/sync";
import { env } from "@/lib/env";
import { ingestEmail } from "@/lib/messaging/ingest";
import { GmailApiError, GmailClient, type GmailMessageRef } from "./client";
import { parseGmailMessage } from "./mime";

const BACKFILL_QUERY = "newer_than:30d -category:promotions -category:social -in:spam -in:trash";
const CONCURRENCY = 4;

function isRelevant(ref: GmailMessageRef): boolean {
  const labels = ref.labelIds ?? [];
  if (labels.some((l) => ["DRAFT", "SPAM", "TRASH", "CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL"].includes(l))) return false;
  return labels.length === 0 || labels.includes("INBOX") || labels.includes("SENT");
}

async function processRefs(
  gmail: GmailClient,
  account: EmailAccount,
  refs: GmailMessageRef[],
  historical: boolean,
  ctx: ProviderSyncContext,
): Promise<boolean> {
  for (let i = 0; i < refs.length; i += CONCURRENCY) {
    if (ctx.budget.exhausted) return false;
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
            accountId: account.id,
            historical: historical || olderThanConnection,
            settings: ctx.settings,
          });
          ctx.stats.processed += 1;
          if (result.created) ctx.stats.created += 1;
        } catch (error) {
          if (error instanceof GmailApiError && error.status === 404) return;
          throw error;
        }
      }),
    );
  }
  return true;
}

async function runIncremental(gmail: GmailClient, account: EmailAccount, ctx: ProviderSyncContext): Promise<void> {
  const historyId = account.syncState.gmail?.historyId ?? null;
  if (!historyId) {
    const profile = await gmail.getProfile();
    await updateSyncState(account, { gmail: { historyId: profile.historyId } });
    return;
  }

  let pageToken: string | undefined;
  let latestHistoryId = historyId;
  const seen = new Map<string, GmailMessageRef>();

  try {
    do {
      const page = await gmail.listHistory({ startHistoryId: historyId, pageToken, maxResults: 100 });
      for (const entry of page.history ?? []) {
        for (const added of entry.messagesAdded ?? []) {
          if (isRelevant(added.message)) seen.set(added.message.id, added.message);
        }
      }
      if (page.historyId) latestHistoryId = page.historyId;
      pageToken = page.nextPageToken;
    } while (pageToken && !ctx.budget.exhausted);
  } catch (error) {
    if (error instanceof GmailApiError && error.status === 404) {
      // The stored history id is too old. Re-anchor and catch up with a recent search.
      const profile = await gmail.getProfile();
      const recent = await gmail.listMessages({ q: "newer_than:2d -in:spam -in:trash", maxResults: 100 });
      await processRefs(gmail, account, recent.messages ?? [], false, ctx);
      await updateSyncState(account, { gmail: { historyId: profile.historyId } });
      return;
    }
    throw error;
  }

  const complete = await processRefs(gmail, account, Array.from(seen.values()), false, ctx);
  if (complete) await updateSyncState(account, { gmail: { historyId: latestHistoryId } });
}

async function runBackfill(gmail: GmailClient, account: EmailAccount, ctx: ProviderSyncContext): Promise<void> {
  if (account.backfillCompletedAt) return;
  let pageToken = account.syncState.gmail?.backfillPageToken ?? undefined;
  while (!ctx.budget.exhausted) {
    const page = await gmail.listMessages({ q: BACKFILL_QUERY, maxResults: 25, pageToken });
    const complete = await processRefs(gmail, account, page.messages ?? [], true, ctx);
    if (!complete) return;
    pageToken = page.nextPageToken;
    if (!pageToken) {
      await updateEmailAccount(account.id, { backfillCompletedAt: new Date() });
      await updateSyncState(account, { gmail: { backfillPageToken: null } });
      return;
    }
    await updateSyncState(account, { gmail: { backfillPageToken: pageToken } });
  }
}

/** Registers or renews Gmail push notifications when a Pub/Sub topic is configured. */
export async function ensureGmailWatch(gmail: GmailClient, account: EmailAccount): Promise<void> {
  const topic = env.google.pubsubTopic;
  if (!topic) return;
  const renewBefore = Date.now() + 24 * 60 * 60 * 1000;
  if (account.watchId === topic && account.watchExpiresAt && account.watchExpiresAt.getTime() > renewBefore) return;
  const response = await gmail.watch(topic);
  await updateEmailAccount(account.id, { watchId: topic, watchExpiresAt: new Date(Number(response.expiration)) });
}

/** Synchronises one Gmail account: incremental history first, then the 30-day backfill. */
export async function syncGmailAccount(account: EmailAccount, ctx: ProviderSyncContext): Promise<void> {
  const gmail = new GmailClient(account);
  await runIncremental(gmail, account, ctx);
  await runBackfill(gmail, account, ctx);
  try {
    await ensureGmailWatch(gmail, account);
  } catch (error) {
    console.error("[gmail] watch renewal failed:", error);
  }
}
