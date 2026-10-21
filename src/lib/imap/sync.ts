import type { FetchMessageObject, ImapFlow } from "imapflow";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages, type EmailAccount, type ImapFolderState } from "@/lib/db/schema";
import { updateEmailAccount, updateSyncState } from "@/lib/email/accounts";
import type { ProviderSyncContext } from "@/lib/email/sync";
import { ingestEmail } from "@/lib/messaging/ingest";
import { closeImap, connectImap, credentialsFor, describeMailServerError, findSentFolder, isMailServerFailure } from "./client";
import { imapExternalId, parseMessageSource, type ImapFolderKind } from "./parse";

const BACKFILL_DAYS = 30;
const DAY_MS = 86_400_000;
/** Messages fetched per IMAP command, and the most bytes one command may pull down. */
const BATCH_MESSAGES = 10;
const BATCH_BYTES = 8 * 1024 * 1024;

type Folder = { kind: ImapFolderKind; path: string };

/** Compacts UIDs into an IMAP sequence set such as "3:7,9,12:14". */
export function uidSet(uids: number[]): string {
  const sorted = [...new Set(uids)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const start = sorted[i];
    while (i + 1 < sorted.length && sorted[i + 1] === sorted[i] + 1) i += 1;
    parts.push(start === sorted[i] ? String(start) : `${start}:${sorted[i]}`);
  }
  return parts.join(",");
}

/** Splits UIDs, in the given order, into batches bounded by count and size. */
export function batches(uids: number[], sizes: Map<number, number>): number[][] {
  const out: number[][] = [];
  let current: number[] = [];
  let bytes = 0;
  for (const uid of uids) {
    const size = sizes.get(uid) ?? 0;
    if (current.length > 0 && (current.length >= BATCH_MESSAGES || bytes + size > BATCH_BYTES)) {
      out.push(current);
      current = [];
      bytes = 0;
    }
    current.push(uid);
    bytes += size;
  }
  if (current.length > 0) out.push(current);
  return out;
}

async function knownIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ externalId: messages.externalId })
    .from(messages)
    .where(and(eq(messages.channel, "email"), inArray(messages.externalId, ids)));
  return new Set(rows.map((r) => r.externalId).filter((id): id is string => Boolean(id)));
}

async function saveFolder(account: EmailAccount, kind: ImapFolderKind, state: ImapFolderState): Promise<ImapFolderState> {
  await updateSyncState(account, { imap: { [kind]: state } });
  return state;
}

/**
 * The folder's cursor, started at the current UIDNEXT the first time. When the server renumbers the
 * folder (a new UIDVALIDITY) the stored UIDs mean nothing any more, so tracking starts again; mail
 * already in the CRM is recognised by its Message-ID and not stored twice.
 */
async function folderState(client: ImapFlow, account: EmailAccount, folder: Folder): Promise<ImapFolderState> {
  const mailbox = client.mailbox;
  if (!mailbox) throw new Error(`The folder ${folder.path} could not be opened.`);
  const uidValidity = String(mailbox.uidValidity);
  const stored = account.syncState.imap?.[folder.kind];
  if (stored && stored.uidValidity === uidValidity && stored.path === folder.path) return stored;
  let uidNext = mailbox.uidNext;
  if (!uidNext) {
    const all = (await client.search({ all: true }, { uid: true })) || [];
    uidNext = (all.length > 0 ? Math.max(...all) : 0) + 1;
  }
  return saveFolder(account, folder.kind, {
    path: folder.path,
    uidValidity,
    liveFromUid: uidNext,
    lastUid: uidNext - 1,
    backfillBeforeUid: uidNext,
    backfillDone: false,
  });
}

async function ingestFetched(message: FetchMessageObject, account: EmailAccount, folder: Folder, state: ImapFolderState, ctx: ProviderSyncContext): Promise<void> {
  if (!message.source) return;
  if (message.flags?.has("\\Deleted") || message.flags?.has("\\Draft")) return;
  const receivedAt = message.internalDate ? new Date(message.internalDate) : null;
  const parsed = await parseMessageSource(message.source, {
    id: imapExternalId(account.id, folder.kind, state.uidValidity, message.uid),
    kind: folder.kind,
    receivedAt,
  });
  const result = await ingestEmail({
    parsed,
    accountEmail: account.emailAddress,
    accountId: account.id,
    selfAddresses: ctx.selfAddresses,
    historical: parsed.sentAt.getTime() < account.connectedAt.getTime() - 60_000,
    settings: ctx.settings,
  });
  ctx.stats.processed += 1;
  if (result.created) ctx.stats.created += 1;
}

/**
 * Fetches and ingests the given UIDs in order, calling `onBatch` after each batch so the cursor can
 * be saved. Returns false when the time budget ran out first. A message that cannot be parsed or
 * stored is logged and skipped so that it cannot hold the folder back; IMAP failures stop the run.
 */
