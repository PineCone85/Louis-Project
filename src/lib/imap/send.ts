import type { EmailAccount } from "@/lib/db/schema";
import type { ParsedAddress } from "@/lib/email-address";
import { buildMimeMessage, buildReferences } from "@/lib/gmail/mime";
import { closeImap, connectImap, credentialsFor, describeMailServerError, findSentFolder, smtpTransport } from "./client";

export type ImapSendInput = {
  from: ParsedAddress;
  to: ParsedAddress[];
  cc?: ParsedAddress[];
  subject: string;
  text: string;
  html: string;
  messageId: string;
  replyTo?: { messageIdHeader: string | null; references: string | null } | null;
};

export type ImapSendResult = { externalId: string; threadId: string; messageIdHeader: string };

/**
 * Sends through the mailbox's SMTP server, then files a copy in its sent folder so the agent's own
 * mail program shows it too (SMTP servers do not do that themselves). The copy is picked up by the
 * next sync and linked to this message through its Message-ID.
 */
export async function sendViaImapAccount(account: EmailAccount, input: ImapSendInput): Promise<ImapSendResult> {
  const credentials = credentialsFor(account);
  const raw = buildMimeMessage({
    from: input.from,
    to: input.to,
    cc: input.cc,
    subject: input.subject,
    text: input.text,
    html: input.html,
    messageId: input.messageId,
    date: new Date(),
    inReplyTo: input.replyTo?.messageIdHeader ?? null,
    references: input.replyTo ? buildReferences(input.replyTo.references, input.replyTo.messageIdHeader) : null,
  });

  const transport = smtpTransport(credentials);
  try {
    await transport.sendMail({
      envelope: { from: input.from.address, to: [...input.to, ...(input.cc ?? [])].map((a) => a.address) },
      raw,
    });
  } catch (error) {
    throw describeMailServerError(error, "SMTP", credentials.smtp.host);
  } finally {
    transport.close();
  }

  try {
    const client = await connectImap(credentials);
    try {
      const sentPath = account.syncState.imap?.sent?.path ?? (await findSentFolder(client));
      if (sentPath) await client.append(sentPath, raw, ["\\Seen"]);
    } finally {
      await closeImap(client);
    }
  } catch (error) {
    // The message has gone out; a missing copy in the sent folder is not worth failing the send for.
    console.error(`[imap] could not save the sent copy for ${account.emailAddress}:`, error);
  }

  // Threads are keyed by the Message-ID that started them, as the sync does for received mail.
  const threadRoot = input.replyTo?.references?.split(/\s+/).find(Boolean) ?? input.replyTo?.messageIdHeader ?? input.messageId;
  return { externalId: `imap:${account.id}:outbox:${input.messageId}`, threadId: threadRoot, messageIdHeader: input.messageId };
}
