import { describe, expect, it } from "vitest";
import type { GmailMessage } from "@/lib/gmail/client";
import { buildMimeMessage, decodeBase64Url, parseGmailMessage } from "@/lib/gmail/mime";
import { withReplyAbove } from "@/lib/outlook/send";

const b64url = (bytes: Buffer) => bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

describe("Gmail body charsets", () => {
  it("decodes parts in the charset their Content-Type declares", () => {
    // "Café – it’s fine" in windows-1252.
    const cp1252 = Buffer.from([0x43, 0x61, 0x66, 0xe9, 0x20, 0x96, 0x20, 0x69, 0x74, 0x92, 0x73, 0x20, 0x66, 0x69, 0x6e, 0x65]);
    const message: GmailMessage = {
      id: "m1",
      threadId: "t1",
      payload: {
        mimeType: "text/plain",
        headers: [
          { name: "From", value: "a@example.com" },
          { name: "Content-Type", value: 'text/plain; charset="windows-1252"' },
        ],
        body: { data: b64url(cp1252) },
      },
    };
    expect(parseGmailMessage(message).text).toBe("Café – it’s fine");
  });

  it("keeps UTF-8 as the default and survives unknown charset labels", () => {
    const data = b64url(Buffer.from("Zoë", "utf8"));
    expect(decodeBase64Url(data)).toBe("Zoë");
    expect(decodeBase64Url(data, "x-unknown-charset")).toBe("Zoë");
  });
});

describe("outgoing MIME address headers", () => {
  it("encodes non-ASCII display names and strips line breaks", () => {
    const raw = buildMimeMessage({
      from: { name: "José Agent", address: "jose@example.com" },
      to: [{ name: "Zoë\r\nBcc: evil@example.com", address: "zoe@example.com" }],
      cc: [{ name: "Doe, Jane", address: "jane@example.com" }],
      subject: "Hi",
      text: "Hello",
    });
    const headers = raw.split("\r\n\r\n")[0];
    expect(headers).toContain(`From: =?UTF-8?B?${Buffer.from("José Agent").toString("base64")}?= <jose@example.com>`);
    expect(headers).not.toMatch(/^Bcc:/m);
    expect(headers).toMatch(/^To: =\?UTF-8\?B\?.+\?= <zoe@example.com>$/m);
    expect(headers).toContain('Cc: "Doe, Jane" <jane@example.com>');
    expect(/^[\x00-\x7F]*$/.test(headers)).toBe(true);
  });
});

describe("Outlook reply body", () => {
  it("inserts the reply inside the quoted document's body", () => {
    const quoted = '<html><head><meta charset="utf-8"></head><body dir="ltr"><div id="divRplyFwdMsg">original</div></body></html>';
    const merged = withReplyAbove(quoted, "<p>Yes</p>");
    expect(merged).toBe('<html><head><meta charset="utf-8"></head><body dir="ltr"><p>Yes</p><br><div id="divRplyFwdMsg">original</div></body></html>');
  });

  it("prepends when the quote is a fragment", () => {
    expect(withReplyAbove("<div>quoted</div>", "<p>Yes</p>")).toBe("<p>Yes</p><br><div>quoted</div>");
  });
});
