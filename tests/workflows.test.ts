import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import type { Client, Property, Settings } from "@/lib/db/schema";
import { DEFAULT_STAGES } from "@/lib/pipeline";
import { buildContext, conditionsMatch, describeEvent, evaluateCondition, renderContextTemplate } from "@/lib/workflows/context";
import { requiredBedrooms, scoreClientForProperty } from "@/lib/workflows/matching";
import { actionsForTrigger, fieldsForTrigger } from "@/lib/workflows/types";

const settings = { agentName: "Sam Naidoo", agencyName: "Harbourview", agentPhone: "+27825550100", currency: "ZAR", timezone: "Africa/Johannesburg" } as Settings;

function client(overrides: Partial<Client> = {}): Client {
  return {
    id: "c1",
    firstName: "Thandi",
    lastName: "Mokoena",
    email: "thandi@example.com",
    alternateEmail: null,
    phone: "+27825550101",
    alternatePhone: null,
    clientType: "buyer",
    stage: "prospect",
    stageChangedAt: new Date(Date.now() - 3 * 86_400_000),
    source: "Website",
    budgetMin: 2_500_000,
    budgetMax: 3_200_000,
    preferredAreas: "Sea Point, Green Point",
    requirements: "2 bedrooms, secure parking, sea view",
    notes: null,
    nextFollowUpAt: null,
    lastContactAt: new Date(Date.now() - 10 * 86_400_000),
    lastInboundAt: null,
    archivedAt: null,
    createdAt: new Date(Date.now() - 30 * 86_400_000),
    updatedAt: new Date(),
    ...overrides,
  };
}

