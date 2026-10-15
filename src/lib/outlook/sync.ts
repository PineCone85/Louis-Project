import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages, type EmailAccount, type EmailSyncState } from "@/lib/db/schema";
import { updateEmailAccount, updateSyncState } from "@/lib/email/accounts";
import type { ProviderSyncContext } from "@/lib/email/sync";
import { env } from "@/lib/env";
import { ingestEmail } from "@/lib/messaging/ingest";
import { GraphApiError, GraphClient, type DeltaStub, type MailFolder } from "./client";
import { MicrosoftAuthError } from "./oauth";
import { parseGraphMessage } from "./parse";

const BACKFILL_DAYS = 30;
const DAY_MS = 86_400_000;
/** Outlook allows four concurrent requests per mailbox and app; leave room for sends and attachment downloads. */
const CONCURRENCY = 3;
/** When a live cursor has to be rebuilt, mail older than this is not enumerated again. */
const LIVE_RESYNC_MAX_DAYS = 7;
/** Outlook mail subscriptions may live for up to 10,080 minutes (seven days); use six and renew a day early. */
export const SUBSCRIPTION_MINUTES = 6 * 24 * 60;
const RENEW_WHEN_LEFT_MS = 24 * 60 * 60 * 1000;

type OutlookState = NonNullable<EmailSyncState["outlook"]>;
type FolderSpec = {
  folder: MailFolder;
  kind: "inbox" | "sent";
  linkKey: "inboxLink" | "sentLink";
  readyKey: "inboxReady" | "sentReady";
  backfillLinkKey: "inboxBackfillLink" | "sentBackfillLink";
  backfillDoneKey: "inboxBackfillDone" | "sentBackfillDone";
};
const FOLDERS: FolderSpec[] = [
  { folder: "inbox", kind: "inbox", linkKey: "inboxLink", readyKey: "inboxReady", backfillLinkKey: "inboxBackfillLink", backfillDoneKey: "inboxBackfillDone" },
  { folder: "sentitems", kind: "sent", linkKey: "sentLink", readyKey: "sentReady", backfillLinkKey: "sentBackfillLink", backfillDoneKey: "sentBackfillDone" },
];

function outlookState(account: EmailAccount): OutlookState {
  return account.syncState.outlook ?? {};
}

async function patchState(account: EmailAccount, patch: OutlookState): Promise<OutlookState> {
  const next = await updateSyncState(account, { outlook: patch });
  return next.outlook ?? {};
}

/**
 * New mail must never wait for the history import. The live cursors only cover mail received from
 * `liveSince` on, so they become ready after a page or two; the 30 days before it are imported by
 * separate backfill cursors afterwards. Accounts synchronised by the earlier single-cursor scheme
 * keep any folder that already finished its enumeration and restart the others this way.
 */
async function ensureLiveSince(account: EmailAccount): Promise<OutlookState> {
  const state = outlookState(account);
  if (state.liveSince) return state;
  const liveSince = new Date(Math.max(account.connectedAt.getTime(), Date.now() - DAY_MS));
  const patch: OutlookState = { liveSince: liveSince.toISOString() };
  for (const spec of FOLDERS) {
    if (state[spec.readyKey] && state[spec.linkKey]) {
      // A completed legacy enumeration already covers the import window and tracks new mail.
      patch[spec.backfillDoneKey] = true;
    } else {
      patch[spec.linkKey] = null;
      patch[spec.readyKey] = false;
      patch[spec.backfillLinkKey] = null;
      patch[spec.backfillDoneKey] = false;
    }
  }
  return patchState(account, patch);
}

/** Errors that will hit every other message too: stop the run and keep the cursor where it is. */
function isFatal(error: unknown): boolean {
  if (error instanceof MicrosoftAuthError) return true;
  if (error instanceof GraphApiError) return error.status === 401 || error.status === 403 || error.status === 429 || error.status >= 500;
  return false;
}

/** External ids of these messages that are already stored, so a resumed page does not fetch them again. */
async function knownIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ externalId: messages.externalId })
    .from(messages)
    .where(and(eq(messages.channel, "email"), inArray(messages.externalId, ids)));
  return new Set(rows.map((r) => r.externalId).filter((id): id is string => Boolean(id)));
}

/**
 * Fetches and ingests each message. Returns false when the time budget ran out before the page was
 * finished. A message that cannot be processed is logged and skipped, so that one malformed email
 * cannot hold the cursor back for good. Systemic failures still stop the run: Graph throttling,
 * outages and revoked access are rethrown, and a database outage fails the lookup of known ids.
 */
