"use server";

import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { ACTIVITY_TYPES, CLIENT_PROPERTY_STATUSES, PROPERTY_STATUSES } from "@/lib/constants";
import { db } from "@/lib/db";
import { templates, workflows } from "@/lib/db/schema";
import { isStageKey } from "@/lib/pipeline";
import { getStages } from "@/lib/queries/settings";
import { fieldErrorsFrom, formBoolean, formOptional, formString, type ActionResult } from "@/lib/validation";
import { ACTIONS, DRAFT_TARGETS, OPERATORS, TRIGGERS, actionsForTrigger, fieldsForTrigger, triggerDef, type TriggerKey, type WorkflowAction, type WorkflowCondition } from "@/lib/workflows/types";

const workflowSchema = z.object({
  name: z.string().trim().min(1, "Give the workflow a name").max(120),
  description: z.string().trim().max(500),
  trigger: z.enum(TRIGGERS.map((t) => t.key) as [string, ...string[]]),
  matchMode: z.enum(["all", "any"]),
});

const conditionSchema = z.array(
  z.object({
    field: z.string().min(1),
    op: z.enum(OPERATORS.map((o) => o.key) as [string, ...string[]]),
    value: z.string().max(500).default(""),
  }),
);

const actionSchema = z.array(
  z.object({
    type: z.enum(ACTIONS.map((a) => a.key) as [string, ...string[]]),
    config: z.record(z.string(), z.string().max(4000)).default({}),
  }),
);

