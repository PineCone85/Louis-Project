"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { autoReplyRules, templates } from "@/lib/db/schema";
import { fieldErrorsFrom, formOptional, formString, type ActionResult } from "@/lib/validation";

const templateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  channel: z.enum(["any", "email", "whatsapp"]),
  subject: z.string().trim().max(200).nullable(),
  body: z.string().trim().min(1, "Message body is required").max(10000),
});

export async function saveTemplateAction(_prev: ActionResult<{ saved: boolean }>, formData: FormData): Promise<ActionResult<{ saved: boolean }>> {
  await requireSession();
  const id = formOptional(formData, "id");
  const parsed = templateSchema.safeParse({
    name: formString(formData, "name"),
    channel: formString(formData, "channel") || "any",
    subject: formOptional(formData, "subject"),
    body: formString(formData, "body"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  if (id) {
    await db.update(templates).set({ ...parsed.data, updatedAt: new Date() }).where(eq(templates.id, id));
  } else {
    await db.insert(templates).values(parsed.data);
  }
  revalidatePath("/settings/templates");
  revalidatePath("/settings/auto-replies");
  return { ok: true, data: { saved: true } };
}

export async function deleteTemplateAction(id: string): Promise<ActionResult> {
  await requireSession();
  const inUse = await db.query.autoReplyRules.findFirst({ where: eq(autoReplyRules.templateId, id) });
  if (inUse) return { ok: false, error: `This template is used by the rule "${inUse.name}". Change that rule first.` };
  await db.delete(templates).where(eq(templates.id, id));
  revalidatePath("/settings/templates");
  return { ok: true };
}
