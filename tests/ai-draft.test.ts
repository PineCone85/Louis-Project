import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { parse, getConversationMessages, getClient, getClientProperties, getSettings } = vi.hoisted(() => ({
  parse: vi.fn(),
  getConversationMessages: vi.fn(),
  getClient: vi.fn(),
  getClientProperties: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status?: number;
  }
  class AuthenticationError extends APIError {}
  class RateLimitError extends APIError {}
  class Anthropic {
    static APIError = APIError;
    static AuthenticationError = AuthenticationError;
    static RateLimitError = RateLimitError;
    beta = { messages: { parse } };
  }
  return { default: Anthropic };
});
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/queries/messages", () => ({ getConversationMessages }));
vi.mock("@/lib/queries/clients", () => ({ getClient, getClientProperties }));
vi.mock("@/lib/queries/settings", () => ({ getSettings }));

import { DraftError, draftReply } from "@/lib/ai/draft";

const settings = { agentName: "Alex Dixon", agencyName: "Dixon Homes", timezone: "Africa/Johannesburg", currency: "ZAR" };
const inbound = (overrides: Record<string, unknown> = {}) => ({
  id: "m1",
  channel: "email",
  direction: "inbound",
  contactName: "Jane Buyer",
  contactAddress: "jane@example.com",
  threadId: "t1",
  subject: "Viewing on Saturday?",
  bodyText: "Hi, could I view the Sea Point flat this Saturday?",
  snippet: null,
  mediaType: null,
  isAutoReply: false,
  sentAt: new Date("2026-09-10T09:00:00Z"),
  ...overrides,
});

describe("draftReply", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    getSettings.mockResolvedValue(settings);
    getConversationMessages.mockResolvedValue([inbound()]);
    getClient.mockResolvedValue({
      firstName: "Jane",
      lastName: "Buyer",
      clientType: "buyer",
      stage: "viewing",
      budgetMin: 2000000,
      budgetMax: 3000000,
      preferredAreas: "Sea Point, Green Point",
      requirements: "2 bed with parking",
      notes: null,
      source: "Property24",
    });
    getClientProperties.mockResolvedValue([
      {
        property: { title: "Sunny 2-bed in Sea Point", reference: "SP-12", suburb: "Sea Point", city: "Cape Town", listingType: "sale", price: 2650000, status: "available", bedrooms: 2, bathrooms: 1, parking: 1 },
        link: { relationship: "interested" },
      },
    ]);
    parse.mockResolvedValue({
      stop_reason: "end_turn",
      parsed_output: { subject: "Re: Viewing", body: "Hi Jane,\n\nSaturday works. Does [confirm time] suit you?\n\nAlex", notes: "Confirm the viewing time." },
    });
  });
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("serves a canned draft in demo mode without touching the API", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.AI_DRAFT_DEMO = "true";
    try {
      const draft = await draftReply({ channel: "whatsapp", contactAddress: "+27825550102", clientId: "c2", instruction: "be brief" });
      expect(draft.body).toContain("James");
      expect(draft.notes).toContain("Demo mode");
      expect(draft.notes).toContain("be brief");
      const fallback = await draftReply({ channel: "email", contactAddress: "nobody@example.com", clientId: null });
      expect(fallback.subject).toBe("Following up");
      expect(parse).not.toHaveBeenCalled();
    } finally {
      delete process.env.AI_DRAFT_DEMO;
    }
  }, 10000);

  it("fails clearly when no API key is configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(draftReply({ channel: "email", contactAddress: "jane@example.com", clientId: "c1" })).rejects.toThrow(DraftError);
    expect(parse).not.toHaveBeenCalled();
  });

  it("builds the prompt from the client, properties and thread, and returns the draft", async () => {
    const draft = await draftReply({ channel: "email", contactAddress: "jane@example.com", clientId: "c1", instruction: "Offer 10am" });
    expect(draft.body).toContain("Saturday works");
    expect(draft.notes).toBe("Confirm the viewing time.");
    // Replying inside an existing thread keeps the thread subject, so the model's subject is dropped.
    expect(draft.subject).toBe("");

    const request = parse.mock.calls[0][0];
    expect(request.model).toBe("claude-opus-5");
    expect(request.fallbacks).toBe("default");
    expect(request.system).toContain("Alex Dixon");
    expect(request.system).toContain("Dixon Homes");
    const prompt = request.messages[0].content as string;
    expect(prompt).toContain("Name: Jane Buyer");
    expect(prompt).toContain("Sunny 2-bed in Sea Point");
    expect(prompt).toContain("could I view the Sea Point flat");
    expect(prompt).toContain("Offer 10am");
    expect(prompt).toContain("leave subject empty");
  });

  it("keeps the subject for a brand new email thread", async () => {
    getConversationMessages.mockResolvedValue([inbound({ threadId: null })]);
    const draft = await draftReply({ channel: "email", contactAddress: "jane@example.com", clientId: null });
    expect(draft.subject).toBe("Re: Viewing");
    expect(parse.mock.calls[0][0].messages[0].content).toContain("not linked to a client record");
  });

  it("surfaces a refusal as a readable error", async () => {
    parse.mockResolvedValue({ stop_reason: "refusal", parsed_output: null });
    await expect(draftReply({ channel: "whatsapp", contactAddress: "+27821234567", clientId: "c1" })).rejects.toThrow(/declined/);
  });

  it("refuses to draft when the conversation is empty", async () => {
    getConversationMessages.mockResolvedValue([]);
    await expect(draftReply({ channel: "email", contactAddress: "jane@example.com", clientId: "c1" })).rejects.toThrow(/no messages/);
  });
});
