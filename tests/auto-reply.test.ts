import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { ruleMatches } from "@/lib/auto-reply/engine";
import { hoursForDay, isWithinBusinessHours } from "@/lib/business-hours";
import type { AutoReplyRule, Message, Settings } from "@/lib/db/schema";

const settings = {
  timezone: "Africa/Johannesburg",
  businessHours: { days: [1, 2, 3, 4, 5], start: "08:00", end: "17:00" },
} as Settings;

const message = { subject: "Hello", bodyText: "Can I view?", sentAt: new Date("2026-09-14T10:00:00Z") } as Message;

function rule(overrides: Partial<AutoReplyRule>): AutoReplyRule {
  return {
    id: "r1",
    name: "Rule",
    channel: "email",
    enabled: true,
    triggerType: "away",
    keywords: [],
    applyTo: "all",
    stages: [],
    cooldownHours: 24,
    oncePerThread: true,
    templateId: "t1",
    position: 0,
    timesTriggered: 0,
    lastTriggeredAt: null,
    awayFrom: new Date("2026-09-10T00:00:00Z"),
    awayUntil: new Date("2026-09-20T00:00:00Z"),
    weekly: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const ctx = { channel: "email" as const, message, client: null, isNewContact: true, settings, safeToReply: true };

describe("away trigger", () => {
  it("matches while the away period is active", () => {
    expect(ruleMatches(rule({}), { ...ctx, now: new Date("2026-09-14T10:00:00Z") })).toBe(true);
  });

  it("does not match before it starts or after it ends", () => {
    expect(ruleMatches(rule({}), { ...ctx, now: new Date("2026-09-09T23:59:59Z") })).toBe(false);
    expect(ruleMatches(rule({}), { ...ctx, now: new Date("2026-09-20T00:00:01Z") })).toBe(false);
  });

  it("uses the message time when no explicit time is given", () => {
    expect(ruleMatches(rule({}), ctx)).toBe(true);
  });

  it("never matches without both dates", () => {
    expect(ruleMatches(rule({ awayUntil: null }), ctx)).toBe(false);
    expect(ruleMatches(rule({ awayFrom: null }), ctx)).toBe(false);
  });

  it("still respects the rule's own switch and channel", () => {
    expect(ruleMatches(rule({ enabled: false }), ctx)).toBe(false);
    expect(ruleMatches(rule({ channel: "whatsapp" }), ctx)).toBe(false);
  });
});

describe("weekly trigger", () => {
  // Friday 17:30 to Monday 08:00, Johannesburg time (UTC+2).
  const weekly = { fromDay: 5, fromTime: "17:30", untilDay: 1, untilTime: "08:00" };
  const weeklyRule = rule({ triggerType: "weekly", weekly, awayFrom: null, awayUntil: null });

  it("matches inside the window, including across the week boundary", () => {
    // Friday 2026-09-18 18:00 local = 16:00Z
    expect(ruleMatches(weeklyRule, { ...ctx, now: new Date("2026-09-18T16:00:00Z") })).toBe(true);
    // Sunday 2026-09-20 12:00 local
    expect(ruleMatches(weeklyRule, { ...ctx, now: new Date("2026-09-20T10:00:00Z") })).toBe(true);
    // Monday 2026-09-21 07:59 local
    expect(ruleMatches(weeklyRule, { ...ctx, now: new Date("2026-09-21T05:59:00Z") })).toBe(true);
  });

  it("does not match outside the window", () => {
    // Monday 08:00 local exactly is the end (exclusive)
    expect(ruleMatches(weeklyRule, { ...ctx, now: new Date("2026-09-21T06:00:00Z") })).toBe(false);
    // Wednesday midday
    expect(ruleMatches(weeklyRule, { ...ctx, now: new Date("2026-09-16T10:00:00Z") })).toBe(false);
    // Friday 17:00 local, just before it opens
    expect(ruleMatches(weeklyRule, { ...ctx, now: new Date("2026-09-18T15:00:00Z") })).toBe(false);
  });

  it("never matches without a window", () => {
    expect(ruleMatches(rule({ triggerType: "weekly", weekly: null }), ctx)).toBe(false);
  });
});

describe("per-day business hours", () => {
  const hours = { days: [1, 2, 3, 4, 5, 6], start: "08:00", end: "17:00", overrides: { "6": { start: "09:00", end: "13:00" } } };
  const tz = "Africa/Johannesburg";

  it("uses the default hours on ordinary days and the override on Saturday", () => {
    expect(hoursForDay(hours, 3)).toEqual({ start: "08:00", end: "17:00" });
    expect(hoursForDay(hours, 6)).toEqual({ start: "09:00", end: "13:00" });
    expect(hoursForDay(hours, 0)).toBeNull();
  });

  it("applies the Saturday override when checking a time", () => {
    // Saturday 2026-09-19 10:00 local (08:00Z): open under the override
    expect(isWithinBusinessHours(new Date("2026-09-19T08:00:00Z"), hours, tz)).toBe(true);
    // Saturday 14:00 local: closed on Saturdays after 13:00
    expect(isWithinBusinessHours(new Date("2026-09-19T12:00:00Z"), hours, tz)).toBe(false);
    // Wednesday 14:00 local: open under the default hours
    expect(isWithinBusinessHours(new Date("2026-09-16T12:00:00Z"), hours, tz)).toBe(true);
  });

  it("still works for settings saved before overrides existed", () => {
    const legacy = { days: [1, 2, 3, 4, 5], start: "08:00", end: "17:00" };
    expect(isWithinBusinessHours(new Date("2026-09-16T12:00:00Z"), legacy, tz)).toBe(true);
    expect(isWithinBusinessHours(new Date("2026-09-19T08:00:00Z"), legacy, tz)).toBe(false);
  });
});
