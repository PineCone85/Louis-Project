import { describe, expect, it } from "vitest";
import { renderTemplate, withSignature } from "@/lib/auto-reply/render";
import { isWithinBusinessHours } from "@/lib/business-hours";
import { ruleMatches } from "@/lib/auto-reply/engine";
import type { AutoReplyRule, Client, Message, Settings } from "@/lib/db/schema";

const settings = { agentName: "Sam Agent", agencyName: "Foyer Estates", agentPhone: "+27821234567" };

describe("renderTemplate", () => {
  it("fills placeholders from the client and settings", () => {
    const out = renderTemplate("Hi {{first_name}}, this is {{agent_name}} from {{agency_name}} ({{agent_phone}}). {{unknown}}", {
      client: { firstName: "Jane", lastName: "Doe" },
      settings,
    });
    expect(out).toBe("Hi Jane, this is Sam Agent from Foyer Estates (+27821234567). {{unknown}}");
  });

  it("falls back for unknown contacts", () => {
    expect(renderTemplate("Hi {{first_name}} / {{full_name}}", { client: null, contactName: null, settings })).toBe("Hi there / there");
    expect(renderTemplate("Hi {{first_name}} / {{full_name}}", { client: null, contactName: "Peter Parker", settings })).toBe("Hi Peter / Peter Parker");
  });

  it("appends signatures once", () => {
    expect(withSignature("Body\n\n", "Sam")).toBe("Body\n\nSam");
    expect(withSignature("Body", "")).toBe("Body");
  });
});

describe("isWithinBusinessHours", () => {
  const hours = { days: [1, 2, 3, 4, 5], start: "08:00", end: "17:00" };
  it("detects weekday working hours in the configured time zone", () => {
    // 2024-06-12 is a Wednesday. 10:00 in Johannesburg is 08:00 UTC.
    expect(isWithinBusinessHours(new Date("2024-06-12T08:00:00Z"), hours, "Africa/Johannesburg")).toBe(true);
    // 19:00 Johannesburg
    expect(isWithinBusinessHours(new Date("2024-06-12T17:00:00Z"), hours, "Africa/Johannesburg")).toBe(false);
    // Saturday
    expect(isWithinBusinessHours(new Date("2024-06-15T08:00:00Z"), hours, "Africa/Johannesburg")).toBe(false);
  });
});

function rule(overrides: Partial<AutoReplyRule>): AutoReplyRule {
  return {
    id: "r1",
    name: "Rule",
    channel: "email",
    enabled: true,
    triggerType: "any",
    keywords: [],
    applyTo: "all",
    stages: [],
    awayFrom: null,
    awayUntil: null,
    weekly: null,
    cooldownHours: 24,
    oncePerThread: true,
    templateId: "t1",
    position: 0,
    timesTriggered: 0,
    lastTriggeredAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const message = {
  subject: "Viewing request",
  bodyText: "Can I view the house on Saturday?",
  sentAt: new Date("2024-06-12T08:00:00Z"),
  threadId: "t",
  contactAddress: "jane@example.com",
} as Message;
const fullSettings = { businessHours: { days: [1, 2, 3, 4, 5], start: "08:00", end: "17:00" }, timezone: "Africa/Johannesburg" } as Settings;
const client = { stage: "viewing" } as Client;

describe("ruleMatches", () => {
  it("respects channel, enabled flag and audience", () => {
    const base = { channel: "email" as const, message, client, isNewContact: false, settings: fullSettings, safeToReply: true };
    expect(ruleMatches(rule({}), base)).toBe(true);
    expect(ruleMatches(rule({ enabled: false }), base)).toBe(false);
    expect(ruleMatches(rule({ channel: "whatsapp" }), base)).toBe(false);
    expect(ruleMatches(rule({ applyTo: "unknown" }), base)).toBe(false);
    expect(ruleMatches(rule({ applyTo: "clients" }), { ...base, client: null })).toBe(false);
  });

  it("matches keywords case-insensitively and stages", () => {
    const base = { channel: "email" as const, message, client, isNewContact: false, settings: fullSettings, safeToReply: true };
    expect(ruleMatches(rule({ triggerType: "keyword", keywords: ["saturday"] }), base)).toBe(true);
    expect(ruleMatches(rule({ triggerType: "keyword", keywords: ["sunday"] }), base)).toBe(false);
    expect(ruleMatches(rule({ stages: ["viewing"] }), base)).toBe(true);
    expect(ruleMatches(rule({ stages: ["prospect"] }), base)).toBe(false);
    expect(ruleMatches(rule({ stages: ["prospect"] }), { ...base, client: null })).toBe(false);
  });

  it("handles new-contact and outside-hours triggers", () => {
    const base = { channel: "email" as const, message, client: null, isNewContact: true, settings: fullSettings, safeToReply: true };
    expect(ruleMatches(rule({ triggerType: "new_contact" }), base)).toBe(true);
    expect(ruleMatches(rule({ triggerType: "new_contact" }), { ...base, isNewContact: false })).toBe(false);
    expect(ruleMatches(rule({ triggerType: "outside_hours" }), base)).toBe(false);
    expect(ruleMatches(rule({ triggerType: "outside_hours" }), { ...base, message: { ...message, sentAt: new Date("2024-06-12T20:00:00Z") } })).toBe(true);
  });
});
