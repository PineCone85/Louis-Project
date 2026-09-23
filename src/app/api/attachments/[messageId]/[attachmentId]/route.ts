import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getGmailAccount } from "@/lib/gmail/account";
import { GmailClient } from "@/lib/gmail/client";
import { getMessage } from "@/lib/queries/messages";

/** Streams an email attachment from Gmail; nothing is stored in the CRM database. */
export async function GET(_request: NextRequest, context: { params: Promise<{ messageId: string; attachmentId: string }> }) {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const { messageId, attachmentId } = await context.params;

  const message = await getMessage(messageId);
  if (!message || message.channel !== "email" || !message.externalId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const attachment = (message.attachments ?? []).find((a) => a.attachmentId === attachmentId);
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const account = await getGmailAccount();
  if (!account) return NextResponse.json({ error: "Gmail is not connected" }, { status: 409 });

  const client = new GmailClient(account);
  const data = await client.getAttachment(message.externalId, attachmentId);
  const bytes = Buffer.from(data.data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const safeName = attachment.filename.replace(/[^\w.\- ]+/g, "_");
  const inline = /^(image\/|application\/pdf)/.test(attachment.mimeType);

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": attachment.mimeType || "application/octet-stream",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
