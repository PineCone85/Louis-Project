import type { BusinessHours } from "@/lib/db/schema";
import { zonedParts } from "@/lib/format";

/** Returns the weekday (0 = Sunday) and minutes since midnight in the given time zone. */
export function localTimeParts(date: Date, timezone: string): { weekday: number; minutes: number } {
  const p = zonedParts(date, timezone);
  return { weekday: p.weekday, minutes: p.hour * 60 + p.minute };
}

function toMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function isWithinBusinessHours(date: Date, hours: BusinessHours, timezone: string): boolean {
  const { weekday, minutes } = localTimeParts(date, timezone);
  if (!hours.days.includes(weekday)) return false;
  const start = toMinutes(hours.start);
  const end = toMinutes(hours.end);
  if (end <= start) return minutes >= start || minutes < end;
  return minutes >= start && minutes < end;
}
