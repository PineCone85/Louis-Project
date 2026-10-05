import type { EmailAccount } from "@/lib/db/schema";
import type { ParsedAddress } from "@/lib/email-address";
import { GraphApiError, GraphClient, type GraphMessage, type GraphRecipient } from "./client";

export type OutlookSendInput = {
  to: ParsedAddress[];
  cc?: ParsedAddress[];
  subject: string;
  html: string;
  /** Provider id of the message being replied to, when continuing a conversation. */
  replyToExternalId?: string | null;
};

export type OutlookSendResult = { externalId: string; threadId: string | null; messageIdHeader: string | null };

function toRecipients(addresses: ParsedAddress[] | undefined): GraphRecipient[] {
  return (addresses ?? []).map((a) => ({ emailAddress: { address: a.address, ...(a.name ? { name: a.name } : {}) } }));
}

/**
 * Sends through Microsoft Graph. Replies are created with createReply so that
 * Outlook sets the threading headers itself; the agent's text is placed above
 * the quoted original, as a normal mail client would.
 */
export async function sendViaOutlook(account: EmailAccount, input: OutlookSendInput): Promise<OutlookSendResult> {
  const client = new GraphClient(account);
  let draft: GraphMessage | null = null;

  if (input.replyToExternalId) {
    try {
      const reply = await client.createReplyDraft(input.replyToExternalId);
      const quoted = reply.body?.contentType?.toLowerCase() === "html" ? (reply.body?.content ?? "") : "";
      draft = await client.updateDraft(reply.id, {
        subject: input.subject,
        body: { contentType: "html", content: quoted ? `${input.html}<br>${quoted}` : input.html },
        toRecipients: toRecipients(input.to),
        ccRecipients: toRecipients(input.cc),
      });
      draft.conversationId ??= reply.conversationId;
      draft.internetMessageId ??= reply.internetMessageId;
    } catch (error) {
      // The original may have been deleted, or the id may belong to another mailbox; fall back to a fresh message.
      if (!(error instanceof GraphApiError && error.badReference)) throw error;
      draft = null;
    }
  }

  if (!draft) {
    draft = await client.createDraft({
      subject: input.subject,
      body: { contentType: "html", content: input.html },
      toRecipients: toRecipients(input.to),
      ccRecipients: toRecipients(input.cc),
    });
  }

  await client.sendDraft(draft.id);

  // The message id changes when the draft moves to Sent Items; prefer the sent copy's id when it is already there.
  let externalId = draft.id;
  const messageIdHeader = draft.internetMessageId ?? null;
  if (messageIdHeader) {
    const matches = await client.findByInternetMessageId(messageIdHeader).catch(() => []);
    const sent = matches.find((m) => !m.isDraft);
    if (sent?.id) externalId = sent.id;
  }
  return { externalId, threadId: draft.conversationId ?? null, messageIdHeader };
}