async function processStubs(client: GraphClient, account: EmailAccount, spec: FolderSpec, stubs: DeltaStub[], ctx: ProviderSyncContext): Promise<boolean> {
  const connectedAt = account.connectedAt.getTime();
  const known = await knownIds(stubs.map((s) => s.id));
  const pending = stubs.filter((s) => !known.has(s.id));
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    if (ctx.budget.exhausted) return false;
    const chunk = pending.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (stub) => {
        try {
          let full;
          try {
            full = await client.getMessage(stub.id);
          } catch (error) {
            if (error instanceof GraphApiError && error.badReference) return;
            throw error;
          }
          if (full.isDraft) return;
          const attachments = full.hasAttachments ? await client.listAttachments(full.id).catch(() => []) : [];
          const parsed = parseGraphMessage(full, attachments, spec.kind);
          const result = await ingestEmail({
            parsed,
            accountEmail: account.emailAddress,
            accountId: account.id,
            selfAddresses: ctx.selfAddresses,
            historical: parsed.sentAt.getTime() < connectedAt - 60_000,
            settings: ctx.settings,
          });
          ctx.stats.processed += 1;
          if (result.created) ctx.stats.created += 1;
        } catch (error) {
          if (isFatal(error)) throw error;
          console.error(`[outlook] skipped message ${stub.id} in ${spec.folder} of ${account.emailAddress}:`, error);
        }
      }),
    );
  }
  return true;
}

/** Follows the live delta cursor of one folder: mail received since liveSince, then every new message. */
async function syncLive(client: GraphClient, account: EmailAccount, spec: FolderSpec, ctx: ProviderSyncContext): Promise<void> {
  let state = outlookState(account);
  const liveSince = new Date(state.liveSince!);
  let link = state[spec.linkKey] ?? null;
  let since = liveSince;
  let resets = 0;

  while (!ctx.budget.exhausted) {
    if (!link) link = client.initialDeltaUrl(spec.folder, state.filterUnsupported ? undefined : since);
    let page;
    try {
      page = await client.delta(link);
    } catch (error) {
      const isInitialUrl = !/\$(skiptoken|deltatoken)=/i.test(link);
      if (error instanceof GraphApiError && error.resyncRequired && resets < 1) {
        // The stored delta token expired (410, or 400 syncStateNotFound): enumerate recent mail again.
        resets += 1;
        since = new Date(Math.max(liveSince.getTime(), Date.now() - LIVE_RESYNC_MAX_DAYS * DAY_MS));
        state = await patchState(account, { [spec.linkKey]: null, [spec.readyKey]: false });
        link = null;
        continue;
      }
      if (error instanceof GraphApiError && error.status === 400 && isInitialUrl && !state.filterUnsupported && link.includes("$filter=")) {
        // The date filter is not accepted by this mailbox; enumerate without it and filter client-side.
        state = await patchState(account, { filterUnsupported: true, [spec.linkKey]: null });
        link = null;
        continue;
      }
      throw error;
    }

    const stubs = page.value.filter((stub) => !stub["@removed"] && (!state.filterUnsupported || !stub.receivedDateTime || new Date(stub.receivedDateTime) >= since));
    const complete = await processStubs(client, account, spec, stubs, ctx);
    if (!complete) return;

    if (page.nextLink) {
      link = page.nextLink;
      state = await patchState(account, { [spec.linkKey]: link });
      continue;
    }
    if (page.deltaLink) {
      await patchState(account, { [spec.linkKey]: page.deltaLink, [spec.readyKey]: true });
    }
    return;
  }
}

/** Imports the mail received in the 30 days before liveSince, newest first. */
async function syncBackfill(client: GraphClient, account: EmailAccount, spec: FolderSpec, ctx: ProviderSyncContext): Promise<void> {
  let state = outlookState(account);
  if (state[spec.backfillDoneKey]) return;
  const to = new Date(state.liveSince!);
  const from = new Date(account.connectedAt.getTime() - BACKFILL_DAYS * DAY_MS);
  if (from >= to) {
    await patchState(account, { [spec.backfillDoneKey]: true, [spec.backfillLinkKey]: null });
    return;
  }

  while (!ctx.budget.exhausted) {
    let page;
    try {
      page = await client.listRange(spec.folder, from, to, state[spec.backfillLinkKey] ?? undefined);
    } catch (error) {
      if (error instanceof GraphApiError && error.status === 400) {
        // The history import is best effort; never let a rejected query block the mailbox.
        console.error(`[outlook] history import of ${spec.folder} for ${account.emailAddress} was rejected:`, error);
        await patchState(account, { [spec.backfillDoneKey]: true, [spec.backfillLinkKey]: null });
        return;
      }
      throw error;
    }
    const complete = await processStubs(client, account, spec, page.value, ctx);
    if (!complete) return;
    if (!page.nextLink) {
      await patchState(account, { [spec.backfillDoneKey]: true, [spec.backfillLinkKey]: null });
      return;
    }
    state = await patchState(account, { [spec.backfillLinkKey]: page.nextLink });
  }
}

