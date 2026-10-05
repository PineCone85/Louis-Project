import type { EmailAccount } from "@/lib/db/schema";
import { getValidAccessToken } from "@/lib/email/accounts";

export const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

/**
 * Immutable ids keep a message's id stable when Outlook moves it between
 * folders (for example when a sent draft lands in Sent Items, or when the
 * agent archives a message), so the ids stored in the CRM stay valid.
 */
const IMMUTABLE_IDS = 'IdType="ImmutableId"';

/** Properties fetched for each message. internetMessageHeaders is only returned when selected explicitly. */
export const MESSAGE_SELECT =
  "id,conversationId,subject,bodyPreview,body,from,sender,toRecipients,ccRecipients,receivedDateTime,sentDateTime,internetMessageId,internetMessageHeaders,hasAttachments,isDraft,parentFolderId";

export class GraphApiError extends Error {
  status: number;
  code: string | undefined;
  retryAfterSeconds: number | undefined;
  constructor(status: number, message: string, code?: string, retryAfterSeconds?: number) {
    super(message);
    this.name = "GraphApiError";
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
  /**
   * The delta token is no longer valid and a full re-enumeration is required.
   * Graph answers 410 Gone or, for Outlook folders, 400 with a sync-state error code.
   */
  get resyncRequired(): boolean {
    return this.status === 410 || /syncstate|resync/i.test(this.code ?? "");
  }
  /** Client errors that mean a referenced message id cannot be used (missing, malformed or foreign). */
  get badReference(): boolean {
    return this.status === 404 || (this.status === 400 && /malformed|invalidid|itemnotfound/i.test(this.code ?? ""));
  }
}

export type GraphRecipient = { emailAddress?: { name?: string | null; address?: string | null } };
export type GraphHeader = { name: string; value: string };
export type GraphBody = { contentType?: string; content?: string };
export type GraphMessage = {
  id: string;
  conversationId?: string | null;
  subject?: string | null;
  bodyPreview?: string | null;
  body?: GraphBody | null;
  from?: GraphRecipient | null;
  sender?: GraphRecipient | null;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  receivedDateTime?: string | null;
  sentDateTime?: string | null;
  internetMessageId?: string | null;
  internetMessageHeaders?: GraphHeader[] | null;
  hasAttachments?: boolean;
  isDraft?: boolean;
  parentFolderId?: string | null;
};
export type GraphAttachment = {
  "@odata.type"?: string;
  id: string;
  name?: string | null;
  contentType?: string | null;
  size?: number | null;
  isInline?: boolean;
};
export type DeltaStub = { id: string; receivedDateTime?: string; "@removed"?: { reason?: string } };
export type DeltaPage = { value: DeltaStub[]; nextLink?: string; deltaLink?: string };
export type GraphSubscription = { id: string; expirationDateTime: string; resource?: string; clientState?: string };
export type MailFolder = "inbox" | "sentitems";

type RawPage<T> = { value?: T[]; "@odata.nextLink"?: string; "@odata.deltaLink"?: string };

export type DraftMessageInput = {
  subject: string;
  body: { contentType: "html" | "text"; content: string };
  toRecipients: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
};

/** Escapes a value for use inside an OData string literal. */
export function odataString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export class GraphClient {
  private account: EmailAccount;
  private token: string | null = null;

  constructor(account: EmailAccount) {
    this.account = account;
  }

  private async request<T>(pathOrUrl: string, init: RequestInit & { prefer?: string } = {}, attempt = 0): Promise<T> {
    this.token ??= await getValidAccessToken(this.account);
    const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `${GRAPH_BASE}${pathOrUrl}`;
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        Prefer: init.prefer ? `${init.prefer}, ${IMMUTABLE_IDS}` : IMMUTABLE_IDS,
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });
    if (response.status === 429 || response.status === 503) {
      const retryAfter = Number(response.headers.get("retry-after") ?? "0");
      if (attempt === 0 && retryAfter > 0 && retryAfter <= 8) {
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
        return this.request<T>(pathOrUrl, init, attempt + 1);
      }
      throw new GraphApiError(response.status, "Microsoft Graph is throttling requests. Try again shortly.", "throttled", retryAfter || undefined);
    }
    if (response.status === 202 || response.status === 204) return undefined as T;
    const json = (await response.json().catch(() => ({}))) as T & { error?: { code?: string; message?: string } };
    if (!response.ok) {
      throw new GraphApiError(response.status, json.error?.message ?? `Microsoft Graph error ${response.status}`, json.error?.code);
    }
    return json;
  }

  async getProfile(): Promise<{ emailAddress: string; displayName: string | null }> {
    const json = await this.request<{ mail?: string | null; userPrincipalName?: string | null; displayName?: string | null }>(
      "/me?$select=mail,userPrincipalName,displayName",
    );
    return { emailAddress: (json.mail ?? json.userPrincipalName ?? "").toLowerCase(), displayName: json.displayName ?? null };
  }

  /**
   * Builds the URL that starts a fresh delta enumeration of a folder, optionally limited to recent
   * mail. A filtered delta returns at most 5,000 messages, so the newest come first.
   */
  initialDeltaUrl(folder: MailFolder, since?: Date): string {
    const base = `${GRAPH_BASE}/me/mailFolders/${folder}/messages/delta?$select=id,receivedDateTime`;
    if (!since) return base;
    const stamp = since.toISOString().replace(/\.\d{3}Z$/, "Z");
    return `${base}&$filter=${encodeURIComponent(`receivedDateTime ge ${stamp}`)}&$orderby=${encodeURIComponent("receivedDateTime desc")}`;
  }

  /** Small pages so that a page always fits the shortest sync budget and progress is persisted often. */
  static readonly DELTA_PAGE_SIZE = 15;

  async delta(url: string): Promise<DeltaPage> {
    const json = await this.request<RawPage<DeltaStub>>(url, { prefer: `odata.maxpagesize=${GraphClient.DELTA_PAGE_SIZE}` });
    return { value: json.value ?? [], nextLink: json["@odata.nextLink"], deltaLink: json["@odata.deltaLink"] };
  }

  /** Plain listing used as a fallback when the delta date filter is unavailable. */
  async listRecent(folder: MailFolder, since: Date, url?: string): Promise<{ value: DeltaStub[]; nextLink?: string }> {
    const target =
      url ??
      `${GRAPH_BASE}/me/mailFolders/${folder}/messages?$select=id,receivedDateTime&$filter=${encodeURIComponent(`receivedDateTime ge ${since.toISOString()}`)}&$orderby=receivedDateTime%20desc&$top=50`;
    const json = await this.request<RawPage<DeltaStub>>(target);
    return { value: json.value ?? [], nextLink: json["@odata.nextLink"] };
  }

  getMessage(id: string): Promise<GraphMessage> {
    return this.request<GraphMessage>(`/me/messages/${encodeURIComponent(id)}?$select=${MESSAGE_SELECT}`);
  }

  async listAttachments(messageId: string): Promise<GraphAttachment[]> {
    const json = await this.request<RawPage<GraphAttachment>>(
      `/me/messages/${encodeURIComponent(messageId)}/attachments?$select=id,name,contentType,size,isInline`,
    );
    return json.value ?? [];
  }

  /** Streams the raw bytes of a file attachment. */
  async getAttachmentContent(messageId: string, attachmentId: string): Promise<Response> {
    this.token ??= await getValidAccessToken(this.account);
    const response = await fetch(
      `${GRAPH_BASE}/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}/$value`,
      { headers: { Authorization: `Bearer ${this.token}`, Prefer: IMMUTABLE_IDS }, cache: "no-store" },
    );
    if (!response.ok) throw new GraphApiError(response.status, `Unable to download the attachment (${response.status})`);
    return response;
  }

  createDraft(message: DraftMessageInput): Promise<GraphMessage> {
    return this.request<GraphMessage>("/me/messages", { method: "POST", body: JSON.stringify(message) });
  }

  /** Creates a reply draft carrying the correct threading headers for the given message. */
  createReplyDraft(messageId: string): Promise<GraphMessage> {
    return this.request<GraphMessage>(`/me/messages/${encodeURIComponent(messageId)}/createReply`, { method: "POST" });
  }

  updateDraft(id: string, patch: Partial<DraftMessageInput>): Promise<GraphMessage> {
    return this.request<GraphMessage>(`/me/messages/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
  }

  sendDraft(id: string): Promise<void> {
    return this.request<void>(`/me/messages/${encodeURIComponent(id)}/send`, { method: "POST" });
  }

  /** Looks up a message by its RFC 5322 Message-ID, used to find the sent copy of a draft. */
  async findByInternetMessageId(internetMessageId: string): Promise<GraphMessage[]> {
    const json = await this.request<RawPage<GraphMessage>>(
      `/me/messages?$filter=${encodeURIComponent(`internetMessageId eq ${odataString(internetMessageId)}`)}&$select=id,conversationId,internetMessageId,isDraft,parentFolderId`,
    );
    return json.value ?? [];
  }

  createSubscription(input: {
    resource: string;
    notificationUrl: string;
    clientState: string;
    expirationDateTime: Date;
    lifecycleNotificationUrl?: string;
  }): Promise<GraphSubscription> {
    return this.request<GraphSubscription>("/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        changeType: "created",
        notificationUrl: input.notificationUrl,
        lifecycleNotificationUrl: input.lifecycleNotificationUrl,
        resource: input.resource,
        expirationDateTime: input.expirationDateTime.toISOString(),
        clientState: input.clientState,
      }),
    });
  }

  renewSubscription(id: string, expirationDateTime: Date): Promise<GraphSubscription> {
    return this.request<GraphSubscription>(`/subscriptions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ expirationDateTime: expirationDateTime.toISOString() }),
    });
  }

  deleteSubscription(id: string): Promise<void> {
    return this.request<void>(`/subscriptions/${encodeURIComponent(id)}`, { method: "DELETE" });
  }
}
