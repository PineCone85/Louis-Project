"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { settings, type BusinessHours } from "@/lib/db/schema";
import { disconnectGmail, getGmailAccount } from "@/lib/gmail/account";
import { GmailClient } from "@/lib/gmail/client";
import { ensureGmailWatch, syncGmail } from "@/lib/gmail/sync";
import { normalizePhone } from "@/lib/phone";
import { fieldErrorsFrom, formBoolean, formString, type ActionResult } from "@/lib/validation";

const profileSchema = z.object({
  agentName: z.string().trim().max(120),
  agencyName: z.string().trim().max(120),
  emailSignature: z.string().trim().max(2000),
  timezone: z.string().trim().min(1).max(64),
  defaultCountry: z.string().trim().length(2, "Use a two-letter country code").toUpperCase(),
  currency: z.string().trim().length(3, "Use a three-letter currency code").toUpperCase(),
});

const TIME = /^\d{2}:\d{2}$/;

/**
 * Reads the per-day business hours grid. Days share default hours unless a day
 * differs, in which case it is stored as an override so old settings stay valid.
 */
function readBusinessHours(formData: FormData): { hours: BusinessHours; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  const perDay: Array<{ day: number; start: string; end: string }> = [];
  for (let day = 0; day <= 6; day += 1) {
    if (!formBoolean(formData, `businessDay_${day}`)) continue;
    const start = formString(formData, `businessStart_${day}`) || "08:00";
    const end = formString(formData, `businessEnd_${day}`) || "17:00";
    if (!TIME.test(start)) fieldErrors[`businessStart_${day}`] = "Use HH:MM";
    if (!TIME.test(end)) fieldErrors[`businessEnd_${day}`] = "Use HH:MM";
    perDay.push({ day, start, end });
  }
  // The most common pair becomes the default; anything else is an override.
  const counts = new Map<string, number>();
  for (const d of perDay) counts.set(`${d.start}|${d.end}`, (counts.get(`${d.start}|${d.end}`) ?? 0) + 1);
  const [common] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["08:00|17:00"];
  const [start, end] = common.split("|");
  const overrides: Record<string, { start: string; end: string }> = {};
  for (const d of perDay) if (d.start !== start || d.end !== end) overrides[String(d.day)] = { start: d.start, end: d.end };
  const hours: BusinessHours = { days: perDay.map((d) => d.day), start, end };
  if (Object.keys(overrides).length > 0) hours.overrides = overrides;
  return { hours, fieldErrors };
}

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
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  if (!validTimezone(parsed.data.timezone)) return { ok: false, fieldErrors: { timezone: "Unknown time zone" } };

  const phoneRaw = formString(formData, "agentPhone");
  const agentPhone = phoneRaw ? normalizePhone(phoneRaw, parsed.data.defaultCountry) : "";
  if (phoneRaw && !agentPhone) return { ok: false, fieldErrors: { agentPhone: "Enter a valid phone number" } };

  const business = readBusinessHours(formData);
  if (Object.keys(business.fieldErrors).length > 0) return { ok: false, fieldErrors: business.fieldErrors };

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
      businessHours: business.hours,
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
