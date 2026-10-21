import { simpleParser, type AddressObject, type Attachment, type ParsedMail } from "mailparser";
import type { EmailAttachment } from "@/lib/db/schema";
import { normalizeEmail, type ParsedAddress } from "@/lib/email-address";
import { htmlToText } from "@/lib/email/html";
import type { ParsedEmail } from "@/lib/email/types";

export type ImapFolderKind = "inbox" | "sent";

/**
 * IMAP has no stable message id of its own, so the CRM uses the mailbox, folder, UIDVALIDITY and UID.
 * The account id keeps ids from different mailboxes on the same server apart.
 */
export function imapExternalId(accountId: string, kind: ImapFolderKind, uidValidity: string, uid: number): string {
  return `imap:${accountId}:${kind}:${uidValidity}:${uid}`;
}

export function parseImapExternalId(id: string): { accountId: string; kind: ImapFolderKind; uidValidity: string; uid: number } | null {
  const match = /^imap:([^:]+):(inbox|sent):(\d+):(\d+)$/.exec(id);
  if (!match) return null;
  return { accountId: match[1], kind: match[2] as ImapFolderKind, uidValidity: match[3], uid: Number(match[4]) };
}

function toAddresses(value: AddressObject | AddressObject[] | undefined): ParsedAddress[] {
  const groups = Array.isArray(value) ? value : value ? [value] : [];
  const out: ParsedAddress[] = [];
  for (const entry of groups.flatMap((g) => g.value)) {
    // Group syntax ("Team: a@x, b@y;") nests its members.
    for (const member of entry.group ?? [entry]) {
      const address = normalizeEmail(member.address);
      if (!address) continue;
      const name = member.name?.trim() || null;
      out.push({ name: name && name.toLowerCase() !== address ? name : null, address });
    }
  }
  return out;
}

/** Attachments the agent would see as files: inline images referenced from the HTML body are left out. */
export function fileAttachments(mail: ParsedMail): Attachment[] {
  return mail.attachments.filter((a) => !a.related && (a.contentDisposition === "attachment" || Boolean(a.filename)));
}

/** The attachment id is its position among {@link fileAttachments}, which is stable for a given message. */
export function attachmentIdAt(index: number): string {
  return `part-${index}`;
}

function toAttachments(mail: ParsedMail): EmailAttachment[] {
  return fileAttachments(mail).map((a, index) => ({
    attachmentId: attachmentIdAt(index),
    filename: a.filename?.trim() || "attachment",
    mimeType: a.contentType || "application/octet-stream",
    size: a.size ?? a.content?.length ?? 0,
  }));
}

function headerMap(mail: ParsedMail): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const { key, line } of mail.headerLines) {
    const value = line.slice(line.indexOf(":") + 1).replace(/\r?\n[ \t]+/g, " ").trim();
    headers[key.toLowerCase()] = value;
  }
  return headers;
}

export function parseMessageSource(source: Buffer, options: { id: string; kind: ImapFolderKind; receivedAt?: Date | null }): Promise<ParsedEmail> {
  return simpleParser(source, { skipTextToHtml: true, skipImageLinks: true }).then((mail) => toParsedEmail(mail, options));
}

/** Converts a parsed MIME message into the provider-neutral shape used by ingestion. */
export function toParsedEmail(mail: ParsedMail, options: { id: string; kind: ImapFolderKind; receivedAt?: Date | null }): ParsedEmail {
  const headers = headerMap(mail);
  const html = typeof mail.html === "string" && mail.html.trim() ? mail.html : null;
  const text = mail.text?.trim() || (html ? htmlToText(html) : "");
  const references = Array.isArray(mail.references) ? mail.references.join(" ") : (mail.references ?? null);
  const messageIdHeader = mail.messageId ?? null;
  const inReplyTo = mail.inReplyTo ?? null;
  // Mail clients group a conversation under the Message-ID that started it; IMAP offers nothing better.
  const threadRoot = references?.split(/\s+/).find(Boolean) ?? inReplyTo ?? messageIdHeader ?? options.id;
  // Inbox mail is dated by its arrival at the server, like the other providers; sent mail by its Date header.
  const stamp = options.kind === "inbox" ? (options.receivedAt ?? mail.date) : (mail.date ?? options.receivedAt);
  const sentAt = stamp && !Number.isNaN(new Date(stamp).getTime()) ? new Date(stamp) : new Date();

  return {
    id: options.id,
    threadId: threadRoot,
    labelIds: options.kind === "sent" ? ["SENT"] : ["INBOX"],
    headers,
    from: toAddresses(mail.from)[0] ?? null,
    to: toAddresses(mail.to),
    cc: toAddresses(mail.cc),
    subject: mail.subject ?? "",
    snippet: text.replace(/\s+/g, " ").trim().slice(0, 200),
    text,
    html,
    attachments: toAttachments(mail),
    messageIdHeader,
    inReplyTo,
    references,
    sentAt,
  };
}
