"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { disconnectGmail, getGmailAccount } from "@/lib/gmail/account";
import { GmailClient } from "@/lib/gmail/client";
import { ensureGmailWatch, syncGmail } from "@/lib/gmail/sync";
import { normalizePhone } from "@/lib/phone";
import { fieldErrorsFrom, formBoolean, formList, formString, type ActionResult } from "@/lib/validation";

const profileSchema = z.object({
  agentName: z.string().trim().max(120),
  agencyName: z.string().trim().max(120),
  emailSignature: z.string().trim().max(2000),
  timezone: z.string().trim().min(1).max(64),
  defaultCountry: z.string().trim().length(2, "Use a two-letter country code").toUpperCase(),
  currency: z.string().trim().length(3, "Use a three-letter currency code").toUpperCase(),
  businessStart: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
  businessEnd: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
});

function validTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function saveProfileAction(_prev: ActionResult<{ saved: boolean }>, formData: FormData): Promise<ActionResult<{ saved: boolean }>> {
  await requireSession();
  const parsed = profileSchema.safeParse({
    agentName: formString(formData, "agentName"),
    agencyName: formString(formData, "agencyName"),
    emailSignature: formString(formData, "emailSignature"),
    timezone: formString(formData, "timezone") || "Africa/Johannesburg",
    defaultCountry: formString(formData, "defaultCountry") || "ZA",
    currency: formString(formData, "currency") || "ZAR",
    businessStart: formString(formData, "businessStart") || "08:00",
    businessEnd: formString(formData, "businessEnd") || "17:00",
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  if (!validTimezone(parsed.data.timezone)) return { ok: false, fieldErrors: { timezone: "Unknown time zone" } };

  const phoneRaw = formString(formData, "agentPhone");
  const agentPhone = phoneRaw ? normalizePhone(phoneRaw, parsed.data.defaultCountry) : "";
  if (phoneRaw && !agentPhone) return { ok: false, fieldErrors: { agentPhone: "Enter a valid phone number" } };

  const days = formList(formData, "businessDays")
    .map(Number)
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);

  await db
    .update(settings)
    .set({
      agentName: parsed.data.agentName,
      agencyName: parsed.data.agencyName,
      agentPhone: agentPhone ?? "",
      emailSignature: parsed.data.emailSignature,
      timezone: parsed.data.timezone,
      defaultCountry: parsed.data.defaultCountry,
      currency: parsed.data.currency,
      businessHours: { days, start: parsed.data.businessStart, end: parsed.data.businessEnd },
      trackUnknownSenders: formBoolean(formData, "trackUnknownSenders"),
      syncSentMail: formBoolean(formData, "syncSentMail"),
      updatedAt: new Date(),
    })
    .where(eq(settings.id, 1));
  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { ok: true, data: { saved: true } };
}

export async function saveAutomationAction(_prev: ActionResult<{ saved: boolean }>, formData: FormData): Promise<ActionResult<{ saved: boolean }>> {
  await requireSession();
  await db
    .update(settings)
    .set({
      emailAutoRepliesEnabled: formBoolean(formData, "emailAutoRepliesEnabled"),
      whatsappAutoRepliesEnabled: formBoolean(formData, "whatsappAutoRepliesEnabled"),
      updatedAt: new Date(),
    })
    .where(eq(settings.id, 1));
  revalidatePath("/settings/auto-replies");
  return { ok: true, data: { saved: true } };
}

export async function disconnectGmailAction(): Promise<void> {
  await requireSession();
  await disconnectGmail();
  revalidatePath("/settings/gmail");
  revalidatePath("/", "layout");
}

export async function syncNowAction(): Promise<ActionResult<{ processed: number; created: number }>> {
  await requireSession();
  const result = await syncGmail({ reason: "manual", budgetMs: 45_000 });
  revalidatePath("/settings/gmail");
  revalidatePath("/inbox");
  revalidatePath("/");
  if (!result.ran) return { ok: false, error: result.reason === "locked" ? "A sync is already running." : "Gmail is not connected." };
  if (result.error) return { ok: false, error: result.error };
  return { ok: true, data: { processed: result.processed, created: result.created } };
}

export async function enableGmailWatchAction(): Promise<ActionResult> {
  await requireSession();
  const account = await getGmailAccount();
  if (!account) return { ok: false, error: "Gmail is not connected." };
  try {
    await ensureGmailWatch(new GmailClient(account), { ...account, watchExpiresAt: null, watchTopic: null });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to register push notifications" };
  }
  revalidatePath("/settings/gmail");
  return { ok: true };
}
