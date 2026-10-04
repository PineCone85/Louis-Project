import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getEmailAccount, listEmailAccounts } from "@/lib/email/accounts";
import { GmailClient } from "@/lib/gmail/client";
import { GraphClient } from "@/lib/outlook/client";
import { getMessage } from "@/lib/queries/messages";

/** Only these types may render in the browser; anything else (including SVG, which can run script) is downloaded. */
const INLINE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"]);

function attachmentHeaders(mimeType: string, filename: string): Record<string, string> {
  const type = (mimeType || "application/octet-stream").toLowerCase().split(";")[0].trim();
  const inline = INLINE_TYPES.has(type);
  return {
    "Content-Type": inline ? type : "application/octet-stream",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'",
  };
}

/** Streams an email attachment from the mailbox provider; nothing is stored in the CRM database. */
export async function GET(_request: NextRequest, context: { params: Promise<{ messageId: string; attachmentId: string }> }) {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const { messageId, attachmentId } = await context.params;

  const message = await getMessage(messageId);
  if (!message || message.channel !== "email" || !message.externalId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const attachment = (message.attachments ?? []).find((a) => a.attachmentId === attachmentId);
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Rows without an account link pre-date multi-mailbox support or belong to a disconnected mailbox;
  // the id shape tells the provider apart (Gmail ids are short hex, Graph ids are long base64).
  const looksLikeGmail = /^[0-9a-f]{10,24}$/i.test(message.externalId);
  const account = message.accountId
    ? await getEmailAccount(message.accountId)
    : ((await listEmailAccounts()).find((a) => a.provider === (looksLikeGmail ? "gmail" : "outlook")) ?? null);
  if (!account) return NextResponse.json({ error: "The mailbox for this message is no longer connected" }, { status: 409 });

  const safeName = attachment.filename.replace(/[^\w.\- ]+/g, "_");
  const headers = attachmentHeaders(attachment.mimeType, safeName);

  if (account.provider === "gmail") {
    const data = await new GmailClient(account).getAttachment(message.externalId, attachmentId);
    const bytes = Buffer.from(data.data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    return new NextResponse(new Uint8Array(bytes), { headers: { ...headers, "Content-Length": String(bytes.length) } });
  }

  const upstream = await new GraphClient(account).getAttachmentContent(message.externalId, attachmentId);
  return new NextResponse(upstream.body, { headers });
}
