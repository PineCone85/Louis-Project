import { createHmac } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { renderTemplate } from "@/lib/auto-reply/render";
import { ACTIVITY_TYPES, PROPERTY_STATUSES } from "@/lib/constants";
import { db } from "@/lib/db";
import {
  clientProperties,
  clients,
  messageDrafts,
  properties,
  templates,
  workflowRuns,
  workflows,
  type Client,
  type Settings,
  type Workflow,
} from "@/lib/db/schema";
import { parseDateTimeLocal, zonedParts } from "@/lib/format";
import { logActivity } from "@/lib/messaging/activity";
import { createNotification } from "@/lib/messaging/notifications";
import { activeStageKeys, isStageKey, stageLabel, type Stage } from "@/lib/pipeline";
import { getSettings, stagesFrom } from "@/lib/queries/settings";
import { buildContext, conditionsMatch, describeEvent, renderContextTemplate, type WorkflowContext, type WorkflowEvent } from "./context";
import { findLinkedClients, findMatchingClients, type ClientMatch } from "./matching";
import { actionDef, triggerDef, type MatchMode, type WorkflowAction, type WorkflowStep } from "./types";

const MAX_DEPTH = 3;

/**
 * Entry point used by server actions, message ingest and the send helpers.
 * Runs after the response has been sent where the runtime allows it, so a
 * slow action (AI drafting for several clients) never delays the page.
 */
export async function dispatchWorkflowEvent(event: WorkflowEvent): Promise<void> {
  const task = async () => {
    try {
      await runWorkflowsForEvent(event);
    } catch (error) {
      console.error(`[workflows] ${event.trigger} failed:`, error);
    }
  };
  try {
    after(task);
  } catch {
    await task();
  }
}

/** Evaluates every enabled workflow for the trigger, in order. Safe to call directly. */
export async function runWorkflowsForEvent(event: WorkflowEvent): Promise<void> {
  if ((event.depth ?? 0) >= MAX_DEPTH) return;
  const list = await db.query.workflows.findMany({
    where: and(eq(workflows.trigger, event.trigger), eq(workflows.enabled, true)),
    orderBy: [asc(workflows.position), asc(workflows.createdAt)],
  });
  if (list.length === 0) return;

  const settings = await getSettings();
  const stages = stagesFrom(settings);
  let ranAny = false;
  for (const workflow of list) {
    if (event.dedupeKey) {
      const already = await db.query.workflowRuns.findFirst({
        where: and(eq(workflowRuns.workflowId, workflow.id), eq(workflowRuns.dedupeKey, event.dedupeKey)),
        columns: { id: true },
      });
      if (already) continue;
    }
    const ctx = buildContext(event, settings, stages, workflow.name);
    if (!conditionsMatch(workflow.conditions, workflow.matchMode as MatchMode, ctx)) continue;
    await runWorkflow(workflow, event, ctx, settings, stages);
    ranAny = true;
  }
  if (ranAny) {
    try {
      revalidatePath("/", "layout");
    } catch {
      // Outside a request (tests, scripts): nothing to revalidate.
    }
  }
}

/** Runs one workflow for an event right now (used by the "Run now" button). Returns whether the conditions matched. */
export async function runWorkflowNow(workflow: Workflow, event: WorkflowEvent): Promise<{ matched: boolean }> {
  const settings = await getSettings();
  const stages = stagesFrom(settings);
  const ctx = buildContext(event, settings, stages, workflow.name);
  if (!conditionsMatch(workflow.conditions, workflow.matchMode as MatchMode, ctx)) return { matched: false };
  await runWorkflow(workflow, event, ctx, settings, stages);
  return { matched: true };
}

type Env = {
  workflow: Workflow;
  event: WorkflowEvent;
  ctx: WorkflowContext;
  settings: Settings;
  stages: Stage[];
  /** Matches found by an earlier action, reused by later ones. */
  matches: ClientMatch[] | null;
};

