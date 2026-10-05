import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, messages, type EmailAccount, type Message } from "@/lib/db/schema";
import type { ParsedAddress } from "@/lib/email-address";
import { env } from "@/lib/env";
import { truncate } from "@/lib/format";
import { buildReferences } from "@/lib/gmail/mime";
import { logActivity } from "@/lib/messaging/activity";
import { getSettings } from "@/lib/queries/settings";
import { getDefaultEmailAccount, getEmailAccount } from "./accounts";
import { textToHtml } from "./html";

export type SendEmailInput = {
  to: ParsedAddress[];
  cc?: ParsedAddress[];
  subject: string;
  text: string;
  clientId?: string | null;
  contactName?: string | null;
  /** Mailbox to send from. Defaults to the thread's mailbox, then the first connected account. */
  accountId?: string | null;
  replyTo?: {
    threadId: string | null;
    messageIdHeader: string | null;
    references: string | null;
    /** Provider id of the message being replied to. */
    externalId?: string | null;
    /** Mailbox that holds the message being replied to; null when it was disconnected. */
    accountId?: string | null;
  } | null;
  isAutoReply?: boolean;
  autoReplyRuleId?: string | null;
};

async function resolveAccount(input: SendEmailInput): Promise<EmailAccount | null> {
  if (input.accountId) {
    const chosen = await getEmailAccount(input.accountId);
    if (chosen) return chosen;
  }
  return getDefaultEmailAccount();
}

/** Sends an email through a connected mailbox (Gmail or Outlook) and records it in the CRM. */
export async function sendEmail(input: SendEmailInput): Promise<Message> {
  if (input.to.length === 0) throw new Error("A recipient is required.");
  const account = await resolveAccount(input);
  if (!account && !env.demo) throw new Error("No email account is connected. Connect Gmail or Outlook in Settings before sending email.");

  const settings = await getSettings();
  const fromAddress = account?.emailAddress ?? `${settings.agentName.split(" ")[0].toLowerCase() || "agent"}@demo.local`;
  const html = textToHtml(input.text);

  // Provider ids (Gmail thread ids, Graph message ids) only mean something inside the mailbox that
  // issued them. When the conversation's mailbox is gone or differs, send a fresh message that still
  // carries the standard threading headers where the provider lets us set them.
  const sameMailbox = Boolean(account && input.replyTo && input.replyTo.accountId === account.id);
  const providerThreadId = sameMailbox ? (input.replyTo?.threadId ?? null) : null;
  const providerMessageId = sameMailbox ? (input.replyTo?.externalId ?? null) : null;

  let externalId: string;
  let threadId: string | null;
  let messageIdHeader: string | null;

  if (!account) {
    // Demo mode: the message is recorded as sent without leaving the CRM.
    externalId = `demo-${randomUUID()}`;
    threadId = input.replyTo?.threadId ?? `demo-thread-${randomUUID()}`;
    messageIdHeader = `<${randomUUID()}@demo.local>`;
  } else if (account.provider === "gmail") {
    const { sendViaGmail } = await import("@/lib/gmail/send");
    const domain = account.emailAddress.split("@")[1] ?? "mail.gmail.com";
    const sent = await sendViaGmail(account, {
      from: { name: settings.agentName || null, address: account.emailAddress },
      to: input.to,
      cc: input.cc,
      subject: input.subject,
      text: input.text,
      html,
      messageId: `<${randomUUID()}@${domain}>`,
      replyTo: input.replyTo ? { ...input.replyTo, threadId: providerThreadId } : null,
    });
    externalId = sent.externalId;
    threadId = sent.threadId ?? input.replyTo?.threadId ?? null;
    messageIdHeader = sent.messageIdHeader;
  } else {
    const { sendViaOutlook } = await import("@/lib/outlook/send");
    const sent = await sendViaOutlook(account, {
      to: input.to,
      cc: input.cc,
      subject: input.subject,
      html,
      replyToExternalId: providerMessageId,
    });
    externalId = sent.externalId;
    threadId = sent.threadId ?? input.replyTo?.threadId ?? null;
    messageIdHeader = sent.messageIdHeader;
  }

  const now = new Date();
  const counterpart = input.to[0];
  const [stored] = await db
    .insert(messages)
    .values({
      channel: "email",
      direction: "outbound",
      clientId: input.clientId ?? null,
      accountId: account?.id ?? null,
      contactName: input.contactName ?? counterpart.name,
      contactAddress: counterpart.address,
      externalId,
      threadId,
      subject: input.subject,
      snippet: truncate(input.text, 200),
      bodyText: input.text,
      bodyHtml: html,
      fromAddress,
      toAddresses: input.to,
      ccAddresses: input.cc ?? [],
      messageIdHeader,
      inReplyTo: input.replyTo?.messageIdHeader ?? null,
      referencesHeader: input.replyTo ? buildReferences(input.replyTo.references, input.replyTo.messageIdHeader) : null,
      attachments: [],
      status: "sent",
      isAutoReply: input.isAutoReply ?? false,
      autoReplyRuleId: input.autoReplyRuleId ?? null,
      readAt: now,
      sentAt: now,
    })
    .onConflictDoUpdate({
      target: [messages.channel, messages.externalId],
      set: { isAutoReply: input.isAutoReply ?? false, autoReplyRuleId: input.autoReplyRuleId ?? null, clientId: input.clientId ?? null, accountId: account?.id ?? null },
    })
    .returning();

  if (input.clientId) {
    const [client] = await db
      .update(clients)
      .set({ lastContactAt: sql`greatest(coalesce(${clients.lastContactAt}, ${now}), ${now})` })
      .where(eq(clients.id, input.clientId))
      .returning();
    if (!input.isAutoReply) {
      await logActivity({
        clientId: input.clientId,
        type: "email_sent",
        title: "Email sent",
        body: input.subject,
        metadata: { messageId: stored.id, accountId: account?.id ?? null },
      });
      const { dispatchWorkflowEvent } = await import("@/lib/workflows/engine");
      await dispatchWorkflowEvent({ trigger: "message.sent", client: client ?? null, message: stored, contact: { name: counterpart.name, address: counterpart.address } });
    }
  }

  return stored;
}
