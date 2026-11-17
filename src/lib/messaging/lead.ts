import type { Client } from "@/lib/db/schema";
import type { LeadDetails } from "@/lib/email/lead-details";
import { formatPhone } from "@/lib/phone";

export type ClientLeadFields = Partial<
  Pick<Client, "firstName" | "lastName" | "phone" | "alternatePhone" | "clientType" | "budgetMin" | "budgetMax" | "preferredAreas" | "requirements" | "notes">
>;

function enquiryNote(details: LeadDetails, subject: string | null, sentAt: Date | null): string | null {
  if (!details.message) return null;
  const date = sentAt ? sentAt.toISOString().slice(0, 10) : null;
  const heading = ["Enquiry", subject ? `"${subject}"` : null, date ? `(${date})` : null].filter(Boolean).join(" ");
  return `${heading}:\n${details.message}`;
}

/**
 * The client fields an email's lead details can fill. Only empty fields are filled, so nothing the agent
 * entered is overwritten; pass `existing: null` for a client that is being created.
 */
export function leadFieldsForClient(
  details: LeadDetails,
  existing: Client | null,
  context: { subject: string | null; sentAt: Date | null },
): ClientLeadFields {
  const fields: ClientLeadFields = {};
  const empty = (value: unknown) => value === null || value === undefined || value === "";

  const known = new Set([existing?.phone, existing?.alternatePhone].filter(Boolean));
  const phones = [details.phone, details.alternatePhone].filter((p): p is string => Boolean(p) && !known.has(p));
  if (existing) {
    if (empty(existing.phone) && phones.length > 0) fields.phone = phones.shift()!;
    if (empty(existing.alternatePhone) && phones.length > 0) fields.alternatePhone = phones.shift()!;
  } else {
    if (phones[0]) fields.phone = phones[0];
    if (phones[1]) fields.alternatePhone = phones[1];
  }

  if (details.budgetMin !== null && empty(existing?.budgetMin)) fields.budgetMin = details.budgetMin;
  if (details.budgetMax !== null && empty(existing?.budgetMax)) fields.budgetMax = details.budgetMax;
  const min = fields.budgetMin ?? existing?.budgetMin ?? null;
  const max = fields.budgetMax ?? existing?.budgetMax ?? null;
  if (min !== null && max !== null && min > max) {
    // A one-sided figure that conflicts with what is already recorded is left for the agent to resolve.
    delete fields.budgetMin;
    delete fields.budgetMax;
  }

  if (details.preferredAreas && empty(existing?.preferredAreas)) fields.preferredAreas = details.preferredAreas;
  if (details.requirements && empty(existing?.requirements)) fields.requirements = details.requirements;
  // The type defaults to buyer, so an existing client's type is only changed while they are still the default
  // and the email clearly says otherwise.
  if (details.clientType && (!existing || (existing.clientType === "buyer" && empty(existing.requirements) && empty(existing.budgetMax)))) {
    if (!existing || details.clientType !== existing.clientType) fields.clientType = details.clientType;
  }

  const note = enquiryNote(details, context.subject, context.sentAt);
  if (note && !(existing?.notes ?? "").includes(details.message ?? "")) {
    fields.notes = existing?.notes ? `${existing.notes}\n\n${note}` : note;
  }
  return fields;
}

/** A short line for the activity log, e.g. "Phone +27 82 123 4567 · Budget up to 3500000 · Areas: Durbanville". */
export function describeLeadFields(fields: ClientLeadFields): string {
  const parts: string[] = [];
  if (fields.phone) parts.push(`phone ${formatPhone(fields.phone)}`);
  if (fields.alternatePhone) parts.push(`alternate phone ${formatPhone(fields.alternatePhone)}`);
  if (fields.budgetMin != null || fields.budgetMax != null) parts.push("budget");
  if (fields.preferredAreas) parts.push(`areas (${fields.preferredAreas})`);
  if (fields.requirements) parts.push("requirements");
  if (fields.clientType) parts.push(`type ${fields.clientType}`);
  if (fields.notes) parts.push("the enquiry");
  return parts.join(", ");
}
