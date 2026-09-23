import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Client, Message, Property } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { getClient, getClientProperties } from "@/lib/queries/clients";
import { getConversationMessages } from "@/lib/queries/messages";
import { getSettings } from "@/lib/queries/settings";

/** Model used for drafting. Overridable so the operator can trade quality for cost. */
const MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5";

export const DraftSchema = z.object({
  subject: z.string().describe("Email subject line. Empty string for WhatsApp or when replying inside an existing thread."),
  body: z.string().describe("The reply text, ready to send. Plain text, no signature."),
  notes: z.string().describe("One or two short sentences for the agent: anything they should verify or fill in before sending. Empty if nothing."),
});

export type Draft = z.infer<typeof DraftSchema>;

export type DraftRequest = {
  channel: "email" | "whatsapp";
  contactAddress: string;
  clientId: string | null;
  /** Optional instruction from the agent, e.g. "tell them the viewing is Saturday at 10". */
  instruction?: string | null;
};

export class DraftError extends Error {}

const MAX_MESSAGES = 20;
const MAX_BODY_CHARS = 4000;

function messageText(message: Message): string {
  const text = (message.bodyText ?? message.snippet ?? "").trim();
  const clipped = text.length > MAX_BODY_CHARS ? `${text.slice(0, MAX_BODY_CHARS)}\n[…truncated]` : text;
  if (clipped) return clipped;
  if (message.mediaType) return `[${message.mediaType} attachment]`;
  return "[empty message]";
}

