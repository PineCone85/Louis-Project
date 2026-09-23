"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { CLIENT_PROPERTY_STATUSES, CLIENT_TYPES, ACTIVITY_TYPES } from "@/lib/constants";
import { db } from "@/lib/db";
import { activities, clientProperties, clients, properties } from "@/lib/db/schema";
import { normalizeEmail } from "@/lib/email-address";
import { parseDateTimeLocal } from "@/lib/format";
import { logActivity } from "@/lib/messaging/activity";
import { relinkMessagesForClient } from "@/lib/messaging/ingest";
import { normalizePhone } from "@/lib/phone";
import { defaultStageKey, isStageKey, stageLabel, type Stage } from "@/lib/pipeline";
import { getSettings, stagesFrom } from "@/lib/queries/settings";
import { dispatchWorkflowEvent } from "@/lib/workflows/engine";
import { fieldErrorsFrom, formNumber, formOptional, formString, type ActionResult } from "@/lib/validation";

const clientSchema = (stages: Stage[]) =>
  z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().max(100),
  clientType: z.enum(CLIENT_TYPES.map((t) => t.key) as [string, ...string[]]),
  stage: z.string().refine((value) => isStageKey(stages, value), "Choose a pipeline stage"),
  source: z.string().trim().max(100).nullable(),
  budgetMin: z.number().int().min(0).nullable(),
  budgetMax: z.number().int().min(0).nullable(),
  preferredAreas: z.string().trim().max(2000).nullable(),
  requirements: z.string().trim().max(5000).nullable(),
  notes: z.string().trim().max(10000).nullable(),
});

function revalidateClient(id?: string) {
  revalidatePath("/");
  revalidatePath("/clients");
  revalidatePath("/pipeline");
  revalidatePath("/inbox");
  if (id) revalidatePath(`/clients/${id}`);
}

