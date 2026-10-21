import { simpleParser } from "mailparser";
import type { EmailAccount, Message } from "@/lib/db/schema";
import { closeImap, connectImap, credentialsFor } from "./client";
import { attachmentIdAt, fileAttachments, parseImapExternalId } from "./parse";

/**
 * Downloads a message from the mail server and returns one of its attachments. When the folder has
 * been renumbered, or the message moved, since it was imported, it is found again by its Message-ID.
 */
export async function getImapAttachment(account: EmailAccount, message: Pick<Message, "externalId" | "messageIdHeader">, attachmentId: string): Promise<Buffer | null> {
  const ref = message.externalId ? parseImapExternalId(message.externalId) : null;
  const kind = ref?.kind ?? "inbox";
  const path = account.syncState.imap?.[kind]?.path ?? "INBOX";
  const client = await connectImap(credentialsFor(account));
  try {
    const lock = await client.getMailboxLock(path, { readOnly: true });
    try {
      const sameNumbering = ref && client.mailbox && String(client.mailbox.uidValidity) === ref.uidValidity;
      let fetched = sameNumbering ? await client.fetchOne(String(ref.uid), { uid: true, source: true }, { uid: true }) : false;
      if (!fetched && message.messageIdHeader) {
        const found = (await client.search({ header: { "message-id": message.messageIdHeader } }, { uid: true })) || [];
        if (found.length > 0) fetched = await client.fetchOne(String(found[0]), { uid: true, source: true }, { uid: true });
      }
      if (!fetched || !fetched.source) return null;
      const mail = await simpleParser(fetched.source, { skipTextToHtml: true, skipImageLinks: true });
      return fileAttachments(mail).find((_, i) => attachmentIdAt(i) === attachmentId)?.content ?? null;
    } finally {
      lock.release();
    }
  } finally {
    await closeImap(client);
  }
}