export function money(value: number | null, currency: string): string {
  if (value === null) return "";
  return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

export function describeClient(client: Client | null, currency: string): string {
  if (!client) return "This contact is not linked to a client record yet. Treat them as a new enquiry.";
  const lines = [
    `Name: ${client.firstName} ${client.lastName}`.trim(),
    `Type: ${client.clientType}`,
    `Pipeline stage: ${client.stage}`,
  ];
  if (client.budgetMin !== null || client.budgetMax !== null) {
    lines.push(`Budget: ${[money(client.budgetMin, currency), money(client.budgetMax, currency)].filter(Boolean).join(" to ")}`);
  }
  if (client.preferredAreas) lines.push(`Preferred areas: ${client.preferredAreas}`);
  if (client.requirements) lines.push(`Requirements: ${client.requirements}`);
  if (client.notes) lines.push(`Agent notes: ${client.notes}`);
  if (client.source) lines.push(`Source: ${client.source}`);
  return lines.join("\n");
}

export function describeProperty(property: Property, currency: string): string {
  const where = [property.suburb, property.city].filter(Boolean).join(", ");
  const specs = [
    property.bedrooms !== null ? `${property.bedrooms} bed` : null,
    property.bathrooms !== null ? `${property.bathrooms} bath` : null,
    property.parking !== null ? `${property.parking} parking` : null,
    property.floorSize !== null ? `${property.floorSize} m²` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return [
    `Title: ${property.title}${property.reference ? ` (ref ${property.reference})` : ""}`,
    `Listing: ${property.listingType === "rental" ? "to rent" : "for sale"}, ${property.propertyType}, status ${property.status}`,
    where ? `Location: ${where}` : null,
    `${property.listingType === "rental" ? "Rent per month" : "Price"}: ${money(property.price, currency) || "not set"}`,
    specs ? `Specs: ${specs}` : null,
    property.features ? `Features: ${property.features}` : null,
    property.description ? `Description: ${property.description.slice(0, 1200)}` : null,
    property.listingUrl ? `Listing link: ${property.listingUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

async function describeProperties(clientId: string | null, currency: string): Promise<string> {
  if (!clientId) return "None.";
  const items = await getClientProperties(clientId);
  if (items.length === 0) return "None.";
  return items
    .map(({ property, link }) => {
      const where = [property.suburb, property.city].filter(Boolean).join(", ");
      const specs = [
        property.bedrooms !== null ? `${property.bedrooms} bed` : null,
        property.bathrooms !== null ? `${property.bathrooms} bath` : null,
        property.parking !== null ? `${property.parking} parking` : null,
      ]
        .filter(Boolean)
        .join(", ");
      const parts = [
        `- ${property.title}${property.reference ? ` (ref ${property.reference})` : ""}`,
        where ? `  Location: ${where}` : null,
        `  ${property.listingType === "rent" ? "Rent" : "Price"}: ${money(property.price, currency) || "not set"}; status: ${property.status}`,
        specs ? `  ${specs}` : null,
        `  Relationship to client: ${JSON.stringify(link)}`,
      ];
      return parts.filter(Boolean).join("\n");
    })
    .join("\n");
}

function systemPrompt(agentName: string, agencyName: string, channel: "email" | "whatsapp"): string {
  const who = [agentName || "the agent", agencyName ? `at ${agencyName}` : ""].filter(Boolean).join(" ");
  return `You draft replies to clients on behalf of ${who}, a real estate agent. The agent reviews and edits every draft before sending, so write in their voice, first person, as if they wrote it.

Channel: ${channel === "email" ? "email. Use a normal email structure with a greeting and a short sign-off line with the agent's first name. Do not add a full signature block; it is appended automatically." : "WhatsApp. Keep it short and conversational, a few sentences at most. Greeting optional. No sign-off block."}

Ground rules:
- Reply to the most recent message from the client. Answer what they actually asked, and move the deal forward with one clear next step (a viewing, a call, documents, a decision).
- Only state facts that appear in the client record, the linked properties, or the conversation. Never invent prices, availability, dates, addresses, legal or financial details. Where the agent must supply something, write a placeholder in square brackets, e.g. [confirm time], and mention it in the notes.
- Match the client's language and level of formality. Warm, professional, no filler, no marketing fluff.
- If the latest message needs no reply, or is clearly not from a client (newsletter, notification, spam), say so in the notes and make the body a short courteous reply anyway.
- Plain text only. No markdown.`;
}

/**
 * Drafts a reply for a conversation using Claude. Requires ANTHROPIC_API_KEY.
 * Returns the draft and any notes the agent should read before sending.
 */
export async function draftReply(request: DraftRequest): Promise<Draft> {
  if (env.anthropic.demo) {
    const { demoDraft } = await import("./demo-drafts");
    return demoDraft(request);
  }
  const apiKey = env.anthropic.apiKey;
  if (!apiKey) throw new DraftError("Add ANTHROPIC_API_KEY to your environment to enable AI drafts.");

  const [messages, client, settings] = await Promise.all([
    getConversationMessages(request.channel, request.contactAddress),
    request.clientId ? getClient(request.clientId) : Promise.resolve(null),
    getSettings(),
  ]);
  if (messages.length === 0) throw new DraftError("There are no messages in this conversation to reply to.");

  const recent = messages.slice(-MAX_MESSAGES);
  const lastInbound = [...recent].reverse().find((m) => m.direction === "inbound");
  const inThread = request.channel === "email" && Boolean(lastInbound?.threadId);
  const properties = await describeProperties(request.clientId, settings.currency);

  const transcript = recent
    .map((m) => {
      const who = m.direction === "inbound" ? `CLIENT (${m.contactName ?? m.contactAddress})` : `AGENT${m.isAutoReply ? " (auto-reply)" : ""}`;
      const when = formatDateTime(m.sentAt, settings.timezone);
      const subject = m.channel === "email" && m.subject ? `\nSubject: ${m.subject}` : "";
      return `--- ${who} · ${when}${subject}\n${messageText(m)}`;
    })
    .join("\n\n");

  const userPrompt = [
    `## Client record\n${describeClient(client, settings.currency)}`,
    `## Properties linked to this client\n${properties}`,
    `## Conversation (oldest first, ${recent.length} of ${messages.length} messages)\n${transcript}`,
    request.instruction?.trim() ? `## Instruction from the agent for this reply\n${request.instruction.trim()}` : null,
    `## Task\nDraft the agent's reply to the latest client message.${inThread ? " This is a reply inside an existing email thread, so leave subject empty." : request.channel === "email" ? " This starts a new email thread, so include a subject." : ""}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const anthropic = new Anthropic({ apiKey, timeout: 90_000, maxRetries: 1 });
  let response;
  try {
    response = await anthropic.beta.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: zodOutputFormat(DraftSchema) },
      system: systemPrompt(settings.agentName, settings.agencyName, request.channel),
      messages: [{ role: "user", content: userPrompt }],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) throw new DraftError("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.");
    if (error instanceof Anthropic.RateLimitError) throw new DraftError("The AI service is rate limited right now. Try again in a moment.");
    if (error instanceof Anthropic.APIError) throw new DraftError(`AI request failed (${error.status ?? "network"}): ${error.message}`);
    throw error;
  }

  if (response.stop_reason === "refusal") {
    throw new DraftError("The AI declined to draft this reply. Write it manually.");
  }
  const draft = response.parsed_output;
  if (!draft || !draft.body.trim()) throw new DraftError("The AI returned an empty draft. Try again.");
  return { subject: inThread ? "" : draft.subject.trim(), body: draft.body.trim(), notes: draft.notes.trim() };
}

