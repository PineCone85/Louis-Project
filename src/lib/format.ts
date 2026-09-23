import { formatDistanceToNowStrict } from "date-fns";

/**
 * Formatting helpers that produce identical output on the server and in the
 * browser regardless of ICU version, and that respect the agent's configured
 * time zone instead of the machine's.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const CURRENCY_SYMBOLS: Record<string, string> = { ZAR: "R", USD: "$", EUR: "€", GBP: "£", AUD: "A$", NZD: "NZ$", CAD: "C$", NAD: "N$", BWP: "P", KES: "KSh", NGN: "₦", INR: "₹", AED: "AED" };
const NBSP = " ";

export type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number };

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

function formatter(timezone?: string): Intl.DateTimeFormat {
  const options: Intl.DateTimeFormatOptions = {
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    weekday: "short",
  };
  try {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: timezone });
  } catch {
    return new Intl.DateTimeFormat("en-US", options);
  }
}

/** Calendar fields of an instant in the given time zone (defaults to the runtime's zone). */
export function zonedParts(value: Date | string | number, timezone?: string): ZonedParts {
  const parts = formatter(timezone).formatToParts(toDate(value));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function formatDate(date: Date | string | null | undefined, timezone?: string): string {
  if (!date) return "";
  const p = zonedParts(date, timezone);
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
}

export function formatTime(date: Date | string | null | undefined, timezone?: string): string {
  if (!date) return "";
  const p = zonedParts(date, timezone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export function formatDateTime(date: Date | string | null | undefined, timezone?: string): string {
  if (!date) return "";
  return `${formatDate(date, timezone)}, ${formatTime(date, timezone)}`;
}

/** Compact, human timestamp: "14:02" for today, "Yesterday", "3 Mar", or "3 Mar 2025". */
export function formatSmartDate(date: Date | string | null | undefined, timezone?: string): string {
  if (!date) return "";
  const value = toDate(date);
  const p = zonedParts(value, timezone);
  const now = zonedParts(new Date(), timezone);
  if (p.year === now.year && p.month === now.month && p.day === now.day) return formatTime(value, timezone);
  const yesterday = zonedParts(new Date(Date.now() - 86_400_000), timezone);
  if (p.year === yesterday.year && p.month === yesterday.month && p.day === yesterday.day) return "Yesterday";
  return `${p.day} ${MONTHS[p.month - 1]}${p.year === now.year ? "" : ` ${p.year}`}`;
}

export function formatRelative(date: Date | string | null | undefined): string {
  if (!date) return "";
  return `${formatDistanceToNowStrict(toDate(date))} ago`;
}

export function daysSince(date: Date | string | null | undefined): number {
  if (!date) return 0;
  return Math.max(0, Math.floor((Date.now() - toDate(date).getTime()) / 86_400_000));
}

function groupDigits(integer: string): string {
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

export function formatNumber(value: number | null | undefined, maxDecimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  const negative = value < 0;
  const abs = Math.abs(value);
  const rounded = Number(abs.toFixed(maxDecimals));
  const [integer, fraction] = String(rounded).split(".");
  return `${negative ? "-" : ""}${groupDigits(integer)}${fraction ? `.${fraction}` : ""}`;
}

export function formatCurrency(amount: number | null | undefined, currency = "ZAR"): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "";
  const code = currency.toUpperCase();
  const symbol = CURRENCY_SYMBOLS[code] ?? code;
  const negative = amount < 0;
  const digits = groupDigits(String(Math.round(Math.abs(amount))));
  return `${negative ? "-" : ""}${symbol}${NBSP}${digits}`;
}

export function fullName(person: { firstName: string; lastName?: string | null }): string {
  return [person.firstName, person.lastName].filter(Boolean).join(" ").trim();
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function truncate(value: string | null | undefined, length: number): string {
  if (!value) return "";
  return value.length > length ? `${value.slice(0, length - 1).trimEnd()}…` : value;
}

/** Offset of a time zone from UTC, in minutes, at the given instant. */
export function timezoneOffsetMinutes(date: Date, timezone?: string): number {
  const p = zonedParts(date, timezone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

/** Converts a datetime-local input value (wall-clock time in the given zone) to an instant. */
export function parseDateTimeLocal(value: string | null | undefined, timezone?: string): Date | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match.map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi, s || 0);
  if (Number.isNaN(wall)) return null;
  let guess = wall;
  for (let i = 0; i < 2; i += 1) {
    guess = wall - timezoneOffsetMinutes(new Date(guess), timezone) * 60_000;
  }
  const result = new Date(guess);
  return Number.isNaN(result.getTime()) ? null : result;
}

/** Formats an instant for a datetime-local input, as wall-clock time in the given zone. */
export function toDateTimeLocal(date: Date | null | undefined, timezone?: string): string {
  if (!date) return "";
  const p = zonedParts(date, timezone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
