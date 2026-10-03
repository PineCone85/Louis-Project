import type { EmailAttachment } from "@/lib/db/schema";
import { normalizeEmail, type ParsedAddress } from "@/lib/email-address";
import { htmlToText } from "@/lib/email/html";
import type { ParsedEmail } from "@/lib/email/types";
import type { GraphAttachment, GraphMessage, GraphRecipient } from "./client";

function toAddress(recipient: GraphRecipient | null | undefined): ParsedAddress | null {
  const address = normalizeEmail(recipient?.emailAddress?.address);
  if (!address) return null;
  const name = recipient?.emailAddress?.name?.trim() || null;
  return { name: name && name.toLowerCase() !== address ? name : null, address };
}

function toAddresses(recipients: GraphRecipient[] | undefined): ParsedAddress[] {
  return (recipients ?? []).map(toAddress).filter((a): a is ParsedAddress => a !== null);
}

export function parseGraphAttachments(attachments: GraphAttachment[]): EmailAttachment[] {
  return attachments
    .filter((a) => (a["@odata.type"] ?? "").endsWith("fileAttachment") && !a.isInline)
    .map((a) => ({
      attachmentId: a.id,
      filename: a.name?.trim() || "attachment",
      mimeType: a.contentType || "application/octet-stream",
      size: a.size ?? 0,
    }));
}

/** Converts a Microsoft Graph message into the provider-neutral shape used by ingestion. */
export function parseGraphMessage(message: GraphMessage, attachments: GraphAttachment[], folder: "inbox" | "sent"): ParsedEmail {
  const headers: Record<string, string> = {};
  for (const header of message.internetMessageHeaders ?? []) {
    if (header?.name) headers[header.name.toLowerCase()] = header.value ?? "";
  }
  const contentType = (message.body?.contentType ?? "html").toLowerCase();
  const content = message.body?.content ?? "";
  const html = contentType === "html" && content ? content : null;
  const text = contentType === "text" ? content.trim() : html ? htmlToText(html) : "";
  const stamp = folder === "sent" ? (message.sentDateTime ?? message.receivedDateTime) : (message.receivedDateTime ?? message.sentDateTime);
  const sentAt = stamp ? new Date(stamp) : new Date();

  return {
    id: message.id,
    threadId: message.conversationId ?? message.id,
    labelIds: folder === "sent" ? ["SENT"] : ["INBOX"],
    headers,
    from: toAddress(message.from ?? message.sender),
    to: toAddresses(message.toRecipients),
    cc: toAddresses(message.ccRecipients),
    subject: message.subject ?? "",
    snippet: (message.bodyPreview ?? "").replace(/\s+/g, " ").trim(),
    text,
    html,
    attachments: parseGraphAttachments(attachments),
    messageIdHeader: message.internetMessageId ?? headers["message-id"] ?? null,
    inReplyTo: headers["in-reply-to"] ?? null,
    references: headers.references ?? null,
    sentAt: Number.isNaN(sentAt.getTime()) ? new Date() : sentAt,
  };
}
