import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseWhatsAppWebhook, verifyWhatsAppSignature } from "@/lib/whatsapp/webhook";

describe("verifyWhatsAppSignature", () => {
  beforeEach(() => {
    process.env.WHATSAPP_APP_SECRET = "top-secret";
  });
  afterEach(() => {
    delete process.env.WHATSAPP_APP_SECRET;
  });

  it("accepts a valid signature and rejects tampering", () => {
    const body = JSON.stringify({ hello: "world" });
    const signature = `sha256=${createHmac("sha256", "top-secret").update(body).digest("hex")}`;
    expect(verifyWhatsAppSignature(body, signature)).toBe(true);
    expect(verifyWhatsAppSignature(body + " ", signature)).toBe(false);
    expect(verifyWhatsAppSignature(body, "sha256=deadbeef")).toBe(false);
    expect(verifyWhatsAppSignature(body, null)).toBe(false);
  });
});

describe("parseWhatsAppWebhook", () => {
  it("extracts messages, contacts and statuses", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { phone_number_id: "123" },
                contacts: [{ wa_id: "27821234567", profile: { name: "Jane" } }],
                messages: [
                  { id: "wamid.1", from: "27821234567", timestamp: "1700000000", type: "text", text: { body: "Hello" } },
                  { id: "wamid.2", from: "27821234567", timestamp: "1700000001", type: "image", image: { id: "media1", mime_type: "image/jpeg", caption: "Front" } },
                  { id: "wamid.3", from: "27821234567", timestamp: "1700000002", type: "location", location: { latitude: -33.9, longitude: 18.4, name: "Cape Town" } },
                ],
                statuses: [{ id: "wamid.out", status: "delivered", timestamp: "1700000003", recipient_id: "27821234567" }],
              },
            },
          ],
        },
      ],
    };
    const parsed = parseWhatsAppWebhook(payload);
    expect(parsed.phoneNumberIds).toEqual(["123"]);
    expect(parsed.messages).toHaveLength(3);
    expect(parsed.messages[0]).toMatchObject({ id: "wamid.1", from: "27821234567", profileName: "Jane", type: "text", text: "Hello", media: null });
    expect(parsed.messages[1].media).toMatchObject({ id: "media1", mimeType: "image/jpeg", caption: "Front" });
    expect(parsed.messages[2].text).toContain("Cape Town");
    expect(parsed.messages[0].timestamp.getTime()).toBe(1700000000000);
    expect(parsed.statuses[0]).toMatchObject({ id: "wamid.out", status: "delivered", recipientId: "27821234567", error: null });
  });

  it("ignores unrelated payloads", () => {
    expect(parseWhatsAppWebhook({ object: "page" })).toEqual({ messages: [], statuses: [], phoneNumberIds: [] });
    expect(parseWhatsAppWebhook(null)).toEqual({ messages: [], statuses: [], phoneNumberIds: [] });
  });
});