export async function saveClientAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireSession();
  const settings = await getSettings();
  const stages = stagesFrom(settings);
  const id = formOptional(formData, "id");

  const parsed = clientSchema(stages).safeParse({
    firstName: formString(formData, "firstName"),
    lastName: formString(formData, "lastName"),
    clientType: formString(formData, "clientType") || "buyer",
    stage: formString(formData, "stage") || defaultStageKey(stages),
    source: formOptional(formData, "source"),
    budgetMin: formNumber(formData, "budgetMin"),
    budgetMax: formNumber(formData, "budgetMax"),
    preferredAreas: formOptional(formData, "preferredAreas"),
    requirements: formOptional(formData, "requirements"),
    notes: formOptional(formData, "notes"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const fieldErrors: Record<string, string> = {};
  const emailRaw = formOptional(formData, "email");
  const email = emailRaw ? normalizeEmail(emailRaw) : null;
  if (emailRaw && !email) fieldErrors.email = "Enter a valid email address";
  const altEmailRaw = formOptional(formData, "alternateEmail");
  const alternateEmail = altEmailRaw ? normalizeEmail(altEmailRaw) : null;
  if (altEmailRaw && !alternateEmail) fieldErrors.alternateEmail = "Enter a valid email address";
  const phoneRaw = formOptional(formData, "phone");
  const phone = phoneRaw ? normalizePhone(phoneRaw, settings.defaultCountry) : null;
  if (phoneRaw && !phone) fieldErrors.phone = "Enter a valid phone number, including the area code";
  const altPhoneRaw = formOptional(formData, "alternatePhone");
  const alternatePhone = altPhoneRaw ? normalizePhone(altPhoneRaw, settings.defaultCountry) : null;
  if (altPhoneRaw && !alternatePhone) fieldErrors.alternatePhone = "Enter a valid phone number";
  if (parsed.data.budgetMin !== null && parsed.data.budgetMax !== null && parsed.data.budgetMin > parsed.data.budgetMax) {
    fieldErrors.budgetMax = "Maximum budget must be at least the minimum";
  }
  const followUpRaw = formOptional(formData, "nextFollowUpAt");
  const nextFollowUpAt = followUpRaw ? parseDateTimeLocal(followUpRaw, settings.timezone) : null;
  if (followUpRaw && !nextFollowUpAt) fieldErrors.nextFollowUpAt = "Enter a valid date and time";
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  const values = {
    ...parsed.data,
    email,
    alternateEmail,
    phone,
    alternatePhone,
    nextFollowUpAt,
    updatedAt: new Date(),
  };

  if (id) {
    const existing = await db.query.clients.findFirst({ where: eq(clients.id, id) });
    if (!existing) return { ok: false, error: "Client not found" };
    const stageChanged = existing.stage !== values.stage;
    const [updated] = await db
      .update(clients)
      .set({ ...values, ...(stageChanged ? { stageChangedAt: new Date() } : {}) })
      .where(eq(clients.id, id))
      .returning();
    if (stageChanged) {
      await logActivity({
        clientId: id,
        type: "stage_changed",
        title: `Moved to ${stageLabel(stages, values.stage)}`,
        body: `From ${stageLabel(stages, existing.stage)}`,
        metadata: { from: existing.stage, to: values.stage },
      });
      await dispatchWorkflowEvent({ trigger: "client.stage_changed", client: updated, extra: { previous_stage: existing.stage } });
    }
    await relinkMessagesForClient(updated);
    revalidateClient(id);
    redirect(`/clients/${id}`);
  }

  const [created] = await db.insert(clients).values(values).returning();
  await logActivity({ clientId: created.id, type: "client_created", title: "Client added" });
  await dispatchWorkflowEvent({ trigger: "client.created", client: created });
  const linked = await relinkMessagesForClient(created);
  if (linked > 0) {
    await logActivity({
      clientId: created.id,
      type: "messages_linked",
      title: `${linked} earlier message${linked === 1 ? "" : "s"} linked to this client`,
    });
  }
  revalidateClient(created.id);
  redirect(`/clients/${created.id}`);
}

export async function changeStageAction(clientId: string, stage: string): Promise<ActionResult> {
  await requireSession();
  const stages = stagesFrom(await getSettings());
  if (!isStageKey(stages, stage)) return { ok: false, error: "Unknown stage" };
  const existing = await db.query.clients.findFirst({ where: eq(clients.id, clientId) });
  if (!existing) return { ok: false, error: "Client not found" };
  if (existing.stage === stage) return { ok: true };
  const [updated] = await db
    .update(clients)
    .set({ stage, stageChangedAt: new Date(), updatedAt: new Date() })
    .where(eq(clients.id, clientId))
    .returning();
  await logActivity({
    clientId,
    type: "stage_changed",
    title: `Moved to ${stageLabel(stages, stage)}`,
    body: `From ${stageLabel(stages, existing.stage)}`,
    metadata: { from: existing.stage, to: stage },
  });
  await dispatchWorkflowEvent({ trigger: "client.stage_changed", client: updated, extra: { previous_stage: existing.stage } });
  revalidateClient(clientId);
  return { ok: true };
}

export async function setFollowUpAction(clientId: string, value: string | null): Promise<ActionResult> {
  await requireSession();
  const settings = await getSettings();
  const date = value ? parseDateTimeLocal(value, settings.timezone) : null;
  if (value && !date) return { ok: false, error: "Enter a valid date" };
  await db.update(clients).set({ nextFollowUpAt: date, updatedAt: new Date() }).where(eq(clients.id, clientId));
  if (date) {
    await logActivity({ clientId, type: "follow_up_set", title: "Follow-up scheduled", metadata: { at: date.toISOString() } });
  }
  revalidateClient(clientId);
  return { ok: true };
}

export async function archiveClientAction(clientId: string, archive: boolean): Promise<void> {
  await requireSession();
  await db
    .update(clients)
    .set({ archivedAt: archive ? new Date() : null, updatedAt: new Date() })
    .where(eq(clients.id, clientId));
  revalidateClient(clientId);
  redirect(archive ? "/clients" : `/clients/${clientId}`);
}

export async function deleteClientAction(clientId: string): Promise<void> {
  await requireSession();
  await db.delete(clients).where(eq(clients.id, clientId));
  revalidateClient();
  redirect("/clients");
}

const activitySchema = z.object({
  type: z.enum(ACTIVITY_TYPES.map((t) => t.key) as [string, ...string[]]),
  body: z.string().trim().min(1, "Write something first").max(10000),
});

export async function addActivityAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireSession();
  const clientId = formString(formData, "clientId");
  const parsed = activitySchema.safeParse({ type: formString(formData, "type") || "note", body: formString(formData, "body") });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  const label = ACTIVITY_TYPES.find((t) => t.key === parsed.data.type)?.label ?? "Note";
  await db.insert(activities).values({
    clientId,
    type: parsed.data.type,
    title: parsed.data.type === "note" ? "Note" : `${label} logged`,
    body: parsed.data.body,
  });
  const [client] = await db.update(clients).set({ lastContactAt: parsed.data.type === "note" ? undefined : new Date() }).where(eq(clients.id, clientId)).returning();
  if (client) await dispatchWorkflowEvent({ trigger: "client.activity_logged", client, extra: { activity_type: parsed.data.type, activity_body: parsed.data.body } });
  revalidateClient(clientId);
  return { ok: true };
}

export async function deleteActivityAction(activityId: string, clientId: string): Promise<void> {
  await requireSession();
  await db.delete(activities).where(and(eq(activities.id, activityId), eq(activities.clientId, clientId)));
  revalidateClient(clientId);
}

const linkSchema = z.object({
  clientId: z.string().uuid(),
  propertyId: z.string().uuid("Choose a property"),
  status: z.enum(CLIENT_PROPERTY_STATUSES.map((s) => s.key) as [string, ...string[]]),
  notes: z.string().trim().max(2000).nullable(),
});

export async function linkPropertyAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireSession();
  const parsed = linkSchema.safeParse({
    clientId: formString(formData, "clientId"),
    propertyId: formString(formData, "propertyId"),
    status: formString(formData, "status") || "suggested",
    notes: formOptional(formData, "notes"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  const settings = await getSettings();
  const viewingRaw = formOptional(formData, "viewingAt");
  const viewingAt = viewingRaw ? parseDateTimeLocal(viewingRaw, settings.timezone) : null;

  const property = await db.query.properties.findFirst({ where: eq(properties.id, parsed.data.propertyId) });
  if (!property) return { ok: false, error: "Property not found" };

  const [link] = await db
    .insert(clientProperties)
    .values({ ...parsed.data, viewingAt })
    .onConflictDoUpdate({
      target: [clientProperties.clientId, clientProperties.propertyId],
      set: { status: parsed.data.status, notes: parsed.data.notes, viewingAt, updatedAt: new Date() },
    })
    .returning();
  await logActivity({
    clientId: parsed.data.clientId,
    type: "property_linked",
    title: `Property linked: ${property.title}`,
    body: CLIENT_PROPERTY_STATUSES.find((s) => s.key === parsed.data.status)?.label,
    metadata: { propertyId: property.id, status: parsed.data.status },
  });
  const linkedClient = await db.query.clients.findFirst({ where: eq(clients.id, parsed.data.clientId) });
  if (linkedClient && link) await dispatchWorkflowEvent({ trigger: "property.linked", client: linkedClient, property, link });
  revalidateClient(parsed.data.clientId);
  revalidatePath(`/properties/${property.id}`);
  revalidatePath("/properties");
  return { ok: true };
}

export async function updateClientPropertyAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireSession();
  const parsed = linkSchema.safeParse({
    clientId: formString(formData, "clientId"),
    propertyId: formString(formData, "propertyId"),
    status: formString(formData, "status"),
    notes: formOptional(formData, "notes"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  const settings = await getSettings();
  const viewingRaw = formOptional(formData, "viewingAt");
  const viewingAt = viewingRaw ? parseDateTimeLocal(viewingRaw, settings.timezone) : null;
  const existing = await db.query.clientProperties.findFirst({
    where: and(eq(clientProperties.clientId, parsed.data.clientId), eq(clientProperties.propertyId, parsed.data.propertyId)),
  });
  if (!existing) return { ok: false, error: "Link not found" };
  await db
    .update(clientProperties)
    .set({ status: parsed.data.status, notes: parsed.data.notes, viewingAt, updatedAt: new Date() })
    .where(and(eq(clientProperties.clientId, parsed.data.clientId), eq(clientProperties.propertyId, parsed.data.propertyId)));
  if (existing.status !== parsed.data.status) {
    const property = await db.query.properties.findFirst({ where: eq(properties.id, parsed.data.propertyId) });
    await logActivity({
      clientId: parsed.data.clientId,
      type: "property_status",
      title: `${property?.title ?? "Property"}: ${CLIENT_PROPERTY_STATUSES.find((s) => s.key === parsed.data.status)?.label ?? parsed.data.status}`,
      metadata: { propertyId: parsed.data.propertyId, from: existing.status, to: parsed.data.status },
    });
    const client = await db.query.clients.findFirst({ where: eq(clients.id, parsed.data.clientId) });
    if (client && property) {
      await dispatchWorkflowEvent({
        trigger: "property.link_status_changed",
        client,
        property,
        link: { ...existing, status: parsed.data.status, notes: parsed.data.notes, viewingAt },
        extra: { previous_status: existing.status },
      });
    }
  }
  revalidateClient(parsed.data.clientId);
  revalidatePath(`/properties/${parsed.data.propertyId}`);
  return { ok: true };
}

export async function unlinkPropertyAction(clientId: string, propertyId: string): Promise<void> {
  await requireSession();
  const property = await db.query.properties.findFirst({ where: eq(properties.id, propertyId) });
  await db.delete(clientProperties).where(and(eq(clientProperties.clientId, clientId), eq(clientProperties.propertyId, propertyId)));
  if (property) {
    await logActivity({ clientId, type: "property_unlinked", title: `Property removed: ${property.title}`, metadata: { propertyId } });
  }
  revalidateClient(clientId);
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/properties");
}
