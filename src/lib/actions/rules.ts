"use server";

import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { AUTO_REPLY_AUDIENCES, AUTO_REPLY_TRIGGERS } from "@/lib/constants";
import { db } from "@/lib/db";
import { autoReplyRules, templates } from "@/lib/db/schema";
import { STAGE_KEYS } from "@/lib/pipeline";
import { fieldErrorsFrom, formBoolean, formList, formNumber, formOptional, formString, type ActionResult } from "@/lib/validation";

const ruleSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  channel: z.enum(["email", "whatsapp"]),
  triggerType: z.enum(AUTO_REPLY_TRIGGERS.map((t) => t.key) as [string, ...string[]]),
  applyTo: z.enum(AUTO_REPLY_AUDIENCES.map((a) => a.key) as [string, ...string[]]),
  cooldownHours: z.number().int().min(0).max(24 * 90),
  templateId: z.string().uuid("Choose a template"),
});

export async function saveRuleAction(_prev: ActionResult<{ saved: boolean }>, formData: FormData): Promise<ActionResult<{ saved: boolean }>> {
  await requireSession();
  const id = formOptional(formData, "id");
  const parsed = ruleSchema.safeParse({
    name: formString(formData, "name"),
    channel: formString(formData, "channel") || "email",
    triggerType: formString(formData, "triggerType") || "any",
    applyTo: formString(formData, "applyTo") || "all",
    cooldownHours: formNumber(formData, "cooldownHours") ?? 24,
    templateId: formString(formData, "templateId"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const keywords = formString(formData, "keywords")
    .split(/[\n,]/)
    .map((k) => k.trim())
    .filter(Boolean);
  if (parsed.data.triggerType === "keyword" && keywords.length === 0) {
    return { ok: false, fieldErrors: { keywords: "Add at least one keyword" } };
  }
  const stages = formList(formData, "stages").filter((s) => STAGE_KEYS.includes(s));

  const template = await db.query.templates.findFirst({ where: eq(templates.id, parsed.data.templateId) });
  if (!template) return { ok: false, fieldErrors: { templateId: "Choose a template" } };
  if (template.channel !== "any" && template.channel !== parsed.data.channel) {
    return { ok: false, fieldErrors: { templateId: "That template is for a different channel" } };
  }

  const values = {
    ...parsed.data,
    keywords,
    stages,
    enabled: formBoolean(formData, "enabled"),
    oncePerThread: formBoolean(formData, "oncePerThread"),
    updatedAt: new Date(),
  };

  if (id) {
    await db.update(autoReplyRules).set(values).where(eq(autoReplyRules.id, id));
  } else {
    const existing = await db.select({ position: autoReplyRules.position }).from(autoReplyRules);
    const position = existing.length > 0 ? Math.max(...existing.map((r) => r.position)) + 1 : 0;
    await db.insert(autoReplyRules).values({ ...values, position });
  }
  revalidatePath("/settings/auto-replies");
  return { ok: true, data: { saved: true } };
}

export async function toggleRuleAction(id: string, enabled: boolean): Promise<void> {
  await requireSession();
  await db.update(autoReplyRules).set({ enabled, updatedAt: new Date() }).where(eq(autoReplyRules.id, id));
  revalidatePath("/settings/auto-replies");
}

export async function deleteRuleAction(id: string): Promise<void> {
  await requireSession();
  await db.delete(autoReplyRules).where(eq(autoReplyRules.id, id));
  revalidatePath("/settings/auto-replies");
}

export async function moveRuleAction(id: string, direction: "up" | "down"): Promise<void> {
  await requireSession();
  const rules = await db.query.autoReplyRules.findMany({ orderBy: [asc(autoReplyRules.position), asc(autoReplyRules.createdAt)] });
  const index = rules.findIndex((r) => r.id === id);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swapWith < 0 || swapWith >= rules.length) return;
  const reordered = [...rules];
  [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];
  await Promise.all(
    reordered.map((rule, position) => db.update(autoReplyRules).set({ position }).where(eq(autoReplyRules.id, rule.id))),
  );
  revalidatePath("/settings/auto-replies");
}
