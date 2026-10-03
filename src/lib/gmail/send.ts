import type { EmailAccount } from "@/lib/db/schema";
import type { ParsedAddress } from "@/lib/email-address";
import { GmailClient } from "./client";
import { buildMimeMessage, buildReferences } from "./mime";

export type GmailSendInput = {
  from: ParsedAddress;
  to: ParsedAddress[];
  cc?: ParsedAddress[];
  subject: string;
  text: string;
  html: string;
  messageId: string;
  replyTo?: { threadId: string | null; messageIdHeader: string | null; references: string | null } | null;
};

export type GmailSendResult = { externalId: string; threadId: string | null; messageIdHeader: string };

/** Sends a MIME message through the Gmail API, threading it when replying. */
export async function sendViaGmail(account: EmailAccount, input: GmailSendInput): Promise<GmailSendResult> {
  const raw = buildMimeMessage({
    from: input.from,
    to: input.to,
    cc: input.cc,
    subject: input.subject,
    text: input.text,
    html: input.html,
    messageId: input.messageId,
    inReplyTo: input.replyTo?.messageIdHeader ?? null,
    references: input.replyTo ? buildReferences(input.replyTo.references, input.replyTo.messageIdHeader) : null,
  });
  const response = await new GmailClient(account).sendRaw(
    Buffer.from(raw, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
    input.replyTo?.threadId ?? undefined,
  );
  return { externalId: response.id, threadId: response.threadId ?? null, messageIdHeader: input.messageId };
}
