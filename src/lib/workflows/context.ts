import type { Client, ClientProperty, Message, Property, Settings } from "@/lib/db/schema";
import { formatCurrency } from "@/lib/format";
import { stageLabel, type Stage } from "@/lib/pipeline";
import type { MatchMode, OperatorKey, TriggerKey, WorkflowCondition } from "./types";

/** Everything the engine knows about the thing that happened. */
export type WorkflowEvent = {
  trigger: TriggerKey;
  client?: Client | null;
  property?: Property | null;
  message?: Message | null;
  link?: ClientProperty | null;
  /** Who the message is with, when there is no client record. */
  contact?: { name: string | null; address: string } | null;
  /** Trigger-specific extras: previous_stage, previous_status, activity_type, is_new_contact, safe_to_reply… */
  extra?: Record<string, string | number | boolean | null>;
  /** Stops the same time-based event running twice. */
  dedupeKey?: string;
  /** How many workflow actions led to this event; stops runaway chains. */
  depth?: number;
};

export type WorkflowContext = Record<string, string | number | boolean | null>;

function days(since: Date | null | undefined): number | null {
  if (!since) return null;
  return Math.floor((Date.now() - since.getTime()) / 86_400_000);
}

/** Flattens the event into dotted keys that conditions and placeholders use. */
export function buildContext(event: WorkflowEvent, settings: Settings, stages: Stage[], workflowName: string): WorkflowContext {
  const ctx: WorkflowContext = {
    "workflow.name": workflowName,
    "event.trigger": event.trigger,
    "agent.name": settings.agentName,
    "agent.agency": settings.agencyName,
    "agent.phone": settings.agentPhone,
    "matches.count": 0,
  };
  for (const [key, value] of Object.entries(event.extra ?? {})) ctx[`event.${key}`] = value;
  if (typeof ctx["event.previous_stage"] === "string") ctx["event.previous_stage_label"] = stageLabel(stages, ctx["event.previous_stage"]);

  const client = event.client ?? null;
  ctx["client.is_client"] = Boolean(client);
  if (client) {
    ctx["client.id"] = client.id;
    ctx["client.first_name"] = client.firstName;
    ctx["client.last_name"] = client.lastName;
    ctx["client.full_name"] = `${client.firstName} ${client.lastName}`.trim();
    ctx["client.stage"] = client.stage;
    ctx["client.stage_label"] = stageLabel(stages, client.stage);
    ctx["client.client_type"] = client.clientType;
    ctx["client.source"] = client.source;
    ctx["client.budget_min"] = client.budgetMin;
    ctx["client.budget_max"] = client.budgetMax;
    ctx["client.preferred_areas"] = client.preferredAreas;
    ctx["client.requirements"] = client.requirements;
    ctx["client.notes"] = client.notes;
    ctx["client.email"] = client.email;
    ctx["client.phone"] = client.phone;
    ctx["client.has_email"] = Boolean(client.email || client.alternateEmail);
    ctx["client.has_phone"] = Boolean(client.phone || client.alternatePhone);
    ctx["client.days_since_contact"] = days(client.lastContactAt ?? client.createdAt);
    ctx["client.days_in_stage"] = days(client.stageChangedAt);
  } else if (event.contact) {
    ctx["client.full_name"] = event.contact.name ?? event.contact.address;
    ctx["client.first_name"] = (event.contact.name ?? "").split(" ")[0] || "there";
  }

  const property = event.property ?? null;
  if (property) {
    ctx["property.id"] = property.id;
    ctx["property.title"] = property.title;
    ctx["property.reference"] = property.reference;
    ctx["property.status"] = property.status;
    ctx["property.listing_type"] = property.listingType;
    ctx["property.property_type"] = property.propertyType;
    ctx["property.price"] = property.price;
    ctx["property.price_formatted"] = property.price === null ? "" : formatCurrency(property.price, settings.currency);
    ctx["property.suburb"] = property.suburb;
    ctx["property.city"] = property.city;
    ctx["property.bedrooms"] = property.bedrooms;
    ctx["property.bathrooms"] = property.bathrooms;
    ctx["property.features"] = property.features;
    ctx["property.url"] = property.listingUrl;
  }

  const message = event.message ?? null;
  if (message) {
    ctx["message.id"] = message.id;
    ctx["message.channel"] = message.channel;
    ctx["message.direction"] = message.direction;
    ctx["message.subject"] = message.subject;
    ctx["message.body"] = message.bodyText ?? message.snippet;
    ctx["message.snippet"] = message.snippet;
    ctx["message.has_attachments"] = Boolean(message.attachments && message.attachments.length > 0) || Boolean(message.media);
    ctx["contact.name"] = message.contactName ?? (client ? `${client.firstName} ${client.lastName}`.trim() : null);
    ctx["contact.address"] = message.contactAddress;
    ctx["contact.is_client"] = Boolean(client);
    if (ctx["message.is_new_contact"] === undefined) ctx["message.is_new_contact"] = Boolean(event.extra?.is_new_contact);
    if (ctx["message.is_automated"] === undefined) ctx["message.is_automated"] = event.extra?.safe_to_reply === false;
  } else if (event.contact) {
    ctx["contact.name"] = event.contact.name;
    ctx["contact.address"] = event.contact.address;
    ctx["contact.is_client"] = Boolean(client);
  }

  const link = event.link ?? null;
  if (link) {
    ctx["link.status"] = link.status;
    ctx["link.notes"] = link.notes;
    if (ctx["link.previous_status"] === undefined) ctx["link.previous_status"] = (event.extra?.previous_status as string | undefined) ?? null;
  }
  return ctx;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).toLowerCase().trim();
}

function asBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const text = asText(value);
  return text === "true" || text === "yes" || text === "1";
}

export function evaluateCondition(condition: WorkflowCondition, ctx: WorkflowContext): boolean {
  const actual = ctx[condition.field];
  const expected = condition.value ?? "";
  const op: OperatorKey = condition.op;
  switch (op) {
    case "empty":
      return actual === null || actual === undefined || asText(actual) === "";
    case "not_empty":
      return !(actual === null || actual === undefined || asText(actual) === "");
    case "eq":
      if (typeof actual === "boolean") return actual === asBool(expected);
      if (typeof actual === "number") return asNumber(expected) === actual;
      return asText(actual) === asText(expected);
    case "neq":
      if (typeof actual === "boolean") return actual !== asBool(expected);
      if (typeof actual === "number") return asNumber(expected) !== actual;
      return asText(actual) !== asText(expected);
    case "contains":
      return asText(expected) !== "" && asText(actual).includes(asText(expected));
    case "not_contains":
      return !asText(actual).includes(asText(expected));
    case "in": {
      const options = expected
        .split(",")
        .map((v) => asText(v))
        .filter(Boolean);
      return options.includes(asText(actual));
    }
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const a = asNumber(actual);
      const b = asNumber(expected);
      if (a === null || b === null) return false;
      if (op === "gt") return a > b;
      if (op === "gte") return a >= b;
      if (op === "lt") return a < b;
      return a <= b;
    }
    default:
      return false;
  }
}

export function conditionsMatch(conditions: WorkflowCondition[], mode: MatchMode, ctx: WorkflowContext): boolean {
  const usable = conditions.filter((c) => c.field);
  if (usable.length === 0) return true;
  return mode === "any" ? usable.some((c) => evaluateCondition(c, ctx)) : usable.every((c) => evaluateCondition(c, ctx));
}

/** Replaces {{dotted.keys}} with context values. Unknown keys become empty strings. */
export function renderContextTemplate(template: string, ctx: WorkflowContext): string {
  return template.replace(/\{\{\s*([a-z0-9_.]+)\s*\}\}/gi, (_, key: string) => {
    const value = ctx[key];
    if (value === null || value === undefined) return "";
    return String(value);
  });
}

/** One-line description of what an event was about, for the run log. */
export function describeEvent(event: WorkflowEvent, ctx: WorkflowContext): string {
  if (event.trigger.startsWith("property.") && event.property) {
    const who = event.client ? ` for ${ctx["client.full_name"]}` : "";
    return `${event.property.title}${who}`;
  }
  if (event.trigger.startsWith("message.") && event.message) {
    const who = ctx["contact.name"] || ctx["contact.address"];
    return `${event.message.channel === "email" ? "Email" : "WhatsApp"} ${event.message.direction === "inbound" ? "from" : "to"} ${who}${event.message.subject ? `: ${event.message.subject}` : ""}`;
  }
  if (event.client) return String(ctx["client.full_name"]);
  return event.trigger;
}