function parseJson(raw: string | null): unknown {
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function revalidate() {
  revalidatePath("/settings/workflows");
}

export async function saveWorkflowAction(_prev: ActionResult<{ saved: boolean }>, formData: FormData): Promise<ActionResult<{ saved: boolean }>> {
  await requireSession();
  const id = formOptional(formData, "id");
  const parsed = workflowSchema.safeParse({
    name: formString(formData, "name"),
    description: formString(formData, "description"),
    trigger: formString(formData, "trigger"),
    matchMode: formString(formData, "matchMode") || "all",
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  const trigger = triggerDef(parsed.data.trigger)!;

  const conditionsRaw = conditionSchema.safeParse(parseJson(formOptional(formData, "conditions")));
  if (!conditionsRaw.success) return { ok: false, error: "The conditions could not be read. Please check them and try again." };
  const allowedFields = new Set(fieldsForTrigger(trigger.key).map((f) => f.key));
  const conditions: WorkflowCondition[] = [];
  for (const condition of conditionsRaw.data) {
    if (!allowedFields.has(condition.field)) return { ok: false, error: `The field "${condition.field}" is not available for this trigger.` };
    const op = OPERATORS.find((o) => o.key === condition.op)!;
    if (op.needsValue && condition.value.trim() === "") return { ok: false, error: `Enter a value for the "${condition.field}" condition.` };
    conditions.push({ field: condition.field, op: op.key, value: condition.value.trim() });
  }

  const actionsRaw = actionSchema.safeParse(parseJson(formOptional(formData, "actions")));
  if (!actionsRaw.success) return { ok: false, error: "The actions could not be read. Please check them and try again." };
  if (actionsRaw.data.length === 0) return { ok: false, error: "Add at least one action." };
  const allowedActions = new Set(actionsForTrigger(trigger.key).map((a) => a.key));
  const stages = await getStages();
  const actions: WorkflowAction[] = [];
  for (const action of actionsRaw.data) {
    if (!allowedActions.has(action.type as WorkflowAction["type"])) return { ok: false, error: `"${action.type}" cannot run for this trigger.` };
    const config = Object.fromEntries(Object.entries(action.config).map(([k, v]) => [k, v.trim()]));
    switch (action.type) {
      case "ai_draft": {
        const target = DRAFT_TARGETS.find((t) => t.key === (config.target || "event_client"));
        if (!target || !target.needs.some((s) => trigger.subjects.includes(s))) return { ok: false, error: "Choose who the AI draft should go to." };
        break;
      }
      case "send_template": {
        const template = config.template_id ? await db.query.templates.findFirst({ where: eq(templates.id, config.template_id) }) : null;
        if (!template) return { ok: false, error: "Choose a template for the \"Send a template\" action." };
        break;
      }
      case "change_stage":
        if (!isStageKey(stages, config.stage ?? "")) return { ok: false, error: "Choose a stage for the \"Move the client\" action." };
        break;
      case "set_property_status":
        if (!PROPERTY_STATUSES.some((s) => s.key === config.status)) return { ok: false, error: "Choose a status for the property." };
        break;
      case "link_property":
        if (config.status && !CLIENT_PROPERTY_STATUSES.some((s) => s.key === config.status)) return { ok: false, error: "Choose a valid interest status." };
        break;
      case "log_activity":
        if (config.activity_type && !ACTIVITY_TYPES.some((t) => t.key === config.activity_type)) return { ok: false, error: "Choose a valid activity type." };
        break;
      case "set_follow_up": {
        const days = Number(config.days ?? "1");
        if (!Number.isFinite(days) || days < 0 || days > 365) return { ok: false, error: "Follow-up days must be between 0 and 365." };
        break;
      }
      case "webhook":
        if (!/^https?:\/\/\S+$/.test(config.url ?? "")) return { ok: false, error: "Enter a full webhook URL starting with http:// or https://." };
        break;
      default:
        break;
    }
    actions.push({ type: action.type as WorkflowAction["type"], config });
  }

  const values = {
    name: parsed.data.name,
    description: parsed.data.description || null,
    trigger: parsed.data.trigger,
    matchMode: parsed.data.matchMode,
    conditions,
    actions,
    enabled: formBoolean(formData, "enabled"),
    updatedAt: new Date(),
  };
  if (id) {
    await db.update(workflows).set(values).where(eq(workflows.id, id));
  } else {
    const existing = await db.select({ position: workflows.position }).from(workflows);
    const position = existing.length > 0 ? Math.max(...existing.map((r) => r.position)) + 1 : 0;
    await db.insert(workflows).values({ ...values, position });
  }
  revalidate();
  return { ok: true, data: { saved: true } };
}

export async function toggleWorkflowAction(id: string, enabled: boolean): Promise<void> {
  await requireSession();
  await db.update(workflows).set({ enabled, updatedAt: new Date() }).where(eq(workflows.id, id));
  revalidate();
}

export async function deleteWorkflowAction(id: string): Promise<void> {
  await requireSession();
  await db.delete(workflows).where(eq(workflows.id, id));
  revalidate();
}

export async function moveWorkflowAction(id: string, direction: "up" | "down"): Promise<void> {
  await requireSession();
  const list = await db.query.workflows.findMany({ orderBy: [asc(workflows.position), asc(workflows.createdAt)] });
  const index = list.findIndex((w) => w.id === id);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swapWith < 0 || swapWith >= list.length) return;
  const reordered = [...list];
  [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];
  await Promise.all(reordered.map((w, position) => db.update(workflows).set({ position }).where(eq(workflows.id, w.id))));
  revalidate();
}

/** Runs a property-based workflow against one property now, so it can be tried without adding a listing. */
export async function runWorkflowForPropertyAction(workflowId: string, propertyId: string): Promise<ActionResult> {
  await requireSession();
  const workflow = await db.query.workflows.findFirst({ where: eq(workflows.id, workflowId) });
  if (!workflow) return { ok: false, error: "Workflow not found" };
  const trigger = triggerDef(workflow.trigger);
  if (!trigger || !trigger.subjects.includes("property") || trigger.subjects.includes("link")) return { ok: false, error: "Only property workflows can be run this way." };
  const { getProperty } = await import("@/lib/queries/properties");
  const property = await getProperty(propertyId);
  if (!property) return { ok: false, error: "Property not found" };
  const { runWorkflowNow } = await import("@/lib/workflows/engine");
  const { matched } = await runWorkflowNow(workflow, { trigger: workflow.trigger as TriggerKey, property, extra: { previous_status: property.status, manual: true } });
  revalidate();
  revalidatePath("/drafts");
  revalidatePath("/", "layout");
  if (!matched) return { ok: false, error: "The workflow's conditions did not match this property, so nothing ran." };
  return { ok: true };
}