async function runWorkflow(workflow: Workflow, event: WorkflowEvent, ctx: WorkflowContext, settings: Settings, stages: Stage[]): Promise<void> {
  const env: Env = { workflow, event, ctx, settings, stages, matches: null };
  const steps: WorkflowStep[] = [];
  for (const action of workflow.actions) {
    if (!actionDef(action.type)) {
      steps.push({ action: action.type, status: "skipped", detail: "Unknown action" });
      continue;
    }
    try {
      steps.push(await runAction(action, env));
    } catch (error) {
      steps.push({ action: action.type, status: "failed", detail: error instanceof Error ? error.message : String(error) });
    }
  }
  const failed = steps.some((s) => s.status === "failed");
  await db
    .insert(workflowRuns)
    .values({
      workflowId: workflow.id,
      trigger: event.trigger,
      status: failed ? "failed" : "completed",
      subject: describeEvent(event, ctx).slice(0, 200),
      dedupeKey: event.dedupeKey ?? null,
      steps,
      error: failed ? steps.filter((s) => s.status === "failed").map((s) => s.detail).join("; ").slice(0, 1000) : null,
    })
    .onConflictDoNothing();
  await db
    .update(workflows)
    .set({ timesTriggered: workflow.timesTriggered + 1, lastTriggeredAt: new Date() })
    .where(eq(workflows.id, workflow.id));
}

// ---------------------------------------------------------------------------
// Targets and channels
// ---------------------------------------------------------------------------

type Target = { client: Client | null; contactName: string | null; contactAddress: string | null; reasons: string[] };

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && value !== undefined && value !== "" ? n : fallback;
}

