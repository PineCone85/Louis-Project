import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailAccount } from "@/lib/db/schema";
import { isAutomatedEmail } from "@/lib/gmail/mime";
import { odataString, type GraphAttachment, type GraphMessage } from "@/lib/outlook/client";
import { parseGraphMessage } from "@/lib/outlook/parse";

process.env.AUTH_SECRET ??= "test-secret-for-outlook-tests-0123456789";

const sample: GraphMessage = {
  id: "AAMk-inbox-1",
  conversationId: "AAQk-conv-1",
  subject: "Viewing on Saturday",
  bodyPreview: "Hi Sam, can we view on Saturday?",
  body: { contentType: "html", content: "<html><body><p>Hi Sam,</p><p>can we view on <b>Saturday</b>?</p></body></html>" },
  from: { emailAddress: { name: "Jane Doe", address: "Jane.Doe@Example.com" } },
  toRecipients: [{ emailAddress: { name: "Sam Agent", address: "agent@outlook.com" } }],
  ccRecipients: [{ emailAddress: { address: "partner@example.com" } }],
  receivedDateTime: "2026-09-14T07:05:00Z",
  sentDateTime: "2026-09-14T07:04:30Z",
  internetMessageId: "<abc123@example.com>",
  internetMessageHeaders: [
    { name: "In-Reply-To", value: "<prev@example.com>" },
    { name: "References", value: "<root@example.com> <prev@example.com>" },
  ],
  hasAttachments: true,
};
const attachments: GraphAttachment[] = [
  { "@odata.type": "#microsoft.graph.fileAttachment", id: "att1", name: "brochure.pdf", contentType: "application/pdf", size: 2048, isInline: false },
  { "@odata.type": "#microsoft.graph.fileAttachment", id: "att2", name: "logo.png", contentType: "image/png", size: 10, isInline: true },
  { "@odata.type": "#microsoft.graph.itemAttachment", id: "att3", name: "Forwarded", contentType: null, size: 5 },
];

describe("parseGraphMessage", () => {
  it("maps Graph messages onto the shared email shape", () => {
    const parsed = parseGraphMessage(sample, attachments, "inbox");
    expect(parsed.id).toBe("AAMk-inbox-1");
    expect(parsed.threadId).toBe("AAQk-conv-1");
    expect(parsed.labelIds).toEqual(["INBOX"]);
    expect(parsed.from).toEqual({ name: "Jane Doe", address: "jane.doe@example.com" });
    expect(parsed.to).toEqual([{ name: "Sam Agent", address: "agent@outlook.com" }]);
    expect(parsed.cc).toEqual([{ name: null, address: "partner@example.com" }]);
    expect(parsed.subject).toBe("Viewing on Saturday");
    expect(parsed.html).toContain("<b>Saturday</b>");
    expect(parsed.text).toBe("Hi Sam,\ncan we view on Saturday?");
    expect(parsed.messageIdHeader).toBe("<abc123@example.com>");
    expect(parsed.inReplyTo).toBe("<prev@example.com>");
    expect(parsed.references).toBe("<root@example.com> <prev@example.com>");
    expect(parsed.attachments).toEqual([{ attachmentId: "att1", filename: "brochure.pdf", mimeType: "application/pdf", size: 2048 }]);
    expect(parsed.sentAt.toISOString()).toBe("2026-09-14T07:05:00.000Z");
    expect(isAutomatedEmail(parsed)).toBe(false);
  });

  it("uses the sent timestamp and SENT label for sent items, and handles text bodies", () => {
    const parsed = parseGraphMessage(
      { ...sample, body: { contentType: "text", content: "Plain reply" }, internetMessageHeaders: [{ name: "Auto-Submitted", value: "auto-replied" }] },
      [],
      "sent",
    );
    expect(parsed.labelIds).toEqual(["SENT"]);
    expect(parsed.sentAt.toISOString()).toBe("2026-09-14T07:04:30.000Z");
    expect(parsed.html).toBeNull();
    expect(parsed.text).toBe("Plain reply");
    expect(isAutomatedEmail(parsed)).toBe(true);
  });

  it("escapes OData string literals", () => {
    expect(odataString("<a'b@example.com>")).toBe("'<a''b@example.com>'");
  });
});

