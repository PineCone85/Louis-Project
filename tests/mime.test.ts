import { describe, expect, it } from "vitest";
import type { GmailMessage } from "@/lib/gmail/client";
import { buildMimeMessage, buildReferences, htmlToText, isAutomatedEmail, parseGmailMessage, replySubject } from "@/lib/gmail/mime";

const b64url = (input: string) => Buffer.from(input, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function sampleMessage(overrides: Partial<GmailMessage> = {}): GmailMessage {
  return {
    id: "msg1",
    threadId: "thread1",
    labelIds: ["INBOX", "UNREAD"],
    snippet: "Hi there &amp; hello",
    internalDate: "1700000000000",
    payload: {
      mimeType: "multipart/mixed",
      headers: [
        { name: "From", value: "Jane Doe <jane@example.com>" },
        { name: "To", value: "Agent <agent@example.com>" },
        { name: "Subject", value: "Viewing on Saturday" },
        { name: "Message-ID", value: "<abc@example.com>" },
      ],
      parts: [
        {
          mimeType: "multipart/alternative",
          parts: [
            { mimeType: "text/plain", body: { data: b64url("Hi there & hello\n\nJane") } },
            { mimeType: "text/html", body: { data: b64url("<p>Hi there &amp; hello</p><p>Jane</p>") } },
          ],
        },
        { mimeType: "application/pdf", filename: "brochure.pdf", body: { attachmentId: "att1", size: 1234 } },
      ],
    },
    ...overrides,
  };
}

describe("parseGmailMessage", () => {
  it("extracts headers, bodies and attachments from nested parts", () => {
    const parsed = parseGmailMessage(sampleMessage());
    expect(parsed.from).toEqual({ name: "Jane Doe", address: "jane@example.com" });
    expect(parsed.to[0].address).toBe("agent@example.com");
    expect(parsed.subject).toBe("Viewing on Saturday");
    expect(parsed.text).toBe("Hi there & hello\n\nJane");
    expect(parsed.html).toContain("<p>Hi there");
    expect(parsed.snippet).toBe("Hi there & hello");
    expect(parsed.attachments).toEqual([{ attachmentId: "att1", filename: "brochure.pdf", mimeType: "application/pdf", size: 1234 }]);
    expect(parsed.messageIdHeader).toBe("<abc@example.com>");
    expect(parsed.sentAt.getTime()).toBe(1700000000000);
  });

  it("derives text from html when no plain part exists", () => {
    const message = sampleMessage({
      payload: {
        mimeType: "text/html",
        headers: [{ name: "From", value: "a@b.com" }],
        body: { data: b64url("<div>Line one<br>Line two</div><p>Para</p>") },
      },
    });
    expect(parseGmailMessage(message).text).toBe("Line one\nLine two\nPara");
  });
});

describe("isAutomatedEmail", () => {
  it("flags bulk, auto-submitted and no-reply senders", () => {
    const base = parseGmailMessage(sampleMessage());
    expect(isAutomatedEmail(base)).toBe(false);
    expect(isAutomatedEmail({ ...base, headers: { ...base.headers, "auto-submitted": "auto-replied" } })).toBe(true);
    expect(isAutomatedEmail({ ...base, headers: { ...base.headers, precedence: "bulk" } })).toBe(true);
    expect(isAutomatedEmail({ ...base, headers: { ...base.headers, "list-unsubscribe": "<mailto:x>" } })).toBe(true);
    expect(isAutomatedEmail({ ...base, from: { name: null, address: "no-reply@portal.com" } })).toBe(true);
    expect(isAutomatedEmail({ ...base, from: { name: null, address: "notifications@property24.com" } })).toBe(true);
  });
});

describe("buildMimeMessage", () => {
  it("produces a multipart message with threading headers and encoded subject", () => {
    const raw = buildMimeMessage({
      from: { name: "Agent", address: "agent@example.com" },
      to: [{ name: "Jane Doe", address: "jane@example.com" }],
      subject: "Re: Viewing – Saturday",
      text: "Hello Jane",
      inReplyTo: "<abc@example.com>",
      references: "<abc@example.com>",
      messageId: "<new@example.com>",
    });
    expect(raw).toContain("From: Agent <agent@example.com>");
    expect(raw).toContain("To: Jane Doe <jane@example.com>");
    expect(raw).toContain("Subject: =?UTF-8?B?");
    expect(raw).toContain("In-Reply-To: <abc@example.com>");
    expect(raw).toContain("References: <abc@example.com>");
    expect(raw).toContain('Content-Type: multipart/alternative; boundary="');
    expect(raw).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(raw).toContain('Content-Type: text/html; charset="UTF-8"');
    expect(raw).toContain(Buffer.from("Hello Jane").toString("base64"));
  });

  it("keeps plain ASCII subjects readable", () => {
    const raw = buildMimeMessage({ from: { name: null, address: "a@b.com" }, to: [{ name: null, address: "c@d.com" }], subject: "Plain", text: "x" });
    expect(raw).toContain("Subject: Plain");
  });
});

describe("helpers", () => {
  it("builds reply subjects and references", () => {
    expect(replySubject("Viewing")).toBe("Re: Viewing");
    expect(replySubject("RE: Viewing")).toBe("RE: Viewing");
    expect(replySubject("")).toBe("Re: (no subject)");
    expect(buildReferences("<a@x>", "<b@x>")).toBe("<a@x> <b@x>");
    expect(buildReferences(null, null)).toBeNull();
  });

  it("converts html to text", () => {
    expect(htmlToText("<style>p{}</style><p>Hello&nbsp;<b>world</b></p><br><p>Bye</p>")).toBe("Hello world\n\nBye");
  });
});