async function resolveTargets(target: string, env: Env, config: Record<string, string>): Promise<Target[]> {
  const { event } = env;
  if (target === "matching_clients" || target === "linked_clients") {
    if (!event.property) return [];
    if (!env.matches) {
      if (target === "linked_clients") {
        env.matches = await findLinkedClients(event.property.id, num(config.max_clients, 25));
      } else {
        const stageFilter = (config.stages ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter((s) => isStageKey(env.stages, s));
        env.matches = await findMatchingClients(event.property, {
          stages: stageFilter.length > 0 ? stageFilter : activeStageKeys(env.stages),
          limit: num(config.max_clients, 10),
          minScore: num(config.min_score, 3),
        });
      }
      env.ctx["matches.count"] = env.matches.length;
    }
    return env.matches.map((m) => ({ client: m.client, contactName: null, contactAddress: null, reasons: m.reasons }));
  }
  // event_client
  if (event.client) return [{ client: event.client, contactName: null, contactAddress: null, reasons: [] }];
  const address = event.message?.contactAddress ?? event.contact?.address ?? null;
  if (!address) return [];
  return [{ client: null, contactName: event.message?.contactName ?? event.contact?.name ?? null, contactAddress: address, reasons: [] }];
}

type Route = { channel: "email" | "whatsapp"; address: string; name: string | null };

/** Picks how to reach a target: the message's own channel, or the client's email/phone. */
function routeFor(choice: string, target: Target, env: Env): Route | null {
  const { message } = env.event;
  const name = target.client ? `${target.client.firstName} ${target.client.lastName}`.trim() : target.contactName;
  if (message && !target.client && target.contactAddress) {
    return message.channel === "email" || message.channel === "whatsapp" ? { channel: message.channel, address: target.contactAddress, name } : null;
  }
  const client = target.client;
  const email = client?.email ?? client?.alternateEmail ?? null;
  const phone = client?.phone ?? client?.alternatePhone ?? null;
  if (choice === "email") return email ? { channel: "email", address: email, name } : null;
  if (choice === "whatsapp") return phone ? { channel: "whatsapp", address: phone, name } : null;
  if (message && message.clientId === client?.id && (message.channel === "email" || message.channel === "whatsapp")) {
    return { channel: message.channel, address: message.contactAddress, name };
  }
  if (email) return { channel: "email", address: email, name };
  if (phone) return { channel: "whatsapp", address: phone, name };
  return null;
}

function defaultPurpose(env: Env): string {
  const { trigger } = env.event;
  const property = env.event.property;
  if (trigger === "property.status_changed" && property) return `Let them know ${property.title} is now ${property.status.replace(/_/g, " ")} and offer alternatives.`;
  if (property) return "Introduce this listing, explain briefly why it fits, and offer a viewing.";
  if (trigger === "client.follow_up_due") return "Check in ahead of the scheduled follow-up and ask what would help next.";
  if (trigger === "client.inactive") return "Re-engage after a quiet spell without pressure, and ask whether their plans have changed.";
  if (trigger === "client.stage_changed") return `Acknowledge that things have moved to ${env.ctx["client.stage_label"]} and set out the next step.`;
  if (trigger === "client.created") return "Welcome them, confirm what they are looking for, and propose a first call or viewing.";
  return "Follow up and propose a clear next step.";
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function runAction(action: WorkflowAction, env: Env): Promise<WorkflowStep> {
  const config = action.config ?? {};
  const { event, ctx, workflow } = env;
  const render = (text: string | undefined, fallback = "") => renderContextTemplate(text?.trim() ? text : fallback, ctx);

  switch (action.type) {
    case "ai_draft": {
      const targetKind = config.target || (event.property && !event.client ? "matching_clients" : "event_client");
      const targets = await resolveTargets(targetKind, env, config);
      if (targets.length === 0) return { action: action.type, status: "skipped", detail: targetKind === "event_client" ? "No client or contact to write to" : "No clients matched" };
      const { draftReply } = await import("@/lib/ai/draft");
      const { draftOutreach } = await import("@/lib/ai/outreach");
      const created: string[] = [];
      const skipped: string[] = [];
      const errors: string[] = [];
      for (const target of targets.slice(0, num(config.max_clients, 10))) {
        const route = routeFor(config.channel || "preferred", target, env);
        const label = route?.name ?? target.contactAddress ?? "contact";
        if (!route) {
          skipped.push(label);
          continue;
        }
        try {
          const replying = Boolean(event.message && event.message.direction === "inbound" && targetKind === "event_client");
          const draft = replying
            ? await draftReply({ channel: route.channel, contactAddress: route.address, clientId: target.client?.id ?? null, instruction: config.instruction })
            : await draftOutreach({
                client: target.client,
                contactName: target.contactName,
                property: event.property ?? null,
                channel: route.channel,
                purpose: config.instruction?.trim() || defaultPurpose(env),
                reasons: target.reasons,
                instruction: null,
              });
          await db.insert(messageDrafts).values({
            clientId: target.client?.id ?? null,
            propertyId: event.property?.id ?? null,
            workflowId: workflow.id,
            channel: route.channel,
            contactAddress: route.address,
            contactName: route.name,
            threadId: replying && event.message?.channel === "email" ? event.message.threadId : null,
            subject: draft.subject || null,
            body: draft.body,
            notes: draft.notes || null,
            reason: target.reasons.length > 0 ? target.reasons.join(", ") : `${workflow.name}: ${describeEvent(event, ctx)}`.slice(0, 300),
          });
          created.push(label);
        } catch (error) {
          errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (created.length > 0) {
        await createNotification({
          type: "workflow_drafts",
          clientId: created.length === 1 ? (targets[0]?.client?.id ?? null) : null,
          title: `${workflow.name}: ${created.length} draft${created.length === 1 ? "" : "s"} ready to review`,
          body: `${created.slice(0, 4).join(", ")}${created.length > 4 ? ` and ${created.length - 4} more` : ""}. Open Drafts to edit and send.`,
        });
      }
      const detail = [
        created.length > 0 ? `Drafted for ${created.join(", ")}` : null,
        skipped.length > 0 ? `No email or phone for ${skipped.join(", ")}` : null,
        errors.length > 0 ? `Failed: ${errors.join("; ")}` : null,
      ]
        .filter(Boolean)
        .join(". ");
      return { action: action.type, status: created.length > 0 ? "done" : errors.length > 0 ? "failed" : "skipped", detail: detail || "Nothing to draft" };
    }

    case "send_template": {
      const template = config.template_id ? await db.query.templates.findFirst({ where: eq(templates.id, config.template_id) }) : null;
      if (!template) return { action: action.type, status: "failed", detail: "Template not found" };
      if (event.extra?.safe_to_reply === false) return { action: action.type, status: "skipped", detail: "Sender looks automated" };
      const [target] = await resolveTargets("event_client", env, config);
      if (!target) return { action: action.type, status: "skipped", detail: "No client or contact to send to" };
      const route = routeFor(config.channel || "preferred", target, env);
      if (!route) return { action: action.type, status: "skipped", detail: "No email address or phone number" };
      if (template.channel !== "any" && template.channel !== route.channel) return { action: action.type, status: "skipped", detail: `Template is for ${template.channel}, contact reached by ${route.channel}` };
      const renderContext = {
        client: target.client ? { firstName: target.client.firstName, lastName: target.client.lastName } : null,
        contactName: route.name,
        settings: env.settings,
      };
      const body = renderTemplate(template.body, renderContext);
      if (route.channel === "email") {
        const { sendEmail } = await import("@/lib/gmail/send");
        const { withSignature } = await import("@/lib/auto-reply/render");
        const inbound = event.message && event.message.channel === "email" && event.message.direction === "inbound" ? event.message : null;
        const subject = template.subject
          ? renderTemplate(template.subject, renderContext)
          : inbound?.subject
            ? `Re: ${inbound.subject.replace(/^re:\s*/i, "")}`
            : render(config.subject, `Message from ${env.settings.agencyName || env.settings.agentName || "your agent"}`);
        await sendEmail({
          to: [{ name: route.name, address: route.address }],
          subject,
          text: withSignature(body, env.settings.emailSignature),
          clientId: target.client?.id ?? null,
          contactName: route.name,
          replyTo: inbound ? { threadId: inbound.threadId, messageIdHeader: inbound.messageIdHeader, references: inbound.referencesHeader } : null,
          isAutoReply: true,
        });
      } else {
        const { getWhatsAppWindow, sendWhatsAppText } = await import("@/lib/whatsapp/send");
        const window = await getWhatsAppWindow(route.address);
        if (!window.open) return { action: action.type, status: "skipped", detail: "Outside the 24-hour WhatsApp window" };
        await sendWhatsAppText({ toPhone: route.address, text: body, clientId: target.client?.id ?? null, contactName: route.name, isAutoReply: true });
      }
      return { action: action.type, status: "done", detail: `Sent "${template.name}" by ${route.channel} to ${route.name ?? route.address}` };
    }

    case "notify": {
      const title = render(config.title, `${workflow.name}: ${describeEvent(event, ctx)}`).slice(0, 200);
      const body = render(config.body, "").slice(0, 1000) || null;
      await createNotification({ type: "workflow", clientId: event.client?.id ?? null, messageId: event.message?.id ?? null, title, body });
      return { action: action.type, status: "done", detail: title };
    }

    case "log_activity": {
      if (!event.client) return { action: action.type, status: "skipped", detail: "No client in this event" };
      const type = ACTIVITY_TYPES.some((t) => t.key === config.activity_type) ? config.activity_type : "note";
      const label = ACTIVITY_TYPES.find((t) => t.key === type)?.label ?? "Note";
      const body = render(config.body, `Workflow "${workflow.name}" ran: ${describeEvent(event, ctx)}`);
      await logActivity({ clientId: event.client.id, type, title: type === "note" ? "Note" : `${label} logged`, body, metadata: { workflowId: workflow.id } });
      return { action: action.type, status: "done", detail: body.slice(0, 120) };
    }

    case "set_follow_up": {
      if (!event.client) return { action: action.type, status: "skipped", detail: "No client in this event" };
      const days = Math.max(0, Math.min(365, num(config.days, 1)));
      const time = /^\d{2}:\d{2}$/.test(config.time ?? "") ? config.time : "09:00";
      const p = zonedParts(new Date(Date.now() + days * 86_400_000), env.settings.timezone);
      const pad = (n: number) => String(n).padStart(2, "0");
      const date = parseDateTimeLocal(`${p.year}-${pad(p.month)}-${pad(p.day)}T${time}`, env.settings.timezone);
      if (!date) return { action: action.type, status: "failed", detail: "Could not compute the follow-up date" };
      if (config.only_if_empty === "true" && event.client.nextFollowUpAt && event.client.nextFollowUpAt > new Date()) {
        return { action: action.type, status: "skipped", detail: "A follow-up is already scheduled" };
      }
      await db.update(clients).set({ nextFollowUpAt: date, updatedAt: new Date() }).where(eq(clients.id, event.client.id));
      await logActivity({ clientId: event.client.id, type: "follow_up_set", title: "Follow-up scheduled", body: `By workflow "${workflow.name}"`, metadata: { at: date.toISOString(), workflowId: workflow.id } });
      return { action: action.type, status: "done", detail: `Follow-up set for ${date.toISOString().slice(0, 10)} ${time}` };
    }

    case "change_stage": {
      if (!event.client) return { action: action.type, status: "skipped", detail: "No client in this event" };
      const stage = config.stage ?? "";
      if (!isStageKey(env.stages, stage)) return { action: action.type, status: "failed", detail: `Unknown stage "${stage}"` };
      if (event.client.stage === stage) return { action: action.type, status: "skipped", detail: `Already in ${stageLabel(env.stages, stage)}` };
      const previous = event.client.stage;
      const [updated] = await db
        .update(clients)
        .set({ stage, stageChangedAt: new Date(), updatedAt: new Date() })
        .where(eq(clients.id, event.client.id))
        .returning();
      await logActivity({
        clientId: event.client.id,
        type: "stage_changed",
        title: `Moved to ${stageLabel(env.stages, stage)}`,
        body: `From ${stageLabel(env.stages, previous)}, by workflow "${workflow.name}"`,
        metadata: { from: previous, to: stage, workflowId: workflow.id },
      });
      if (updated) await runWorkflowsForEvent({ trigger: "client.stage_changed", client: updated, extra: { previous_stage: previous }, depth: (event.depth ?? 0) + 1 });
      return { action: action.type, status: "done", detail: `Moved to ${stageLabel(env.stages, stage)}` };
    }

    case "link_property": {
      if (!event.property) return { action: action.type, status: "skipped", detail: "No property in this event" };
      const targets = await resolveTargets(config.target === "linked_clients" ? "linked_clients" : "matching_clients", env, config);
      const status = config.status || "suggested";
      const linked: string[] = [];
      for (const target of targets) {
        if (!target.client) continue;
        const inserted = await db
          .insert(clientProperties)
          .values({ clientId: target.client.id, propertyId: event.property.id, status, notes: target.reasons.length > 0 ? `Matched by workflow: ${target.reasons.join(", ")}` : null })
          .onConflictDoNothing()
          .returning({ clientId: clientProperties.clientId });
        if (inserted.length === 0) continue;
        await logActivity({
          clientId: target.client.id,
          type: "property_linked",
          title: `Property linked: ${event.property.title}`,
          body: target.reasons.length > 0 ? `Suggested by workflow "${workflow.name}": ${target.reasons.join(", ")}` : `By workflow "${workflow.name}"`,
          metadata: { propertyId: event.property.id, status, workflowId: workflow.id },
        });
        linked.push(`${target.client.firstName} ${target.client.lastName}`.trim());
      }
      return { action: action.type, status: linked.length > 0 ? "done" : "skipped", detail: linked.length > 0 ? `Linked to ${linked.join(", ")}` : "No new clients to link" };
    }

    case "set_property_status": {
      if (!event.property) return { action: action.type, status: "skipped", detail: "No property in this event" };
      const status = config.status ?? "";
      if (!PROPERTY_STATUSES.some((s) => s.key === status)) return { action: action.type, status: "failed", detail: `Unknown status "${status}"` };
      if (event.property.status === status) return { action: action.type, status: "skipped", detail: `Already ${status}` };
      const previous = event.property.status;
      const [updated] = await db.update(properties).set({ status, updatedAt: new Date() }).where(eq(properties.id, event.property.id)).returning();
      if (updated) await runWorkflowsForEvent({ trigger: "property.status_changed", property: updated, extra: { previous_status: previous }, depth: (event.depth ?? 0) + 1 });
      return { action: action.type, status: "done", detail: `Property marked ${status.replace(/_/g, " ")}` };
    }

    case "webhook": {
      const url = config.url ?? "";
      if (!/^https?:\/\//.test(url)) return { action: action.type, status: "failed", detail: "Webhook URL must start with http:// or https://" };
      const payload = JSON.stringify({
        workflow: { id: workflow.id, name: workflow.name },
        trigger: event.trigger,
        at: new Date().toISOString(),
        context: ctx,
        client: event.client ? { id: event.client.id, firstName: event.client.firstName, lastName: event.client.lastName, email: event.client.email, phone: event.client.phone, stage: event.client.stage } : null,
        property: event.property ? { id: event.property.id, title: event.property.title, status: event.property.status, price: event.property.price, suburb: event.property.suburb } : null,
        message: event.message ? { id: event.message.id, channel: event.message.channel, direction: event.message.direction, subject: event.message.subject, snippet: event.message.snippet } : null,
      });
      const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "Foyer-Workflows/1.0" };
      if (config.secret) headers["x-foyer-signature"] = createHmac("sha256", config.secret).update(payload).digest("hex");
      const response = await fetch(url, { method: "POST", headers, body: payload, signal: AbortSignal.timeout(10_000) });
      return { action: action.type, status: response.ok ? "done" : "failed", detail: `HTTP ${response.status} from ${new URL(url).host}` };
    }

    default:
      return { action: action.type, status: "skipped", detail: "Unknown action" };
  }
}

/** Human summary of a trigger for logs and notifications. */
export function triggerLabel(trigger: string): string {
  return triggerDef(trigger)?.label ?? trigger;
}
