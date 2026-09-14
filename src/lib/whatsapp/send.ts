import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, messages, type Message } from "@/lib/db/schema";
import { truncate } from "@/lib/format";
import { logActivity } from "@/lib/messaging/activity";
import { phoneToWaId } from "@/lib/phone";
import { sendTemplateMessage, sendTextMessage, type TemplateComponent } from "./client";

export const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;

export type WhatsAppWindow = { open: boolean; lastInboundAt: Date | null; expiresAt: Date | null };

/** Meta only allows free-form replies within 24 hours of the customer's last message. */
export async function getWhatsAppWindow(phone: string): Promise<WhatsAppWindow> {
  const last = await db.query.messages.findFirst({
    where: and(eq(messages.channel, "whatsapp"), eq(messages.direction, "inbound"), eq(messages.contactAddress, phone)),
    orderBy: [desc(messages.sentAt)],
    columns: { sentAt: true },
  });
  if (!last) return { open: false, lastInboundAt: null, expiresAt: null };
  const expiresAt = new Date(last.sentAt.getTime() + WHATSAPP_WINDOW_MS);
  return { open: expiresAt.getTime() > Date.now(), lastInboundAt: last.sentAt, expiresAt };
}

type StoreInput = {
  phone: string;
  externalId: string;
  text: string;
  clientId: string | null;
  contactName: string | null;
  isAutoReply: boolean;
  autoReplyRuleId: string | null;
  mediaType: string;
};

async function storeOutbound(input: StoreInput): Promise<Message> {
  const now = new Date();
  const [stored] = await db
    .insert(messages)
    .values({
      channel: "whatsapp",
      direction: "outbound",
      clientId: input.clientId,
      contactName: input.contactName,
      contactAddress: input.phone,
      externalId: input.externalId,
      snippet: truncate(input.text, 200),
      bodyText: input.text,
      mediaType: input.mediaType,
      status: "sent",
      isAutoReply: input.isAutoReply,
      autoReplyRuleId: input.autoReplyRuleId,
      readAt: now,
      sentAt: now,
    })
    .returning();

  if (input.clientId) {
    await db
      .update(clients)
      .set({ lastContactAt: sql`greatest(coalesce(${clients.lastContactAt}, ${now}), ${now})` })
      .where(eq(clients.id, input.clientId));
    if (!input.isAutoReply) {
      await logActivity({
        clientId: input.clientId,
        type: "whatsapp_sent",
        title: input.mediaType === "template" ? "WhatsApp template message sent" : "WhatsApp message sent",
        body: truncate(input.text, 160),
        metadata: { messageId: stored.id },
      });
    }
  }
  return stored;
}

export async function sendWhatsAppText(input: {
  toPhone: string;
  text: string;
  clientId?: string | null;
  contactName?: string | null;
  isAutoReply?: boolean;
  autoReplyRuleId?: string | null;
}): Promise<Message> {
  const text = input.text.trim();
  if (!text) throw new Error("Message text is required.");
  const { messageId } = await sendTextMessage(phoneToWaId(input.toPhone), text);
  return storeOutbound({
    phone: input.toPhone,
    externalId: messageId,
    text,
    clientId: input.clientId ?? null,
    contactName: input.contactName ?? null,
    isAutoReply: input.isAutoReply ?? false,
    autoReplyRuleId: input.autoReplyRuleId ?? null,
    mediaType: "text",
  });
}

export async function sendWhatsAppTemplate(input: {
  toPhone: string;
  templateName: string;
  language: string;
  headerParams: string[];
  bodyParams: string[];
  preview: string;
  clientId?: string | null;
  contactName?: string | null;
}): Promise<Message> {
  const components: TemplateComponent[] = [];
  if (input.headerParams.length > 0) {
    components.push({ type: "header", parameters: input.headerParams.map((text) => ({ type: "text", text })) });
  }
  if (input.bodyParams.length > 0) {
    components.push({ type: "body", parameters: input.bodyParams.map((text) => ({ type: "text", text })) });
  }
  const { messageId } = await sendTemplateMessage(phoneToWaId(input.toPhone), {
    name: input.templateName,
    language: input.language,
    components,
  });
  return storeOutbound({
    phone: input.toPhone,
    externalId: messageId,
    text: input.preview,
    clientId: input.clientId ?? null,
    contactName: input.contactName ?? null,
    isAutoReply: false,
    autoReplyRuleId: null,
    mediaType: "template",
  });
}
