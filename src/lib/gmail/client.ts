import type { GmailAccount } from "@/lib/db/schema";
import { getValidAccessToken } from "./account";

const BASE_URL = "https://gmail.googleapis.com/gmail/v1/users/me";

export class GmailApiError extends Error {
  status: number;
  reason: string | undefined;
  constructor(status: number, message: string, reason?: string) {
    super(message);
    this.name = "GmailApiError";
    this.status = status;
    this.reason = reason;
  }
}

export type GmailHeader = { name: string; value: string };
export type GmailPart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: GmailPart[];
};
export type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: GmailPart;
  sizeEstimate?: number;
};
export type GmailMessageRef = { id: string; threadId: string; labelIds?: string[] };
export type GmailListResponse = { messages?: GmailMessageRef[]; nextPageToken?: string; resultSizeEstimate?: number };
export type GmailHistoryResponse = {
  history?: Array<{
    id: string;
    messagesAdded?: Array<{ message: GmailMessageRef }>;
  }>;
  nextPageToken?: string;
  historyId?: string;
};
export type GmailProfile = { emailAddress: string; messagesTotal: number; threadsTotal: number; historyId: string };
export type GmailWatchResponse = { historyId: string; expiration: string };
export type GmailSendResponse = { id: string; threadId: string; labelIds?: string[] };

export class GmailClient {
  private account: GmailAccount;
  private token: string | null = null;

  constructor(account: GmailAccount) {
    this.account = account;
  }

  private async request<T>(path: string, init: RequestInit & { query?: Record<string, string | undefined> } = {}): Promise<T> {
    this.token ??= await getValidAccessToken(this.account);
    const url = new URL(`${BASE_URL}${path}`);
    for (const [key, value] of Object.entries(init.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });
    if (response.status === 204) return undefined as T;
    const json = (await response.json().catch(() => ({}))) as {
      error?: { code?: number; message?: string; errors?: Array<{ reason?: string }> };
    } & T;
    if (!response.ok) {
      const reason = json.error?.errors?.[0]?.reason;
      throw new GmailApiError(response.status, json.error?.message ?? `Gmail API error ${response.status}`, reason);
    }
    return json;
  }

  static async profileWithToken(accessToken: string): Promise<GmailProfile> {
    const response = await fetch(`${BASE_URL}/profile`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!response.ok) throw new GmailApiError(response.status, "Unable to read Gmail profile");
    return (await response.json()) as GmailProfile;
  }

  getProfile(): Promise<GmailProfile> {
    return this.request<GmailProfile>("/profile");
  }

  listMessages(params: { q?: string; labelIds?: string[]; maxResults?: number; pageToken?: string }): Promise<GmailListResponse> {
    const url = new URLSearchParams();
    if (params.q) url.set("q", params.q);
    for (const label of params.labelIds ?? []) url.append("labelIds", label);
    if (params.maxResults) url.set("maxResults", String(params.maxResults));
    if (params.pageToken) url.set("pageToken", params.pageToken);
    return this.request<GmailListResponse>(`/messages?${url.toString()}`);
  }

  getMessage(id: string, format: "full" | "metadata" | "minimal" = "full"): Promise<GmailMessage> {
    return this.request<GmailMessage>(`/messages/${encodeURIComponent(id)}`, { query: { format } });
  }

  listHistory(params: { startHistoryId: string; pageToken?: string; maxResults?: number }): Promise<GmailHistoryResponse> {
    return this.request<GmailHistoryResponse>("/history", {
      query: {
        startHistoryId: params.startHistoryId,
        historyTypes: "messageAdded",
        pageToken: params.pageToken,
        maxResults: params.maxResults ? String(params.maxResults) : undefined,
      },
    });
  }

  sendRaw(raw: string, threadId?: string): Promise<GmailSendResponse> {
    return this.request<GmailSendResponse>("/messages/send", {
      method: "POST",
      body: JSON.stringify(threadId ? { raw, threadId } : { raw }),
    });
  }

  async getAttachment(messageId: string, attachmentId: string): Promise<{ size: number; data: string }> {
    return this.request<{ size: number; data: string }>(
      `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
    );
  }

  modifyLabels(messageId: string, params: { addLabelIds?: string[]; removeLabelIds?: string[] }): Promise<GmailMessageRef> {
    return this.request<GmailMessageRef>(`/messages/${encodeURIComponent(messageId)}/modify`, {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  watch(topicName: string): Promise<GmailWatchResponse> {
    return this.request<GmailWatchResponse>("/watch", {
      method: "POST",
      body: JSON.stringify({ topicName, labelIds: ["INBOX"], labelFilterBehavior: "INCLUDE" }),
    });
  }

  stopWatch(): Promise<void> {
    return this.request<void>("/stop", { method: "POST" });
  }
}