async function processUids(
  client: ImapFlow,
  account: EmailAccount,
  folder: Folder,
  state: ImapFolderState,
  uids: number[],
  ctx: ProviderSyncContext,
  onBatch: (batch: number[]) => Promise<void>,
): Promise<boolean> {
  if (uids.length === 0) return true;
  const known = await knownIds(uids.map((uid) => imapExternalId(account.id, folder.kind, state.uidValidity, uid)));
  const sizes = new Map<number, number>();
  for (const row of await client.fetchAll(uidSet(uids), { uid: true, size: true }, { uid: true })) sizes.set(row.uid, row.size ?? 0);

  for (const batch of batches(uids, sizes)) {
    if (ctx.budget.exhausted) return false;
    const pending = batch.filter((uid) => sizes.has(uid) && !known.has(imapExternalId(account.id, folder.kind, state.uidValidity, uid)));
    if (pending.length > 0) {
      const fetched = await client.fetchAll(uidSet(pending), { uid: true, source: true, internalDate: true, flags: true }, { uid: true });
      const byUid = new Map(fetched.map((m) => [m.uid, m]));
      for (const uid of pending) {
        const message = byUid.get(uid);
        if (!message) continue;
        try {
          await ingestFetched(message, account, folder, state, ctx);
        } catch (error) {
          console.error(`[imap] skipped message ${uid} in ${folder.path} of ${account.emailAddress}:`, error);
        }
      }
    }
    await onBatch(batch);
  }
  return true;
}

/** New mail: everything from liveFromUid on that has not been processed yet, oldest first. */
async function syncLive(client: ImapFlow, account: EmailAccount, folder: Folder, ctx: ProviderSyncContext): Promise<void> {
  const lock = await client.getMailboxLock(folder.path, { readOnly: true });
  try {
    let state = await folderState(client, account, folder);
    const from = Math.max(state.lastUid + 1, state.liveFromUid);
    const uidNext = client.mailbox ? client.mailbox.uidNext : 0;
    if (uidNext && uidNext <= from) return;
    // "n:*" always matches the newest message, even when its UID is below n.
    const uids = ((await client.search({ uid: `${from}:*` }, { uid: true })) || []).filter((uid) => uid >= from).sort((a, b) => a - b);
    await processUids(client, account, folder, state, uids, ctx, async (batch) => {
      state = await saveFolder(account, folder.kind, { ...state, lastUid: Math.max(state.lastUid, ...batch) });
    });
  } finally {
    lock.release();
  }
}

/** The import of the 30 days before tracking began, newest first. */
async function syncBackfill(client: ImapFlow, account: EmailAccount, folder: Folder, ctx: ProviderSyncContext): Promise<void> {
  if (account.syncState.imap?.[folder.kind]?.backfillDone) return;
  const lock = await client.getMailboxLock(folder.path, { readOnly: true });
  try {
    let state = await folderState(client, account, folder);
    if (state.backfillDone) return;
    const before = state.backfillBeforeUid;
    const since = new Date(account.connectedAt.getTime() - BACKFILL_DAYS * DAY_MS);
    const uids =
      before > 1
        ? ((await client.search({ uid: `1:${before - 1}`, since }, { uid: true })) || []).filter((uid) => uid < before).sort((a, b) => b - a)
        : [];
    const complete = await processUids(client, account, folder, state, uids, ctx, async (batch) => {
      state = await saveFolder(account, folder.kind, { ...state, backfillBeforeUid: Math.min(state.backfillBeforeUid, ...batch) });
    });
    if (complete) await saveFolder(account, folder.kind, { ...state, backfillDone: true });
  } finally {
    lock.release();
  }
}

/**
 * Synchronises the inbox and sent folder of a mailbox reached over IMAP. Folders are opened
 * read-only, so nothing is marked as read and nothing changes for the agent's own mail program.
 * New mail comes first, then the import of the preceding 30 days.
 */
export async function syncImapAccount(account: EmailAccount, ctx: ProviderSyncContext): Promise<void> {
  const credentials = credentialsFor(account);
  const client = await connectImap(credentials);
  try {
    const sentPath = account.syncState.imap?.sent?.path ?? (await findSentFolder(client));
    const folders: Folder[] = [{ kind: "inbox", path: "INBOX" }, ...(sentPath ? [{ kind: "sent" as const, path: sentPath }] : [])];
    for (const folder of folders) {
      if (ctx.budget.exhausted) return;
      await syncLive(client, account, folder, ctx);
    }
    for (const folder of folders) {
      if (ctx.budget.exhausted) return;
      await syncBackfill(client, account, folder, ctx);
    }
    const state = account.syncState.imap;
    if (state?.inbox?.backfillDone && (!sentPath || state.sent?.backfillDone) && !account.backfillCompletedAt) {
      await updateEmailAccount(account.id, { backfillCompletedAt: new Date() });
    }
  } catch (error) {
    throw isMailServerFailure(error) ? describeMailServerError(error, "IMAP", credentials.imap.host) : error;
  } finally {
    await closeImap(client);
  }
}
