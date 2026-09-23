import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Client, Property } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/queries/settings";
import { DraftError, DraftSchema, describeClient, describeProperty, money, type Draft } from "./draft";

const MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5";

/**
 * A message the agent initiates (as opposed to a reply): introducing a new
 * listing, checking in before a follow-up, re-engaging a quiet client, or
 * telling interested clients a property's status changed.
 */
export type OutreachRequest = {
  client: Client | null;
  /** Used when there is no client record, e.g. an unknown WhatsApp number. */
  contactName?: string | null;
  property?: Property | null;
  channel: "email" | "whatsapp";
  /** What the message should achieve, e.g. "Introduce this listing and offer a viewing". */
  purpose: string;
  /** Why this client was chosen, from the matcher, e.g. ["within budget", "in a preferred area (sea point)"]. */
  reasons?: string[];
  /** Extra guidance from the workflow. */
  instruction?: string | null;
};

const DEMO_NOTE = "Demo mode: this draft is generated from a template. With an Anthropic API key configured, Claude writes it from the client record, the property and your instruction.";

function firstName(request: OutreachRequest): string {
  return request.client?.firstName || (request.contactName ?? "").split(" ")[0] || "there";
}

/** Template-based draft for demo mode: fills in the real names and figures without calling the API. */
export async function demoOutreach(request: OutreachRequest): Promise<Draft> {
  await new Promise((resolve) => setTimeout(resolve, 300));
  const settings = await getSettings();
  const agent = settings.agentName.split(" ")[0] || settings.agentName || "Sam";
  const first = firstName(request);
  const property = request.property ?? null;
  const notes = [DEMO_NOTE];
  if (request.instruction?.trim()) notes.unshift(`Your instruction ("${request.instruction.trim()}") would steer a live draft.`);

  if (property) {
    const where = [property.suburb, property.city].filter(Boolean).join(", ");
    const price = money(property.price, settings.currency);
    const priceLine = price ? (property.listingType === "rental" ? `${price} per month` : price) : "";
    const specs = [
      property.bedrooms !== null ? `${property.bedrooms} bedroom${property.bedrooms === 1 ? "" : "s"}` : null,
      property.bathrooms !== null ? `${property.bathrooms} bathroom${property.bathrooms === 1 ? "" : "s"}` : null,
      property.parking ? `${property.parking} parking` : null,
    ]
      .filter(Boolean)
      .join(", ");
    const why = request.reasons && request.reasons.length > 0 ? `I thought of you because it is ${request.reasons.slice(0, 3).join(" and ")}.` : "";
    const statusNote =
      property.status === "sold" || property.status === "rented"
        ? `Unfortunately ${property.title} has just been ${property.status}. I know it was on your list, so I wanted to tell you before it disappears from the portals, and I have one or two similar options I'd like to show you.`
        : property.status === "under_offer"
          ? `${property.title} has just gone under offer. If the deal falls through you'll be the first to know, and in the meantime I'll keep looking for something similar.`
          : null;

    if (request.channel === "whatsapp") {
      const body = statusNote
        ? `Hi ${first}, quick update: ${statusNote} Shall I send you the alternatives? ${agent}`
        : `Hi ${first}, a listing just came in that fits your brief: ${property.title}${where ? ` in ${where}` : ""}${priceLine ? `, ${priceLine}` : ""}${specs ? ` (${specs})` : ""}. ${why} Would you like to view it this week? ${agent}`;
      return { subject: "", body, notes: notes.join(" ") };
    }
    const subject = statusNote ? `Update on ${property.title}` : `New listing: ${property.title}`;
    const body = statusNote
      ? `Hi ${first}

${statusNote}

Would a call this week suit you? I can also send the alternatives by email if you prefer.

Warm regards
${agent}`
      : `Hi ${first}

A property has just come onto our books that I think fits what you're looking for: ${property.title}${property.reference ? ` (ref ${property.reference})` : ""}.

${[where ? `Location: ${where}` : null, priceLine ? `Price: ${priceLine}` : null, specs ? `Layout: ${specs}` : null, property.features ? `Features: ${property.features}` : null].filter(Boolean).join("\n")}

${why ? `${why} ` : ""}Would you like to see it? I can arrange a viewing this week; let me know which days suit you.

Warm regards
${agent}`;
    notes.unshift("Check the viewing availability before sending.");
    return { subject, body, notes: notes.join(" ") };
  }

  const purpose = request.purpose.replace(/\.$/, "");
  if (request.channel === "whatsapp") {
    return { subject: "", body: `Hi ${first}, ${agent} here from ${settings.agencyName || "the office"}. ${purpose}. Is there anything I can line up for you this week?`, notes: notes.join(" ") };
  }
  return {
    subject: "Checking in",
    body: `Hi ${first}

${purpose}. I'd love to hear where things stand and whether your requirements have changed at all.

Is there anything I can line up for you this week?

Warm regards
${agent}`,
    notes: notes.join(" "),
  };
}