describe("sendViaOutlook", () => {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  let account: EmailAccount;

  beforeEach(async () => {
    const { encryptSecret } = await import("@/lib/crypto");
    account = {
      id: "acc-1",
      provider: "outlook",
      emailAddress: "agent@outlook.com",
      displayName: "Sam",
      refreshTokenEnc: encryptSecret("refresh"),
      accessTokenEnc: encryptSecret("access-token"),
      accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
      scopes: "",
      syncState: {},
      watchId: null,
      watchExpiresAt: null,
      backfillCompletedAt: null,
      syncLockedAt: null,
      lastSyncAt: null,
      lastSyncError: null,
      lastSyncErrorAt: null,
      connectedAt: new Date(),
      updatedAt: new Date(),
    };
    calls.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        calls.push({ url, method, body });
        const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
        if (url.endsWith("/createReply")) {
          if (url.includes("missing")) return json({ error: { code: "ErrorItemNotFound", message: "not found" } }, 404);
          return json({ id: "draft-reply", conversationId: "conv-1", internetMessageId: "<reply@outlook.com>", body: { contentType: "html", content: "<div>quoted original</div>" } });
        }
        if (method === "PATCH") return json({ id: "draft-reply", conversationId: "conv-1", internetMessageId: "<reply@outlook.com>" });
        if (url.endsWith("/me/messages") && method === "POST") return json({ id: "draft-new", conversationId: "conv-new", internetMessageId: "<new@outlook.com>" });
        if (url.endsWith("/send")) return new Response(null, { status: 202 });
        if (url.includes("internetMessageId")) {
          // The sent copy of a reply is not visible yet; the new message already is.
          if (url.includes("reply%40outlook.com")) return json({ value: [] });
          return json({ value: [{ id: "draft-new", isDraft: true }, { id: "sent-copy", isDraft: false, conversationId: "conv-new" }] });
        }
        return json({ error: { code: "unexpected", message: `unexpected ${method} ${url}` } }, 500);
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("replies through createReply, keeps the quoted original and overrides recipients", async () => {
    const { sendViaOutlook } = await import("@/lib/outlook/send");
    const result = await sendViaOutlook(account, {
      to: [{ name: "Jane Doe", address: "jane@example.com" }],
      subject: "Re: Viewing",
      html: "<p>Yes, Saturday works.</p>",
      replyToExternalId: "AAMk-inbox-1",
    });
    expect(calls.map((c) => `${c.method} ${c.url.replace("https://graph.microsoft.com/v1.0", "")}`)).toEqual([
      "POST /me/messages/AAMk-inbox-1/createReply",
      "PATCH /me/messages/draft-reply",
      "POST /me/messages/draft-reply/send",
      expect.stringContaining("GET /me/messages?$filter=internetMessageId%20eq%20'%3Creply%40outlook.com%3E'"),
    ]);
    const patch = calls[1].body as { body: { content: string; contentType: string }; toRecipients: unknown; subject: string };
    expect(patch.body.contentType).toBe("html");
    expect(patch.body.content.startsWith("<p>Yes, Saturday works.</p>")).toBe(true);
    expect(patch.body.content).toContain("quoted original");
    expect(patch.toRecipients).toEqual([{ emailAddress: { address: "jane@example.com", name: "Jane Doe" } }]);
    expect(patch.subject).toBe("Re: Viewing");
    expect(result).toEqual({ externalId: "draft-reply", threadId: "conv-1", messageIdHeader: "<reply@outlook.com>" });
    const auth = (vi.mocked(fetch).mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(auth.Authorization).toBe("Bearer access-token");
  });

  it("falls back to a new message when the original is gone, and resolves the sent copy id", async () => {
    const { sendViaOutlook } = await import("@/lib/outlook/send");
    const result = await sendViaOutlook(account, {
      to: [{ name: null, address: "jane@example.com" }],
      cc: [{ name: "Partner", address: "partner@example.com" }],
      subject: "Hello",
      html: "<p>Hello</p>",
      replyToExternalId: "missing-id",
    });
    const sequence = calls.map((c) => `${c.method} ${c.url.replace("https://graph.microsoft.com/v1.0", "")}`);
    expect(sequence[0]).toBe("POST /me/messages/missing-id/createReply");
    expect(sequence[1]).toBe("POST /me/messages");
    expect(sequence[2]).toBe("POST /me/messages/draft-new/send");
    const draft = calls[1].body as { ccRecipients: unknown };
    expect(draft.ccRecipients).toEqual([{ emailAddress: { address: "partner@example.com", name: "Partner" } }]);
    expect(result).toEqual({ externalId: "sent-copy", threadId: "conv-new", messageIdHeader: "<new@outlook.com>" });
  });
});