function property(overrides: Partial<Property> = {}): Property {
  return {
    id: "p1",
    title: "Sunlit two-bedroom with sea views",
    reference: "HV-2041",
    status: "available",
    propertyType: "apartment",
    listingType: "sale",
    price: 2_950_000,
    address: "12 Beach Road",
    suburb: "Sea Point",
    city: "Cape Town",
    province: null,
    postalCode: null,
    bedrooms: 2,
    bathrooms: 2,
    parking: 1,
    floorSize: 85,
    erfSize: null,
    description: "Uninterrupted sea views over the promenade.",
    features: "Sea views, balcony, basement parking",
    listingUrl: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("workflow context and conditions", () => {
  it("flattens the event into dotted keys with labels and computed values", () => {
    const ctx = buildContext({ trigger: "client.stage_changed", client: client({ stage: "viewing" }), extra: { previous_stage: "qualified" } }, settings, DEFAULT_STAGES, "Test");
    expect(ctx["client.full_name"]).toBe("Thandi Mokoena");
    expect(ctx["client.stage_label"]).toBe("Viewing");
    expect(ctx["event.previous_stage_label"]).toBe("Qualified");
    expect(ctx["client.days_since_contact"]).toBe(10);
    expect(ctx["client.days_in_stage"]).toBe(3);
    expect(ctx["client.has_phone"]).toBe(true);
    expect(ctx["workflow.name"]).toBe("Test");
  });

  it("evaluates every operator with sensible type coercion", () => {
    const ctx = buildContext({ trigger: "property.created", property: property() }, settings, DEFAULT_STAGES, "T");
    expect(evaluateCondition({ field: "property.status", op: "eq", value: "Available" }, ctx)).toBe(true);
    expect(evaluateCondition({ field: "property.price", op: "lte", value: "3,000,000" }, ctx)).toBe(true);
    expect(evaluateCondition({ field: "property.price", op: "gt", value: "3000000" }, ctx)).toBe(false);
    expect(evaluateCondition({ field: "property.suburb", op: "contains", value: "sea" }, ctx)).toBe(true);
    expect(evaluateCondition({ field: "property.suburb", op: "in", value: "Green Point, Sea Point" }, ctx)).toBe(true);
    expect(evaluateCondition({ field: "property.province", op: "empty", value: "" }, ctx)).toBe(true);
    expect(evaluateCondition({ field: "property.features", op: "not_empty", value: "" }, ctx)).toBe(true);
    expect(evaluateCondition({ field: "property.bedrooms", op: "neq", value: "2" }, ctx)).toBe(false);
  });

  it("honours all/any matching and treats no conditions as a match", () => {
    const ctx = buildContext({ trigger: "message.received", message: { channel: "email", subject: "Viewing?", bodyText: "Can I view?", contactAddress: "a@b.c", direction: "inbound" } as never, extra: { is_new_contact: true, safe_to_reply: true } }, settings, DEFAULT_STAGES, "T");
    const yes = { field: "message.is_new_contact", op: "eq" as const, value: "true" };
    const no = { field: "message.channel", op: "eq" as const, value: "whatsapp" };
    expect(conditionsMatch([], "all", ctx)).toBe(true);
    expect(conditionsMatch([yes, no], "all", ctx)).toBe(false);
    expect(conditionsMatch([yes, no], "any", ctx)).toBe(true);
    expect(ctx["message.is_automated"]).toBe(false);
  });

  it("renders placeholders and blanks unknown ones", () => {
    const ctx = buildContext({ trigger: "property.created", property: property(), client: client() }, settings, DEFAULT_STAGES, "New listing");
    const rendered = renderContextTemplate("{{client.first_name}} ← {{property.title}} at {{property.price_formatted}} ({{nope.missing}})", ctx);
    expect(rendered.startsWith("Thandi ← Sunlit two-bedroom with sea views at R")).toBe(true);
    expect(rendered.replace(/\s/g, "")).toContain("2950000");
    expect(rendered.endsWith(" ()")).toBe(true);
    expect(describeEvent({ trigger: "property.created", property: property() }, ctx)).toContain("Sunlit");
  });

  it("offers only the fields and actions that make sense for a trigger", () => {
    expect(fieldsForTrigger("property.created").some((f) => f.key === "property.price")).toBe(true);
    expect(fieldsForTrigger("property.created").some((f) => f.key === "message.subject")).toBe(false);
    expect(fieldsForTrigger("client.stage_changed").some((f) => f.key === "event.previous_stage")).toBe(true);
    expect(actionsForTrigger("property.created").map((a) => a.key)).toContain("link_property");
    expect(actionsForTrigger("client.created").map((a) => a.key)).not.toContain("set_property_status");
  });
});

describe("client to property matching", () => {
  it("scores budget, area, bedrooms and feature fits", () => {
    const match = scoreClientForProperty(client(), property());
    expect(match).not.toBeNull();
    expect(match!.score).toBeGreaterThanOrEqual(7);
    expect(match!.reasons).toContain("within budget");
    expect(match!.reasons.some((r) => r.startsWith("in a preferred area"))).toBe(true);
    expect(match!.reasons).toContain("sea view");
  });

  it("excludes the wrong kind of client and clearly unaffordable prices", () => {
    expect(scoreClientForProperty(client({ clientType: "seller" }), property())).toBeNull();
    expect(scoreClientForProperty(client({ clientType: "buyer" }), property({ listingType: "rental" }))).toBeNull();
    expect(scoreClientForProperty(client({ budgetMax: 2_000_000 }), property({ price: 2_950_000 }))).toBeNull();
  });

  it("penalises a slightly-over-budget price instead of excluding it", () => {
    const match = scoreClientForProperty(client({ budgetMax: 2_800_000 }), property({ price: 2_950_000 }));
    expect(match).not.toBeNull();
    expect(match!.reasons).toContain("slightly over budget");
  });

  it("reads bedroom requirements from free text", () => {
    expect(requiredBedrooms("2 bedrooms, secure parking")).toBe(2);
    expect(requiredBedrooms("Three-bed family home")).toBe(3);
    expect(requiredBedrooms("Lock-up-and-go")).toBeNull();
  });
});
