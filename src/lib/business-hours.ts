import type { BusinessHours, WeeklyWindow } from "@/lib/db/schema";
import { zonedParts } from "@/lib/format";

/** Returns the weekday (0 = Sunday) and minutes since midnight in the given time zone. */
export function localTimeParts(date: Date, timezone: string): { weekday: number; minutes: number } {
  const p = zonedParts(date, timezone);
  return { weekday: p.weekday, minutes: p.hour * 60 + p.minute };
}

export function toMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/** The opening and closing time that applies on a weekday, or null when closed. */
export function hoursForDay(hours: BusinessHours, weekday: number): { start: string; end: string } | null {
  if (!hours.days.includes(weekday)) return null;
  return hours.overrides?.[String(weekday)] ?? { start: hours.start, end: hours.end };
}

export function isWithinBusinessHours(date: Date, hours: BusinessHours, timezone: string): boolean {
  const { weekday, minutes } = localTimeParts(date, timezone);
  const today = hoursForDay(hours, weekday);
  if (!today) return false;
  const start = toMinutes(today.start);
  const end = toMinutes(today.end);
  if (end <= start) return minutes >= start || minutes < end;
  return minutes >= start && minutes < end;
}


/** True when the instant falls inside a recurring weekly window (which may wrap past Sunday). */
export function isWithinWeeklyWindow(date: Date, window: WeeklyWindow, timezone: string): boolean {
  const { weekday, minutes } = localTimeParts(date, timezone);
  const at = weekday * 1440 + minutes;
  const from = window.fromDay * 1440 + toMinutes(window.fromTime);
  const until = window.untilDay * 1440 + toMinutes(window.untilTime);
  if (from === until) return false;
  if (from < until) return at >= from && at < until;
  return at >= from || at < until; // wraps around the end of the week
}

