import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/**
 * Normalises a phone number to E.164 (for example +27821234567).
 * Returns null when the input cannot be interpreted as a valid number.
 */
export function normalizePhone(input: string | null | undefined, defaultCountry = "ZA"): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry as CountryCode);
  if (!parsed || !parsed.isPossible()) return null;
  return parsed.number;
}

/** Formats an E.164 number for display in international format. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const parsed = parsePhoneNumberFromString(e164);
  return parsed ? parsed.formatInternational() : e164;
}

/** WhatsApp identifies users by their number without the leading plus. */
export function phoneToWaId(e164: string): string {
  return e164.replace(/^\+/, "");
}

export function waIdToPhone(waId: string): string {
  const digits = waId.replace(/\D/g, "");
  return `+${digits}`;
}
