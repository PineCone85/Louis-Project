import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, messages, type Client, type Message, type Settings, type WhatsAppMedia } from "@/lib/db/schema";
import { isAutomatedEmail, type ParsedGmailMessage } from "@/lib/gmail/mime";
import { sanitizeEmailHtml } from "@/lib/sanitize";
import { truncate } from "@/lib/format";
import { waIdToPhone } from "@/lib/phone";
import { evaluateAutoReply } from "@/lib/auto-reply/engine";
import { findClientByEmail, findClientByPhone } from "./matching";
import { createNotification } from "./notifications";

const MAX_TEXT = 200_000;
const MAX_HTML = 400_000;

export type IngestResult = { message: Message | null; created: boolean; client: Client | null };

async function hasPriorMessages(channel: string, contactAddress: string): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .where(and(eq(messages.channel, channel), eq(messages.contactAddress, contactAddress)));
  return (row?.count ?? 0) > 0;
}

async function touchClient(client: Client, direction: "inbound" | "outbound", at: Date): Promise<void> {
  await db
    .update(clients)
    .set({
      lastContactAt: sql`greatest(coalesce(${clients.lastContactAt}, ${at}), ${at})`,
      ...(direction === "inbound" ? { lastInboundAt: sql`greatest(coalesce(${clients.lastInboundAt}, ${at}), ${at})` } : {}),
    })
    .where(eq(clients.id, client.id));
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

export type IngestEmailInput = {
  parsed: ParsedGmailMessage;
  accountEmail: string;
  /** Messages that pre-date the connection are stored silently: no notification, no automatic reply. */
  historical: boolean;
  settings: Settings;
};

export async function ingestEmail(input: IngestEmailInput): Promise<IngestResult> {
  const { parsed, settings } = input;
  const self = input.accountEmail.toLowerCase();
  const fromSelf = parsed.from?.address === self || parsed.labelIds.includes("SENT");
  const direction: "inbound" | "outbound" = fromSelf ? "outbound" : "inbound";

  let counterpart = direction === "inbound" ? parsed.from : (parsed.to.find((a) => a.address !== self) ?? parsed.to[0] ?? null);
  if (!counterpart && direction === "outbound") counterpart = parsed.cc.find((a) => a.address !== self) ?? null;
  if (!counterpart) return { message: null, created: false, client: null };

  if (direction === "outbound" && !settings.syncSentMail) return { message: null, created: false, client: null };

  const client = await findClientByEmail(counterpart.address);
  if (!client) {
    if (direction === "outbound") return { message: null, created: false, client: null };
    if (!settings.trackUnknownSenders) return { message: null, created: false, client: null };
  }

  const isNewContact = !(await hasPriorMessages("email", counterpart.address));
  const bodyHtml = parsed.html ? sanitizeEmailHtml(parsed.html).slice(0, MAX_HTML) : null;

  const [inserted] = await db
    .insert(messages)
    .values({
      channel: "email",
      direction,
      clientId: client?.id ?? null,
      contactName: counterpart.name,
      contactAddress: counterpart.address,
      externalId: parsed.id,
      threadId: parsed.threadId,
      subject: parsed.subject || null,
      snippet: truncate(parsed.snippet || parsed.text, 200) || null,
      bodyText: parsed.text.slice(0, MAX_TEXT),
      bodyHtml,
      fromAddress: parsed.from?.address ?? null,
      toAddresses: parsed.to,
      ccAddresses: parsed.cc,
      messageIdHeader: parsed.messageIdHeader,
      inReplyTo: parsed.inReplyTo,
      referencesHeader: parsed.references,
      attachments: parsed.attachments,
      status: direction === "inbound" ? "received" : "sent",
      readAt: direction === "outbound" || input.historical ? new Date() : null,
      sentAt: parsed.sentAt,
    })
    .onConflictDoNothing({ target: [messages.channel, messages.externalId] })
    .returning();

  if (!inserted) return { message: null, created: false, client };

  if (client) await touchClient(client, direction, parsed.sentAt);

  if (direction === "inbound" && !input.historical) {
    await createNotification({
      type: "email_received",
      clientId: client?.id ?? null,
      messageId: inserted.id,
      title: client ? `New email from ${client.firstName} ${client.lastName}`.trim() : `New email from ${counterpart.name ?? counterpart.address}`,
      body: parsed.subject || truncate(parsed.text, 120),
    });
    await evaluateAutoReply({
      channel: "email",
      message: inserted,
      client,
      isNewContact,
      settings,
      safeToReply: !isAutomatedEmail(parsed),
    });
  }

  return { message: inserted, created: true, client };
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

export type IngestWhatsAppInput = {
  waMessageId: string;
  fromWaId: string;
  profileName: string | null;
  timestamp: Date;
  type: string;
  text: string | null;
  media: WhatsAppMedia | null;
  settings: Settings;
};

export async function ingestWhatsApp(input: IngestWhatsAppInput): Promise<IngestResult> {
  const phone = waIdToPhone(input.fromWaId);
  const client = await findClientByPhone(phone);
  const isNewContact = !(await hasPriorMessages("whatsapp", phone));
  const body = input.text ?? "";

  const [inserted] = await db
    .insert(messages)
    .values({
      channel: "whatsapp",
      direction: "inbound",
      clientId: client?.id ?? null,
      contactName: input.profileName,
      contactAddress: phone,
      externalId: input.waMessageId,
      threadId: null,
      subject: null,
      snippet: truncate(body, 200) || null,
      bodyText: body,
      mediaType: input.type,
      media: input.media,
      status: "received",
      readAt: null,
      sentAt: input.timestamp,
    })
    .onConflictDoNothing({ target: [messages.channel, messages.externalId] })
    .returning();

  if (!inserted) return { message: null, created: false, client };

  if (client) await touchClient(client, "inbound", input.timestamp);

  await createNotification({
    type: "whatsapp_received",
    clientId: client?.id ?? null,
    messageId: inserted.id,
    title: client
      ? `New WhatsApp message from ${client.firstName} ${client.lastName}`.trim()
      : `New WhatsApp message from ${input.profileName ?? phone}`,
    body: truncate(body, 120) || (input.type !== "text" ? `Sent a ${input.type}` : null),
  });

  await evaluateAutoReply({
    channel: "whatsapp",
    message: inserted,
    client,
    isNewContact,
    settings: input.settings,
    safeToReply: input.type !== "reaction",
  });

  return { message: inserted, created: true, client };
}

/** Links messages from a contact to a client, used when a client is created or their details change. */
export async function relinkMessagesForClient(client: Client): Promise<number> {
  const emailAddresses = [client.email, client.alternateEmail].filter((v): v is string => Boolean(v));
  const phones = [client.phone, client.alternatePhone].filter((v): v is string => Boolean(v));
  let linked = 0;
  for (const address of emailAddresses) {
    const rows = await db
      .update(messages)
      .set({ clientId: client.id })
      .where(and(eq(messages.channel, "email"), eq(messages.contactAddress, address), sql`${messages.clientId} is null`))
      .returning({ id: messages.id });
    linked += rows.length;
  }
  for (const phone of phones) {
    const rows = await db
      .update(messages)
      .set({ clientId: client.id })
      .where(and(eq(messages.channel, "whatsapp"), eq(messages.contactAddress, phone), sql`${messages.clientId} is null`))
      .returning({ id: messages.id });
    linked += rows.length;
  }
  if (linked > 0) {
    await db.execute(sql`
      update notifications set client_id = ${client.id}
      where client_id is null and message_id in (select id from messages where client_id = ${client.id})
    `);
    await db.execute(sql`
      update clients set
        last_contact_at = (select max(sent_at) from messages where client_id = ${client.id}),
        last_inbound_at = (select max(sent_at) from messages where client_id = ${client.id} and direction = 'inbound')
      where id = ${client.id}
    `);
  }
  return linked;
}
