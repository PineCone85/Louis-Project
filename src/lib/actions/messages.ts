"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { normalizeEmail } from "@/lib/email-address";
import { sendEmail } from "@/lib/gmail/send";
import { replySubject } from "@/lib/gmail/mime";
import { logActivity } from "@/lib/messaging/activity";
import { relinkMessagesForClient } from "@/lib/messaging/ingest";
import { normalizePhone } from "@/lib/phone";
import { latestEmailInThread, markConversationRead as markConversationReadQuery } from "@/lib/queries/messages";
import { markNotificationsReadForClient } from "@/lib/queries/notifications";
import { getSettings } from "@/lib/queries/settings";
import { WhatsAppApiError } from "@/lib/whatsapp/client";
import { sendWhatsAppTemplate, sendWhatsAppText } from "@/lib/whatsapp/send";
import { formList, formOptional, formString, type ActionResult } from "@/lib/validation";

function revalidateConversation(clientId: string | null) {
  revalidatePath("/inbox");
  revalidatePath("/");
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

export async function sendEmailAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireSession();
  const clientId = formOptional(formData, "clientId");
  const to = normalizeEmail(formString(formData, "to"));
  const toName = formOptional(formData, "toName");
  const subject = formString(formData, "subject");
  const body = formString(formData, "body");
  const threadId = formOptional(formData, "threadId");

  const fieldErrors: Record<string, string> = {};
  if (!to) fieldErrors.to = "A valid recipient email address is required";
  if (!subject) fieldErrors.subject = "Subject is required";
  if (!body) fieldErrors.body = "Write a message first";
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  let replyTo: { threadId: string | null; messageIdHeader: string | null; references: string | null } | null = null;
  let finalSubject = subject;
  if (threadId) {
    const last = await latestEmailInThread(threadId);
    if (last) {
      replyTo = { threadId, messageIdHeader: last.messageIdHeader, references: last.referencesHeader };
      finalSubject = replySubject(subject);
    }
  }

  try {
    await sendEmail({
      to: [{ name: toName, address: to! }],
      subject: finalSubject,
      text: body,
      clientId,
      contactName: toName,
      replyTo,
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to send email" };
  }
  revalidateConversation(clientId);
  return { ok: true };
}

export async function sendWhatsAppAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireSession();
  const settings = await getSettings();
  const clientId = formOptional(formData, "clientId");
  const phone = normalizePhone(formString(formData, "phone"), settings.defaultCountry);
  const text = formString(formData, "text");
  const contactName = formOptional(formData, "contactName");
  if (!phone) return { ok: false, error: "A valid phone number is required" };
  if (!text) return { ok: false, fieldErrors: { text: "Write a message first" } };

  try {
    await sendWhatsAppText({ toPhone: phone, text, clientId, contactName });
  } catch (error) {
    if (error instanceof WhatsAppApiError && error.outsideWindow) {
      return {
        ok: false,
        error: "More than 24 hours have passed since this contact last messaged you, so WhatsApp only allows an approved template message. Choose a template below.",
      };
    }
    return { ok: false, error: error instanceof Error ? error.message : "Unable to send WhatsApp message" };
  }
  revalidateConversation(clientId);
  return { ok: true };
}

export async function sendWhatsAppTemplateAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireSession();
  const settings = await getSettings();
  const clientId = formOptional(formData, "clientId");
  const phone = normalizePhone(formString(formData, "phone"), settings.defaultCountry);
  const templateName = formString(formData, "templateName");
  const language = formString(formData, "language") || "en";
  const headerParams = formList(formData, "headerParam");
  const bodyParams = formList(formData, "bodyParam");
  const preview = formString(formData, "preview") || `Template: ${templateName}`;
  const contactName = formOptional(formData, "contactName");
  if (!phone) return { ok: false, error: "A valid phone number is required" };
  if (!templateName) return { ok: false, error: "Choose a template" };

  try {
    await sendWhatsAppTemplate({ toPhone: phone, templateName, language, headerParams, bodyParams, preview, clientId, contactName });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to send template message" };
  }
  revalidateConversation(clientId);
  return { ok: true };
}

export async function markConversationReadAction(channel: string, contactAddress: string, clientId: string | null): Promise<void> {
  await requireSession();
  await markConversationReadQuery(channel, contactAddress);
  if (clientId) await markNotificationsReadForClient(clientId);
  revalidateConversation(clientId);
}

/** Attaches an unknown contact's conversation to an existing client, saving the address on the client. */
export async function linkConversationToClientAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireSession();
  const channel = formString(formData, "channel");
  const contactAddress = formString(formData, "contactAddress");
  const clientId = formString(formData, "clientId");
  if (!clientId) return { ok: false, error: "Choose a client" };
  const client = await db.query.clients.findFirst({ where: eq(clients.id, clientId) });
  if (!client) return { ok: false, error: "Client not found" };

  if (channel === "email") {
    if (client.email !== contactAddress && client.alternateEmail !== contactAddress) {
      if (!client.email) await db.update(clients).set({ email: contactAddress, updatedAt: new Date() }).where(eq(clients.id, clientId));
      else if (!client.alternateEmail) await db.update(clients).set({ alternateEmail: contactAddress, updatedAt: new Date() }).where(eq(clients.id, clientId));
      else return { ok: false, error: "This client already has two email addresses. Edit the client to replace one first." };
    }
  } else if (channel === "whatsapp") {
    if (client.phone !== contactAddress && client.alternatePhone !== contactAddress) {
      if (!client.phone) await db.update(clients).set({ phone: contactAddress, updatedAt: new Date() }).where(eq(clients.id, clientId));
      else if (!client.alternatePhone) await db.update(clients).set({ alternatePhone: contactAddress, updatedAt: new Date() }).where(eq(clients.id, clientId));
      else return { ok: false, error: "This client already has two phone numbers. Edit the client to replace one first." };
    }
  } else {
    return { ok: false, error: "Unknown channel" };
  }

  const refreshed = await db.query.clients.findFirst({ where: eq(clients.id, clientId) });
  const linked = refreshed ? await relinkMessagesForClient(refreshed) : 0;
  await logActivity({
    clientId,
    type: "messages_linked",
    title: `${channel === "email" ? "Email" : "WhatsApp"} conversation linked`,
    body: `${linked} message${linked === 1 ? "" : "s"} from ${contactAddress}`,
  });
  revalidateConversation(clientId);
  revalidatePath("/clients");
  return { ok: true, data: undefined };
}
