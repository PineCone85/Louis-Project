import { createHash } from "node:crypto";
import type { EmailAccount, EmailSyncState } from "@/lib/db/schema";
import { updateEmailAccount, updateSyncState } from "@/lib/email/accounts";
import type { ProviderSyncContext } from "@/lib/email/sync";
import { env } from "@/lib/env";
import { ingestEmail } from "@/lib/messaging/ingest";
import { GraphApiError, GraphClient, type DeltaStub, type MailFolder } from "./client";
import { parseGraphMessage } from "./parse";

const BACKFILL_DAYS = 30;
const CONCURRENCY = 4;
/** Outlook mail subscriptions may live for up to 10,080 minutes (seven days); use six and renew a day early. */
export const SUBSCRIPTION_MINUTES = 6 * 24 * 60;
const RENEW_WHEN_LEFT_MS = 24 * 60 * 60 * 1000;

type FolderSpec = { folder: MailFolder; kind: "inbox" | "sent"; linkKey: "inboxLink" | "sentLink"; readyKey: "inboxReady" | "sentReady" };
const FOLDERS: FolderSpec[] = [
  { folder: "inbox", kind: "inbox", linkKey: "inboxLink", readyKey: "inboxReady" },
  { folder: "sentitems", kind: "sent", linkKey: "sentLink", readyKey: "sentReady" },
];

function outlookState(account: EmailAccount): NonNullable<EmailSyncState["outlook"]> {
  return account.syncState.outlook ?? {};
}

async function processStubs(client: GraphClient, account: EmailAccount, spec: FolderSpec, stubs: DeltaStub[], ctx: ProviderSyncContext): Promise<boolean> {
  const connectedAt = account.connectedAt.getTime();
  for (let i = 0; i < stubs.length; i += CONCURRENCY) {
    if (ctx.budget.exhausted) return false;
    const chunk = stubs.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (stub) => {
        let full;
        try {
          full = await client.getMessage(stub.id);
        } catch (error) {
          if (error instanceof GraphApiError && error.status === 404) return;
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
      }),
    );
  }
  return true;
}

async function syncFolder(client: GraphClient, account: EmailAccount, spec: FolderSpec, ctx: ProviderSyncContext): Promise<void> {
  const since = new Date(Date.now() - BACKFILL_DAYS * 86_400_000);
  let state = outlookState(account);
  let link = state[spec.linkKey] ?? null;
  let resets = 0;

  while (!ctx.budget.exhausted) {
    if (!link) link = client.initialDeltaUrl(spec.folder, state.filterUnsupported ? undefined : since);
    let page;
    try {
      page = await client.delta(link);
    } catch (error) {
      const isInitialUrl = !/\$(skiptoken|deltatoken)=/i.test(link);
      if (error instanceof GraphApiError && error.resyncRequired && resets < 1) {
        // The stored delta token expired (410, or 400 syncStateNotFound): enumerate the folder again.
        resets += 1;
        state = await updateSyncState(account, { outlook: { [spec.linkKey]: null, [spec.readyKey]: false } }).then((s) => s.outlook ?? {});
        link = null;
        continue;
      }
      if (error instanceof GraphApiError && error.status === 400 && isInitialUrl && !state.filterUnsupported && link.includes("$filter=")) {
        // The date filter is not accepted by this mailbox; enumerate without it and filter client-side.
        state = await updateSyncState(account, { outlook: { filterUnsupported: true, [spec.linkKey]: null } }).then((s) => s.outlook ?? {});
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
      state = await updateSyncState(account, { outlook: { [spec.linkKey]: link } }).then((s) => s.outlook ?? {});
      continue;
    }
    if (page.deltaLink) {
      await updateSyncState(account, { outlook: { [spec.linkKey]: page.deltaLink, [spec.readyKey]: true } });
    }
    return;
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

/** Synchronises the inbox and sent items of one Outlook account using delta queries. */
export async function syncOutlookAccount(account: EmailAccount, ctx: ProviderSyncContext): Promise<void> {
  const client = new GraphClient(account);
  for (const spec of FOLDERS) {
    if (ctx.budget.exhausted) break;
    await syncFolder(client, account, spec, ctx);
  }
  const state = outlookState(account);
  if (state.inboxReady && state.sentReady && !account.backfillCompletedAt) {
    await updateEmailAccount(account.id, { backfillCompletedAt: new Date() });
  }
  try {
    await ensureOutlookSubscription(client, account);
  } catch (error) {
    console.error("[outlook] subscription check failed:", error);
  }
}
