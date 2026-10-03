import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getEmailAccount, listEmailAccounts } from "@/lib/email/accounts";
import { GmailClient } from "@/lib/gmail/client";
import { GraphClient } from "@/lib/outlook/client";
import { getMessage } from "@/lib/queries/messages";

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

  // Legacy rows have no account link; they came from the first Gmail connection.
  const account = message.accountId
    ? await getEmailAccount(message.accountId)
    : ((await listEmailAccounts()).find((a) => a.provider === "gmail") ?? null);
  if (!account) return NextResponse.json({ error: "The mailbox for this message is no longer connected" }, { status: 409 });

  const safeName = attachment.filename.replace(/[^\w.\- ]+/g, "_");
  const inline = /^(image\/|application\/pdf)/.test(attachment.mimeType);
  const headers: Record<string, string> = {
    "Content-Type": attachment.mimeType || "application/octet-stream",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"`,
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  };

  if (account.provider === "gmail") {
    const data = await new GmailClient(account).getAttachment(message.externalId, attachmentId);
    const bytes = Buffer.from(data.data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    return new NextResponse(new Uint8Array(bytes), { headers: { ...headers, "Content-Length": String(bytes.length) } });
  }

  const upstream = await new GraphClient(account).getAttachmentContent(message.externalId, attachmentId);
  return new NextResponse(upstream.body, { headers });
}
