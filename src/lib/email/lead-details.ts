import { findPhoneNumbersInText, type CountryCode } from "libphonenumber-js";
import { normalizePhone } from "@/lib/phone";

/**
 * Client details found in the body of an enquiry email: website contact forms, portal leads and
 * people who simply write "Hi, I'm looking for a 3 bed house in Durbanville, budget R3.5m, call me
 * on 082 123 4567". Rule-based so it works without an AI key; `ai/lead-details.ts` refines it.
 */
export type LeadDetails = {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  alternatePhone: string | null;
  clientType: "buyer" | "seller" | "investor" | "tenant" | "landlord" | null;
  budgetMin: number | null;
  budgetMax: number | null;
  preferredAreas: string | null;
  requirements: string | null;
  /** The enquiry itself, kept on the client record as a note. */
  message: string | null;
};

export const EMPTY_LEAD_DETAILS: LeadDetails = {
  firstName: null,
  lastName: null,
  phone: null,
  alternatePhone: null,
  clientType: null,
  budgetMin: null,
  budgetMax: null,
  preferredAreas: null,
  requirements: null,
  message: null,
};

const MAX_MESSAGE = 3000;

/** Removes the quoted earlier conversation and the mobile signature from a reply, so only the sender's own words remain. */
export function stripQuotedReply(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (/^-{2,}\s*(original message|forwarded message)\s*-{2,}/i.test(trimmed)) break;
    if (/^on .{4,200}wrote:\s*$/i.test(trimmed)) break;
    // "On Tue, 10 Nov 2026 at 10:00, Jane <jane@example.com>" with "wrote:" wrapped onto the next line.
    if (/^on .{4,200}$/i.test(trimmed) && /^\S*.*wrote:\s*$/i.test((lines[i + 1] ?? "").trim()) && /\d/.test(trimmed)) break;
    // Outlook: a "From:" line followed shortly by "Sent:" or "Date:".
    if (/^from:\s/i.test(trimmed) && lines.slice(i + 1, i + 4).some((l) => /^(sent|date):\s/i.test(l.trim()))) break;
    if (/^_{8,}$/.test(trimmed)) break;
    if (/^sent from my (iphone|ipad|android|samsung|mobile|galaxy|huawei)/i.test(trimmed)) break;
    if (/^get outlook for (ios|android)/i.test(trimmed)) break;
    if (trimmed.startsWith(">")) continue;
    kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

type Field = "firstName" | "lastName" | "name" | "phone" | "budget" | "budgetMin" | "budgetMax" | "areas" | "type" | "message" | "requirement" | "email" | "ignore";

/** Maps a form label ("Cell number", "Preferred suburb", "Max price") to the client field it fills. */
function fieldForLabel(label: string): Field | null {
  const l = label.toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
  if (!l) return null;
  if (/^(e ?mail|email address)( address)?$/.test(l)) return "email";
  if (/^(first ?name|name first|given name|voornaam)$/.test(l)) return "firstName";
  if (/^(last ?name|surname|family name|van)$/.test(l)) return "lastName";
  if (/^(full ?name|name|your name|contact name|naam|client name|lead name|contact person)$/.test(l)) return "name";
  if (/(phone|cell|mobile|tel|telephone|whats ?app|contact (number|no)|^number$|^contact$|selfoon)/.test(l)) return "phone";
  if (/^(min|minimum)( budget| price)?$|^(budget|price) (from|min|minimum)$/.test(l)) return "budgetMin";
  if (/^(max|maximum)( budget| price)?$|^(budget|price) (to|max|maximum)$/.test(l)) return "budgetMax";
  if (/(budget|price range|^price$|afford|begroting)/.test(l)) return "budget";
  if (/(area|suburb|location|region|town|city|neighbourhood|neighborhood)/.test(l)) return "areas";
  if (/(looking to|interested in|enquiry type|inquiry type|i want to|i am a|i am|lead type|transaction|buy or rent|purpose)/.test(l)) return "type";
  if (/^(message|comments?|enquiry|inquiry|query|question|details|additional (info|information|comments)|notes?|your message|boodskap)$/.test(l)) return "message";
  if (/(bed|bath|garage|parking|property type|type of property|size|erf|pets?|move in|moving date|occupation date|listing|property ref|reference|ref|web ref|timeframe|time frame|finance|pre ?approved|bond)/.test(l)) return "requirement";
  if (/^(subject|date|sent|to|from|ip|ip address|page|url|source|website|form|submitted|time)$/.test(l)) return "ignore";
  return null;
}

const LABEL_LINE = /^\s*[*_]{0,2}([A-Za-z][A-Za-z0-9 /&()'.-]{0,40}?)[*_]{0,2}(?:\s*[:：]|\t)\s*[*_]{0,2}(.*?)[*_]{0,2}\s*$/;

type LabelledValue = { field: Field; label: string; value: string };

/** Reads "Label: value" lines, including a value on the line after its label and multi-line messages. */
function readLabelledFields(lines: string[]): { values: LabelledValue[]; consumed: Set<number> } {
  const values: LabelledValue[] = [];
  const consumed = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(LABEL_LINE);
    if (!match) continue;
    const label = match[1].trim();
    const field = fieldForLabel(label);
    if (!field) continue;
    consumed.add(i);
    let value = match[2].trim();
    if (field === "message") {
      // A message runs until the next recognised label.
      const parts = value ? [value] : [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const next = lines[j].match(LABEL_LINE);
        if (next && fieldForLabel(next[1])) break;
        parts.push(lines[j]);
        consumed.add(j);
      }
      i = j - 1;
      value = parts.join("\n").trim();
    } else if (!value && i + 1 < lines.length && lines[i + 1].trim() && !LABEL_LINE.test(lines[i + 1])) {
      value = lines[i + 1].trim();
      consumed.add(i + 1);
      i += 1;
    }
    if (value) values.push({ field, label, value });
  }
  return { values, consumed };
}

/**
 * Parses an amount such as "R2.5m", "R 2 500 000", "2,5 million", "R850k" or "15000".
 * Returns whole currency units, or null for anything that is not plausibly a property budget or rent.
 */
export function parseAmount(raw: string): number | null {
  const match = raw
    .toLowerCase()
    .replace(/ /g, " ")
    .match(/(\d{1,3}(?:[ ,.']\d{3})+|\d+(?:[.,]\d+)?)\s*(m\b|mil\b|mill?ion|mn\b|k\b|thousand)?/);
  if (!match) return null;
  let digits = match[1];
  const unit = match[2] ?? "";
  if (/^\d{1,3}([ ,.']\d{3})+$/.test(digits)) digits = digits.replace(/[ ,.']/g, "");
  else digits = digits.replace(",", ".");
  let value = Number(digits);
  if (!Number.isFinite(value)) return null;
  if (/^m|^mil|^mn/.test(unit)) value *= 1_000_000;
  else if (/^k|^thousand/.test(unit)) value *= 1_000;
  value = Math.round(value);
  if (value < 500 || value > 10_000_000_000) return null;
  return value;
}

const AMOUNT = String.raw`(?:r|zar|usd|eur|gbp|aud|\$|£|€)\s?\d[\d ,.']*(?:\s?(?:m|mil|million|mn|k|thousand)\b)?|\d[\d ,.']*\s?(?:m|mil|million|mn|k|thousand)\b`;

function findAmounts(text: string): number[] {
  const found: number[] = [];
  for (const m of text.toLowerCase().matchAll(new RegExp(`(?<![\\w])(${AMOUNT})`, "gi"))) {
    const value = parseAmount(m[1].replace(/^(?:r|zar|usd|eur|gbp|aud|\$|£|€)\s?/, ""));
    if (value !== null) found.push(value);
  }
  return found;
}

/** A budget range from a phrase such as "between R2m and R2.5m", "up to R3 million" or "R15 000 - R18 000 pm". */
function budgetFrom(text: string, labelled: boolean): { min: number | null; max: number | null } {
  const lower = text.toLowerCase();
  const amounts = labelled ? splitRange(lower) : findAmounts(lower);
  if (amounts.length === 0) return { min: null, max: null };
  if (amounts.length >= 2) {
    const [a, b] = amounts;
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  const [only] = amounts;
  if (/(from|min|minimum|at least|above|over|more than|starting)\b/.test(lower)) return { min: only, max: null };
  return { min: null, max: only };
}

function splitRange(value: string): number[] {
  const withCurrency = findAmounts(value);
  if (withCurrency.length > 0) return withCurrency;
  return value
    .split(/\s+(?:-|–|to|and)\s+|\s*(?:–|-)\s*(?=\d)/)
    .map((part) => parseAmount(part))
    .filter((v): v is number => v !== null);
}

/** Sentences that talk about money in a way that means a budget, not a listing price they are quoting back. */
function budgetSentence(text: string): string | null {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/);
  return sentences.find((s) => /(budget|afford|up to|max(imum)?|price range|between|spend|pre-?approv|bond of|looking to pay|rent of)/i.test(s) && findAmounts(s).length > 0) ?? null;
}

function clientTypeFrom(text: string): LeadDetails["clientType"] {
  const t = text.toLowerCase();
  if (/(rent out|let (out )?my|letting my|lease out|tenant for my|find a tenant|rental management)/.test(t)) return "landlord";
  if (/(sell(ing)? (my|our)|valuation|market (my|our)|list (my|our)|what (is|'s) my (house|home|property|flat|apartment) worth|mandate)/.test(t)) return "seller";
  if (/(invest(or|ment|ing)?\b|buy[- ]to[- ]let|rental yield)/.test(t)) return "investor";
  if (/(\bto rent\b|\brental\b|\bfor rent\b|\blease\b|\btenant|\bto let\b|\bper month\b|\bp\/m\b)/.test(t)) return "tenant";
  if (/(\bbuy(ing)?\b|purchas|bond|for sale|first[- ]time home|make an offer|offer to purchase)/.test(t)) return "buyer";
  return null;
}

function typeFromLabelledValue(value: string): LeadDetails["clientType"] {
  const v = value.toLowerCase();
  if (/landlord|let|rent out/.test(v)) return "landlord";
  if (/sell|valuation/.test(v)) return "seller";
  if (/invest/.test(v)) return "investor";
  if (/rent|tenant|lease/.test(v)) return "tenant";
  if (/buy|purchas/.test(v)) return "buyer";
  return clientTypeFrom(v);
}

/** Phone numbers in free text, in E.164, in the order they appear. Only valid numbers count, so prices and references are ignored. */
export function findPhones(text: string, defaultCountry: string): string[] {
  const result: string[] = [];
  let found;
  try {
    found = findPhoneNumbersInText(text, defaultCountry as CountryCode);
  } catch {
    return result;
  }
  for (const item of found) {
    if (!item.number.isValid()) continue;
    // People write their number as 082 123 4567 or +27 82 123 4567. A bare 9-digit run without the
    // leading 0 or + is far more often a listing reference or ERF number.
    const raw = text.slice(item.startsAt, item.endsAt).trim();
    if (!/^(\+|00|0|\()/.test(raw)) continue;
    const e164 = item.number.number;
    if (!result.includes(e164)) result.push(e164);
  }
  return result;
}

function clean(value: string | null | undefined, max = 500): string | null {
  const v = (value ?? "").replace(/[ \t]+/g, " ").trim();
  if (!v || /^(n\/?a|none|-|\.|null|not specified)$/i.test(v)) return null;
  return v.length > max ? `${v.slice(0, max - 1).trimEnd()}…` : v;
}

export type ExtractInput = {
  subject: string;
  text: string;
  defaultCountry: string;
};

/** Pulls whatever client details an enquiry email contains. Fields it cannot find are null. */
export function extractLeadDetails(input: ExtractInput): LeadDetails {
  const body = stripQuotedReply(input.text);
  const lines = body.split("\n");
  const { values, consumed } = readLabelledFields(lines);
  const details: LeadDetails = { ...EMPTY_LEAD_DETAILS };
  const requirements: string[] = [];
  const areas: string[] = [];
  const phones: string[] = [];

  for (const { field, label, value } of values) {
    switch (field) {
      case "firstName":
        details.firstName ??= clean(value, 100);
        break;
      case "lastName":
        details.lastName ??= clean(value, 100);
        break;
      case "name": {
        const name = clean(value, 200);
        if (name && !name.includes("@") && !details.firstName) {
          const parts = name.split(/\s+/);
          details.firstName = parts[0];
          details.lastName = parts.slice(1).join(" ") || null;
        }
        break;
      }
      case "phone": {
        const phone = normalizePhone(value, input.defaultCountry);
        if (phone && !phones.includes(phone)) phones.push(phone);
        break;
      }
      case "budget": {
        const { min, max } = budgetFrom(value, true);
        details.budgetMin ??= min;
        details.budgetMax ??= max;
        break;
      }
      case "budgetMin":
        details.budgetMin ??= parseAmount(value);
        break;
      case "budgetMax":
        details.budgetMax ??= parseAmount(value);
        break;
      case "areas": {
        const area = clean(value, 300);
        if (area && !areas.includes(area)) areas.push(area);
        break;
      }
      case "type":
        details.clientType ??= typeFromLabelledValue(value);
        break;
      case "message":
        details.message ??= clean(value, MAX_MESSAGE);
        break;
      case "requirement": {
        const v = clean(value, 300);
        if (v) requirements.push(`${label}: ${v}`);
        break;
      }
      default:
        break;
    }
  }

  // Free text: whatever is not a form field is the enquiry itself.
  const freeText = lines
    .filter((_, i) => !consumed.has(i))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const prose = [details.message ?? "", freeText].filter(Boolean).join("\n");

  for (const phone of findPhones(prose, input.defaultCountry)) if (!phones.includes(phone)) phones.push(phone);
  details.phone = phones[0] ?? null;
  details.alternatePhone = phones[1] ?? null;

  if (details.budgetMin === null && details.budgetMax === null) {
    const sentence = budgetSentence(prose);
    if (sentence) {
      const { min, max } = budgetFrom(sentence, false);
      details.budgetMin = min;
      details.budgetMax = max;
    }
  }
  if (details.budgetMin !== null && details.budgetMax !== null && details.budgetMin > details.budgetMax) {
    [details.budgetMin, details.budgetMax] = [details.budgetMax, details.budgetMin];
  }

  details.clientType ??= clientTypeFrom(`${input.subject}\n${prose}`);
  details.preferredAreas = areas.length > 0 ? areas.join(", ") : null;
  details.requirements = requirements.length > 0 ? requirements.join("\n") : null;
  details.message ??= clean(freeText, MAX_MESSAGE);
  return details;
}

/** True when the lead has anything beyond a name worth recording. */
export function hasLeadDetails(details: LeadDetails): boolean {
  return Boolean(
    details.phone ||
      details.alternatePhone ||
      details.budgetMin !== null ||
      details.budgetMax !== null ||
      details.preferredAreas ||
      details.requirements ||
      details.clientType ||
      details.message,
  );
}