export type SubscriptionOutcome =
  | { status: "unchanged" | "renewed" | "created" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

/** Whether Graph could reach this deployment's webhook: a public HTTPS address is required. */
export function outlookPushPossible(): { ok: boolean; reason?: string } {
  if (!env.microsoft.webhookSecret) return { ok: false, reason: "MICROSOFT_WEBHOOK_SECRET is not set." };
  const url = env.appUrl;
  if (!url.startsWith("https://") || /^https:\/\/(localhost|127\.0\.0\.1)/.test(url)) {
    return { ok: false, reason: "Push notifications need the public HTTPS address of the deployment (APP_URL)." };
  }
  return { ok: true };
}

/** Identifies the secret and endpoint a subscription was created with, so rotation triggers a re-registration. */
function subscriptionFingerprint(secret: string, notificationUrl: string): string {
  return createHash("sha256").update(`${secret}|${notificationUrl}`).digest("hex").slice(0, 32);
}

/**
 * Registers or renews a change-notification subscription so new inbox mail is pushed to the CRM.
 * With `force`, any existing subscription is replaced.
 */
export async function ensureOutlookSubscription(client: GraphClient, account: EmailAccount, options: { force?: boolean } = {}): Promise<SubscriptionOutcome> {
  const possible = outlookPushPossible();
  if (!possible.ok) return { status: "skipped", reason: possible.reason ?? "Push notifications are not configured." };
  const secret = env.microsoft.webhookSecret!;
  const notificationUrl = `${env.appUrl}/api/webhooks/outlook`;
  const fingerprint = subscriptionFingerprint(secret, notificationUrl);
  const configChanged = account.syncState.outlook?.subscriptionConfig !== undefined && account.syncState.outlook?.subscriptionConfig !== fingerprint;

  const now = Date.now();
  const expiration = new Date(now + SUBSCRIPTION_MINUTES * 60_000);
  try {
    if (account.watchId && account.watchExpiresAt && !options.force && !configChanged) {
      if (account.watchExpiresAt.getTime() - now > RENEW_WHEN_LEFT_MS) return { status: "unchanged" };
      try {
        const renewed = await client.renewSubscription(account.watchId, expiration);
        await updateEmailAccount(account.id, { watchExpiresAt: new Date(renewed.expirationDateTime) });
        return { status: "renewed" };
      } catch (error) {
        if (!(error instanceof GraphApiError && error.status === 404)) throw error;
      }
    } else if (account.watchId) {
      // Replace rather than orphan the previous subscription (it would keep posting notifications we reject).
      await client.deleteSubscription(account.watchId).catch(() => undefined);
    }
    const created = await client.createSubscription({
      resource: "me/mailFolders('inbox')/messages",
      notificationUrl,
      lifecycleNotificationUrl: notificationUrl,
      clientState: secret,
      expirationDateTime: expiration,
    });
    await updateEmailAccount(account.id, { watchId: created.id, watchExpiresAt: new Date(created.expirationDateTime) });
    await updateSyncState(account, { outlook: { subscriptionError: null, subscriptionConfig: fingerprint } });
    return { status: "created" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to register push notifications";
    console.error("[outlook] subscription failed:", error);
    await updateSyncState(account, { outlook: { subscriptionError: message } });
    return { status: "failed", reason: message };
  }
}

/**
 * Synchronises the inbox and sent items of one Outlook account: new mail first through the live
 * delta cursors, then push registration, then the import of the preceding 30 days.
 */
export async function syncOutlookAccount(account: EmailAccount, ctx: ProviderSyncContext): Promise<void> {
  const client = new GraphClient(account);
  await ensureLiveSince(account);
  for (const spec of FOLDERS) {
    if (ctx.budget.exhausted) break;
    await syncLive(client, account, spec, ctx);
  }
  try {
    await ensureOutlookSubscription(client, account);
  } catch (error) {
    console.error("[outlook] subscription check failed:", error);
  }
  for (const spec of FOLDERS) {
    if (ctx.budget.exhausted) break;
    await syncBackfill(client, account, spec, ctx);
  }
  const state = outlookState(account);
  if (state.inboxReady && state.sentReady && state.inboxBackfillDone && state.sentBackfillDone && !account.backfillCompletedAt) {
    await updateEmailAccount(account.id, { backfillCompletedAt: new Date() });
  }
}
