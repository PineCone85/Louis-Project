"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { messageDrafts } from "@/lib/db/schema";
import { sendEmail } from "@/lib/gmail/send";
import { replySubject } from "@/lib/gmail/mime";
import { latestEmailInThread } from "@/lib/queries/messages";
import { sendWhatsAppText } from "@/lib/whatsapp/send";
import { WhatsAppApiError } from "@/lib/whatsapp/client";
import { formOptional, formString, type ActionResult } from "@/lib/validation";

function revalidate(clientId: string | null) {
  revalidatePath("/drafts");
  revalidatePath("/inbox");
  revalidatePath("/");
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

export async function sendDraftAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireSession();
  const id = formString(formData, "id");
  const draft = await db.query.messageDrafts.findFirst({ where: eq(messageDrafts.id, id) });
  if (!draft) return { ok: false, error: "This draft no longer exists." };
  if (draft.status !== "pending") return { ok: false, error: "This draft has already been handled." };
  const body = formString(formData, "body");
  const subject = formOptional(formData, "subject") ?? draft.subject ?? "";
  if (!body) return { ok: false, fieldErrors: { body: "Write a message first" } };

  try {
    let sentId: string;
    if (draft.channel === "email") {
      if (!subject.trim()) return { ok: false, fieldErrors: { subject: "Subject is required" } };
      let replyTo: { threadId: string | null; messageIdHeader: string | null; references: string | null } | null = null;
      let finalSubject = subject;
      if (draft.threadId) {
        const last = await latestEmailInThread(draft.threadId);
        if (last) {
          replyTo = { threadId: draft.threadId, messageIdHeader: last.messageIdHeader, references: last.referencesHeader };
          finalSubject = replySubject(subject);
        }
      }
      const sent = await sendEmail({
        to: [{ name: draft.contactName, address: draft.contactAddress }],
        subject: finalSubject,
        text: body,
        clientId: draft.clientId,
        contactName: draft.contactName,
        replyTo,
      });
      sentId = sent.id;
    } else {
      const sent = await sendWhatsAppText({ toPhone: draft.contactAddress, text: body, clientId: draft.clientId, contactName: draft.contactName });
      sentId = sent.id;
    }
    await db.update(messageDrafts).set({ status: "sent", sentMessageId: sentId, body, subject: subject || null, updatedAt: new Date() }).where(eq(messageDrafts.id, id));
  } catch (error) {
    if (error instanceof WhatsAppApiError) return { ok: false, error: error.message };
    return { ok: false, error: error instanceof Error ? error.message : "Sending failed" };
  }
  revalidate(draft.clientId);
  return { ok: true };
}

export async function dismissDraftAction(id: string): Promise<void> {
  await requireSession();
  const [draft] = await db.update(messageDrafts).set({ status: "dismissed", updatedAt: new Date() }).where(eq(messageDrafts.id, id)).returning({ clientId: messageDrafts.clientId });
  revalidate(draft?.clientId ?? null);
}

export async function dismissAllDraftsAction(): Promise<void> {
  await requireSession();
  await db.update(messageDrafts).set({ status: "dismissed", updatedAt: new Date() }).where(eq(messageDrafts.status, "pending"));
  revalidate(null);
}
