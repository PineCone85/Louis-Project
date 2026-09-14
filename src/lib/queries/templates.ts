import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { autoReplyRules, templates, type AutoReplyRule, type Template } from "@/lib/db/schema";

export async function listTemplates(channel?: "email" | "whatsapp"): Promise<Template[]> {
  const rows = await db.query.templates.findMany({ orderBy: [asc(templates.name)] });
  if (!channel) return rows;
  return rows.filter((t) => t.channel === "any" || t.channel === channel);
}

export async function getTemplate(id: string): Promise<Template | null> {
  const row = await db.query.templates.findFirst({ where: eq(templates.id, id) });
  return row ?? null;
}

export type RuleWithTemplate = AutoReplyRule & { template: Template | null };

export async function listRules(): Promise<RuleWithTemplate[]> {
  const rows = await db
    .select({ rule: autoReplyRules, template: templates })
    .from(autoReplyRules)
    .leftJoin(templates, eq(autoReplyRules.templateId, templates.id))
    .orderBy(asc(autoReplyRules.position), desc(autoReplyRules.createdAt));
  return rows.map((row) => ({ ...row.rule, template: row.template }));
}

export async function getRule(id: string): Promise<AutoReplyRule | null> {
  const row = await db.query.autoReplyRules.findFirst({ where: eq(autoReplyRules.id, id) });
  return row ?? null;
}
