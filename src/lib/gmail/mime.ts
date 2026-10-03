import type { EmailAttachment } from "@/lib/db/schema";
import { formatAddress, parseAddressList, type ParsedAddress } from "@/lib/email-address";
import { decodeEntities, escapeHtml, htmlToText, replySubject, textToHtml } from "@/lib/email/html";
import type { ParsedEmail } from "@/lib/email/types";
import type { GmailMessage, GmailPart } from "./client";

export { decodeEntities, escapeHtml, htmlToText, replySubject, textToHtml };

/** Gmail messages are parsed into the shared provider-neutral shape. */
export type ParsedGmailMessage = ParsedEmail;

// ---------------------------------------------------------------------------
// Decoding incoming messages
// ---------------------------------------------------------------------------

export function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

export function encodeBase64Url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function headerMap(headers: { name: string; value: string }[] | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  for (const header of headers ?? []) {
    map[header.name.toLowerCase()] = header.value;
  }
  return map;
}

type Collected = { text: string[]; html: string[]; attachments: EmailAttachment[] };

function walkParts(part: GmailPart | undefined, collected: Collected): void {
  if (!part) return;
  const mimeType = (part.mimeType ?? "").toLowerCase();
  const filename = part.filename ?? "";
  const body = part.body ?? {};

  if (filename && body.attachmentId) {
    collected.attachments.push({
      attachmentId: body.attachmentId,
      filename,
      mimeType: part.mimeType ?? "application/octet-stream",
      size: body.size ?? 0,
    });
    return;
  }

  if (mimeType.startsWith("multipart/")) {
    for (const child of part.parts ?? []) walkParts(child, collected);
    return;
  }

  if (mimeType === "text/plain" && body.data) {
    collected.text.push(decodeBase64Url(body.data));
    return;
  }
  if (mimeType === "text/html" && body.data) {
    collected.html.push(decodeBase64Url(body.data));
    return;
  }
  if (body.attachmentId) {
    collected.attachments.push({
      attachmentId: body.attachmentId,
      filename: filename || `attachment.${mimeType.split("/")[1] ?? "bin"}`,
      mimeType: part.mimeType ?? "application/octet-stream",
      size: body.size ?? 0,
    });
  }
  for (const child of part.parts ?? []) walkParts(child, collected);
}

export function parseGmailMessage(message: GmailMessage): ParsedGmailMessage {
  const headers = headerMap(message.payload?.headers);
  const collected: Collected = { text: [], html: [], attachments: [] };
  walkParts(message.payload, collected);

  const html = collected.html.length > 0 ? collected.html.join("\n") : null;
  const text = collected.text.length > 0 ? collected.text.join("\n") : html ? htmlToText(html) : "";
  const from = parseAddressList(headers.from)[0] ?? null;
  const internal = message.internalDate ? new Date(Number(message.internalDate)) : null;
  const headerDate = headers.date ? new Date(headers.date) : null;
  const sentAt = internal && !Number.isNaN(internal.getTime()) ? internal : headerDate && !Number.isNaN(headerDate.getTime()) ? headerDate : new Date();

  return {
    id: message.id,
    threadId: message.threadId,
    labelIds: message.labelIds ?? [],
    headers,
    from,
    to: parseAddressList(headers.to),
    cc: parseAddressList(headers.cc),
    subject: headers.subject ?? "",
    snippet: decodeEntities(message.snippet ?? ""),
    text: text.trim(),
    html,
    attachments: collected.attachments,
    messageIdHeader: headers["message-id"] ?? null,
    inReplyTo: headers["in-reply-to"] ?? null,
    references: headers.references ?? null,
    sentAt,
  };
}

/** Heuristics that identify automated mail we must never auto-reply to. */
export function isAutomatedEmail(parsed: ParsedGmailMessage): boolean {
  const h = parsed.headers;
  const autoSubmitted = (h["auto-submitted"] ?? "").toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;
  const precedence = (h.precedence ?? "").toLowerCase();
  if (["bulk", "list", "junk", "auto_reply"].includes(precedence)) return true;
  if (h["x-autoreply"] || h["x-autorespond"] || h["x-auto-response-suppress"]) return true;
  if (h["list-id"] || h["list-unsubscribe"]) return true;
  const address = parsed.from?.address ?? "";
  if (/^(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|bounce|notifications?)@/i.test(address)) return true;
  if (/(no-?reply|do-?not-?reply)/i.test(address.split("@")[0] ?? "")) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Building outgoing messages
// ---------------------------------------------------------------------------

export type OutgoingEmail = {
  from: ParsedAddress;
  to: ParsedAddress[];
  cc?: ParsedAddress[];
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string | null;
  references?: string | null;
  messageId?: string;
};

function encodeHeaderValue(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value.replace(/[\r\n]+/g, " ");
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function wrapBase64(input: string): string {
  const encoded = Buffer.from(input, "utf8").toString("base64");
  return encoded.replace(/(.{76})/g, "$1\r\n");
}

export function buildMimeMessage(email: OutgoingEmail): string {
  const boundary = `foyer_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  const html = email.html ?? textToHtml(email.text);
  const lines: string[] = [
    `From: ${formatAddress(email.from)}`,
    `To: ${email.to.map(formatAddress).join(", ")}`,
  ];
  if (email.cc && email.cc.length > 0) lines.push(`Cc: ${email.cc.map(formatAddress).join(", ")}`);
  lines.push(`Subject: ${encodeHeaderValue(email.subject)}`);
  if (email.messageId) lines.push(`Message-ID: ${email.messageId}`);
  if (email.inReplyTo) lines.push(`In-Reply-To: ${email.inReplyTo}`);
  if (email.references) lines.push(`References: ${email.references}`);
  lines.push(
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(email.text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(html),
    `--${boundary}--`,
    "",
  );
  return lines.join("\r\n");
}

export function buildReferences(existingReferences: string | null | undefined, messageId: string | null | undefined): string | null {
  const parts = [existingReferences, messageId].filter((v): v is string => Boolean(v && v.trim()));
  return parts.length > 0 ? parts.join(" ") : null;
}
