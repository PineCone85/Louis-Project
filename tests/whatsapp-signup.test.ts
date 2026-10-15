import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WhatsAppAccount } from "@/lib/db/schema";

process.env.AUTH_SECRET ??= "test-secret-for-whatsapp-tests-0123456789";
process.env.WHATSAPP_APP_ID = "app-1";
process.env.WHATSAPP_APP_SECRET = "app-secret";

const stored: { account: WhatsAppAccount | null; updates: Array<Partial<WhatsAppAccount>> } = { account: null, updates: [] };

vi.mock("@/lib/whatsapp/accounts", async () => {
  const { encryptSecret } = await import("@/lib/crypto");
  return {
    saveWhatsAppAccount: vi.fn(async (input: { phoneNumberId: string; wabaId: string; accessToken: string; coexistence: boolean; displayPhoneNumber: string | null }) => {
      stored.account = {
        id: "wa-1",
        phoneNumberId: input.phoneNumberId,
        wabaId: input.wabaId,
        displayPhoneNumber: input.displayPhoneNumber,
        verifiedName: null,
        accessTokenEnc: encryptSecret(input.accessToken),
        pinEnc: null,
        coexistence: input.coexistence,
        registeredAt: null,
        lastError: null,
        lastErrorAt: null,
        connectedAt: new Date(),
        updatedAt: new Date(),
      };
      return stored.account;
    }),
    updateWhatsAppAccount: vi.fn(async (_id: string, values: Partial<WhatsAppAccount>) => {
      stored.updates.push(values);
      Object.assign(stored.account!, values);
    }),
    getWhatsAppAccount: vi.fn(async () => stored.account),
  };
});

const calls: Array<{ url: string; method: string; body: unknown; auth: string | null }> = [];
let registerFails = false;

beforeEach(() => {
  stored.account = null;
  stored.updates.length = 0;
  calls.length = 0;
  registerFails = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null, auth: headers.Authorization ?? null });
      const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
      if (url.includes("/oauth/access_token")) return json({ access_token: "business-token" });
      if (url.includes("/phone_numbers")) return json({ data: [{ id: "111" }] });
      if (url.includes("/subscribed_apps")) return json({ success: true });
      if (url.endsWith("/register")) {
        return registerFails ? json({ error: { message: "Two-step verification PIN mismatch", code: 133005 } }, 400) : json({ success: true });
      }
      if (url.includes("/111?fields=")) return json({ id: "111", display_phone_number: "+27 82 123 4567", verified_name: "Sam Realty" });
      return json({ error: { message: `unexpected ${method} ${url}` } }, 500);
    }),
  );
});

describe("completeEmbeddedSignup", () => {
  it("exchanges the code, subscribes the app and registers the number", async () => {
    const { completeEmbeddedSignup } = await import("@/lib/whatsapp/signup");
    const result = await completeEmbeddedSignup({ code: "code-1", phoneNumberId: "111", wabaId: "222", coexistence: false });

    expect(result.warning).toBeNull();
    const exchange = new URL(calls[0].url);
    expect(exchange.searchParams.get("client_id")).toBe("app-1");
    expect(exchange.searchParams.get("code")).toBe("code-1");
    expect(calls.find((c) => c.url.includes("/222/subscribed_apps"))).toMatchObject({ method: "POST", auth: "Bearer business-token" });
    const register = calls.find((c) => c.url.endsWith("/111/register"));
    expect(register?.body).toMatchObject({ messaging_product: "whatsapp", pin: expect.stringMatching(/^\d{6}$/) });
    expect(stored.account).toMatchObject({ phoneNumberId: "111", wabaId: "222", displayPhoneNumber: "+27 82 123 4567" });
    expect(stored.account?.registeredAt).toBeInstanceOf(Date);
  });

  it("does not register numbers that stay in the WhatsApp Business app", async () => {
    const { completeEmbeddedSignup } = await import("@/lib/whatsapp/signup");
    await completeEmbeddedSignup({ code: "code-1", phoneNumberId: "111", wabaId: "222", coexistence: true });
    expect(calls.some((c) => c.url.endsWith("/register"))).toBe(false);
    expect(stored.account?.coexistence).toBe(true);
  });

  it("keeps the connection and asks for the PIN when registration is rejected", async () => {
    registerFails = true;
    const { completeEmbeddedSignup } = await import("@/lib/whatsapp/signup");
    const result = await completeEmbeddedSignup({ code: "code-1", phoneNumberId: "111", wabaId: "222", coexistence: false });
    expect(result.warning).toContain("PIN");
    expect(stored.account?.registeredAt).toBeNull();
    expect(stored.account?.lastError).toContain("Two-step verification PIN mismatch");
  });

  it("rejects a number that does not belong to the shared account", async () => {
    const { completeEmbeddedSignup } = await import("@/lib/whatsapp/signup");
    await expect(completeEmbeddedSignup({ code: "code-1", phoneNumberId: "999", wabaId: "222", coexistence: false })).rejects.toThrow(/does not belong/);
    expect(stored.account).toBeNull();
  });
});
