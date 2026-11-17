import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { env } from "@/lib/env";
import { extractLeadDetails, stripQuotedReply, type ExtractInput, type LeadDetails } from "@/lib/email/lead-details";
import { normalizePhone } from "@/lib/phone";

const MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5";
const MAX_INPUT_CHARS = 12_000;

const LeadSchema = z.object({
  firstName: z.string().describe("The enquirer's first name, or empty if not stated. Not the agent's name."),
  lastName: z.string().describe("The enquirer's surname, or empty."),
  phones: z.array(z.string()).describe("The enquirer's own phone numbers exactly as written, most important first. Not the agency's or a portal's number."),
  clientType: z.enum(["buyer", "seller", "investor", "tenant", "landlord", "unknown"]),
  budgetMin: z.number().nullable().describe("Lowest budget or rent in whole currency units (R2.5m is 2500000), or null."),
  budgetMax: z.number().nullable().describe("Highest budget or rent in whole currency units, or null. A single figure is the maximum."),
  preferredAreas: z.string().describe("Suburbs, towns or areas they want, comma separated, or empty."),
  requirements: z
    .string()
    .describe("Short lines on what they need: property type, bedrooms, bathrooms, parking, pets, move-in date, finance, the listing or reference they asked about. Empty if none."),
});

/**
 * Rule-based extraction refined by Claude when an API key is configured: it reads free-form enquiries
 * the rules cannot ("we're a family of four relocating to Somerset West, around 2.8 bar"). Any failure
 * falls back to the rules, so creating the client never depends on the AI service.
 */
export async function extractLeadDetailsWithAi(input: ExtractInput & { senderName: string | null }): Promise<LeadDetails> {
  const rules = extractLeadDetails(input);
  const apiKey = env.anthropic.apiKey;
  if (!apiKey || env.anthropic.demo) return rules;

  const body = stripQuotedReply(input.text).slice(0, MAX_INPUT_CHARS);
  if (!body.trim()) return rules;

  try {
    const anthropic = new Anthropic({ apiKey, timeout: 45_000, maxRetries: 1 });
    const response = await anthropic.beta.messages.parse({
      model: MODEL,
      max_tokens: 1500,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: zodOutputFormat(LeadSchema) },
      system:
        "You extract a real estate client's details from an enquiry email sent to an estate agent, so the agent's CRM record is complete. " +
        "The email may be a personal message, a website form or a property portal lead. Record only what the email states about the enquirer; " +
        "never invent values and never use the agent's, agency's or portal's own details.",
      messages: [
        {
          role: "user",
          content: `Sender display name: ${input.senderName ?? "(none)"}\nSubject: ${input.subject || "(none)"}\nDefault country for phone numbers: ${input.defaultCountry}\n\n${body}`,
        },
      ],
    });
    const ai = response.stop_reason === "refusal" ? null : response.parsed_output;
    if (!ai) return rules;

    const phones = [...ai.phones.map((p) => normalizePhone(p, input.defaultCountry)), rules.phone, rules.alternatePhone].filter(
      (p, i, all): p is string => Boolean(p) && all.indexOf(p) === i,
    );
    const amount = (v: number | null) => (v !== null && Number.isFinite(v) && v >= 500 ? Math.round(v) : null);
    let budgetMin = amount(ai.budgetMin) ?? rules.budgetMin;
    let budgetMax = amount(ai.budgetMax) ?? rules.budgetMax;
    if (budgetMin !== null && budgetMax !== null && budgetMin > budgetMax) [budgetMin, budgetMax] = [budgetMax, budgetMin];

    return {
      firstName: ai.firstName.trim() || rules.firstName,
      lastName: ai.lastName.trim() || rules.lastName,
      phone: phones[0] ?? null,
      alternatePhone: phones[1] ?? null,
      clientType: ai.clientType === "unknown" ? rules.clientType : ai.clientType,
      budgetMin,
      budgetMax,
      preferredAreas: ai.preferredAreas.trim() || rules.preferredAreas,
      requirements: ai.requirements.trim() || rules.requirements,
      message: rules.message,
    };
  } catch (error) {
    console.error("[lead-details] AI extraction failed, using the rule-based details:", error instanceof Error ? error.message : error);
    return rules;
  }
}
