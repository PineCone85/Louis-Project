import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, messages, type Message } from "@/lib/db/schema";
import type { ParsedAddress } from "@/lib/email-address";
import { env } from "@/lib/env";
import { truncate } from "@/lib/format";
import { logActivity } from "@/lib/messaging/activity";
import { getSettings } from "@/lib/queries/settings";
import { getGmailAccount } from "./account";
import { GmailClient } from "./client";
import { buildMimeMessage, buildReferences, textToHtml } from "./mime";

export type SendEmailInput = {
  to: ParsedAddress[];
  cc?: ParsedAddress[];
  subject: string;
  text: string;
  clientId?: string | null;
  contactName?: string | null;
  replyTo?: { threadId: string | null; messageIdHeader: string | null; references: string | null } | null;
  isAutoReply?: boolean;
  autoReplyRuleId?: string | null;
};

/** Sends an email through the connected Gmail account and records it in the CRM. */
export async function sendEmail(input: SendEmailInput): Promise<Message> {
  const connected = await getGmailAccount();
  if (!connected && !env.demo) throw new Error("Gmail is not connected. Connect it in Settings before sending email.");
  if (input.to.length === 0) throw new Error("A recipient is required.");

  const settings = await getSettings();
  const account = connected ?? { emailAddress: `${settings.agentName.split(" ")[0].toLowerCase() || "agent"}@demo.local` };
  const domain = account.emailAddress.split("@")[1] ?? "mail.gmail.com";
  const messageId = `<${randomUUID()}@${domain}>`;
  const html = textToHtml(input.text);

  const raw = buildMimeMessage({
    from: { name: settings.agentName || null, address: account.emailAddress },
    to: input.to,
    cc: input.cc,
    subject: input.subject,
    text: input.text,
    html,
    messageId,
    inReplyTo: input.replyTo?.messageIdHeader ?? null,
    references: input.replyTo ? buildReferences(input.replyTo.references, input.replyTo.messageIdHeader) : null,
  });

  // In demo mode the message is recorded as sent without leaving the CRM.
  const response = connected
    ? await new GmailClient(connected).sendRaw(
        Buffer.from(raw, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
        input.replyTo?.threadId ?? undefined,
      )
    : { id: `demo-${randomUUID()}`, threadId: input.replyTo?.threadId ?? `demo-thread-${randomUUID()}` };

  const now = new Date();
  const counterpart = input.to[0];
  const [stored] = await db
    .insert(messages)
    .values({
      channel: "email",
      direction: "outbound",
      clientId: input.clientId ?? null,
      contactName: input.contactName ?? counterpart.name,
      contactAddress: counterpart.address,
      externalId: response.id,
      threadId: response.threadId,
      subject: input.subject,
      snippet: truncate(input.text, 200),
      bodyText: input.text,
      bodyHtml: html,
      fromAddress: account.emailAddress,
      toAddresses: input.to,
      ccAddresses: input.cc ?? [],
      messageIdHeader: messageId,
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
      set: { isAutoReply: input.isAutoReply ?? false, autoReplyRuleId: input.autoReplyRuleId ?? null, clientId: input.clientId ?? null },
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
        metadata: { messageId: stored.id },
      });
      const { dispatchWorkflowEvent } = await import("@/lib/workflows/engine");
      await dispatchWorkflowEvent({ trigger: "message.sent", client: client ?? null, message: stored, contact: { name: counterpart.name, address: counterpart.address } });
    }
  }

  return stored;
}