function systemPrompt(agentName: string, agencyName: string, channel: "email" | "whatsapp"): string {
  const who = [agentName || "the agent", agencyName ? `at ${agencyName}` : ""].filter(Boolean).join(" ");
  return `You write outbound messages to clients on behalf of ${who}, a real estate agent. The agent reviews and edits every draft before sending, so write in their voice, first person.

Channel: ${channel === "email" ? "email. Greeting, two to four short paragraphs, a sign-off line with the agent's first name. No signature block; it is appended automatically." : "WhatsApp. Two to four sentences, conversational, no sign-off block."}

Ground rules:
- Achieve the stated purpose and end with one clear next step (a viewing, a call, a reply).
- Only state facts from the client record and the property details provided. Never invent prices, availability, dates or addresses. Where the agent must supply something, write a placeholder in square brackets and mention it in the notes.
- If reasons are given for why this client was matched, weave one or two of them in naturally; do not list them mechanically.
- Match the client's language and level of formality. Warm, professional, no filler.
- Plain text only. No markdown.`;
}

export async function draftOutreach(request: OutreachRequest): Promise<Draft> {
  if (env.anthropic.demo) return demoOutreach(request);
  const apiKey = env.anthropic.apiKey;
  if (!apiKey) throw new DraftError("Add ANTHROPIC_API_KEY to your environment to enable AI drafts.");

  const settings = await getSettings();
  const sections = [
    `## Client record\n${request.client ? describeClient(request.client, settings.currency) : `Unknown contact${request.contactName ? `: ${request.contactName}` : ""}. Treat them as a new enquiry.`}`,
    request.property ? `## Property\n${describeProperty(request.property, settings.currency)}` : null,
    request.reasons && request.reasons.length > 0 ? `## Why this client was matched\n${request.reasons.map((r) => `- ${r}`).join("\n")}` : null,
    `## Purpose of this message\n${request.purpose}`,
    request.instruction?.trim() ? `## Instruction from the agent\n${request.instruction.trim()}` : null,
    `## Task\nWrite the message.${request.channel === "email" ? " Include a subject line." : " Leave subject empty."}`,
  ].filter(Boolean);

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
      messages: [{ role: "user", content: sections.join("\n\n") }],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) throw new DraftError("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.");
    if (error instanceof Anthropic.RateLimitError) throw new DraftError("The AI service is rate limited right now. Try again in a moment.");
    if (error instanceof Anthropic.APIError) throw new DraftError(`AI request failed (${error.status ?? "network"}): ${error.message}`);
    throw error;
  }
  if (response.stop_reason === "refusal") throw new DraftError("The AI declined to write this message.");
  const draft = response.parsed_output;
  if (!draft || !draft.body.trim()) throw new DraftError("The AI returned an empty draft.");
  return { subject: request.channel === "email" ? draft.subject.trim() : "", body: draft.body.trim(), notes: draft.notes.trim() };
}
