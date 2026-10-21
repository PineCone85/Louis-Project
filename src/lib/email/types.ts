import type { EmailAttachment, EmailProvider } from "@/lib/db/schema";
import type { ParsedAddress } from "@/lib/email-address";

/**
 * Provider-neutral representation of an email, produced by the Gmail,
 * Outlook and IMAP parsers and consumed by the shared ingestion pipeline.
 */
export type ParsedEmail = {
  /** Provider message id (Gmail message id, Graph message id, or an IMAP folder and UID). */
  id: string;
  /** Provider conversation id (Gmail threadId or Graph conversationId; for IMAP, the Message-ID that started the thread). */
  threadId: string;
  /** Folder markers. "INBOX" and "SENT" are the ones the pipeline cares about. */
  labelIds: string[];
  /** Lower-cased header name to value. */
  headers: Record<string, string>;
  from: ParsedAddress | null;
  to: ParsedAddress[];
  cc: ParsedAddress[];
  subject: string;
  snippet: string;
  text: string;
  html: string | null;
  attachments: EmailAttachment[];
  messageIdHeader: string | null;
  inReplyTo: string | null;
  references: string | null;
  sentAt: Date;
};

export const EMAIL_PROVIDERS: Array<{ key: EmailProvider; label: string; description: string }> = [
  { key: "gmail", label: "Gmail", description: "Google Workspace or a personal Gmail address." },
  { key: "outlook", label: "Outlook", description: "Microsoft 365, Exchange Online or a personal Outlook.com address." },
  {
    key: "imap",
    label: "Mail server",
    description: "Any other email address, such as one hosted with your domain or web host (xneelo, Afrihost, cPanel), using IMAP and SMTP.",
  },
];

export function providerLabel(provider: string): string {
  return EMAIL_PROVIDERS.find((p) => p.key === provider)?.label ?? provider;
}

/** Minimal account descriptor passed to client components. */
export type EmailAccountOption = { id: string; provider: EmailProvider; emailAddress: string };
