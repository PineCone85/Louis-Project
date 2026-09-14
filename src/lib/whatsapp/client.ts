import { env } from "@/lib/env";

export class WhatsAppApiError extends Error {
  code: number | undefined;
  subcode: number | undefined;
  details: string | undefined;
  constructor(message: string, code?: number, subcode?: number, details?: string) {
    super(message);
    this.name = "WhatsAppApiError";
    this.code = code;
    this.subcode = subcode;
    this.details = details;
  }
  /** Meta error 131047: the 24-hour customer service window has closed. */
  get outsideWindow(): boolean {
    return this.code === 131047;
  }
}

function graphUrl(path: string): string {
  return `https://graph.facebook.com/${env.whatsapp.apiVersion}/${path}`;
}

function accessToken(): string {
  const token = env.whatsapp.accessToken;
  if (!token) throw new WhatsAppApiError("WhatsApp is not configured. Add the WhatsApp environment variables.");
  return token;
}

function phoneNumberId(): string {
  const id = env.whatsapp.phoneNumberId;
  if (!id) throw new WhatsAppApiError("WHATSAPP_PHONE_NUMBER_ID is not configured.");
  return id;
}

async function graphRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(graphUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  const json = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string; code?: number; error_subcode?: number; error_data?: { details?: string }; error_user_msg?: string };
  };
  if (!response.ok || json.error) {
    const err = json.error;
    const message = err?.error_user_msg ?? err?.error_data?.details ?? err?.message ?? `WhatsApp API error ${response.status}`;
    throw new WhatsAppApiError(message, err?.code, err?.error_subcode, err?.error_data?.details);
  }
  return json;
}

type SendResponse = { messages?: Array<{ id: string }>; contacts?: Array<{ wa_id: string }> };

export async function sendTextMessage(toWaId: string, body: string): Promise<{ messageId: string }> {
  const json = await graphRequest<SendResponse>(`${phoneNumberId()}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toWaId,
      type: "text",
      text: { preview_url: true, body },
    }),
  });
  const id = json.messages?.[0]?.id;
  if (!id) throw new WhatsAppApiError("WhatsApp did not return a message id.");
  return { messageId: id };
}

export type TemplateComponent = {
  type: "header" | "body" | "button";
  sub_type?: string;
  index?: string;
  parameters: Array<{ type: "text"; text: string } | { type: "payload"; payload: string }>;
};

export async function sendTemplateMessage(
  toWaId: string,
  template: { name: string; language: string; components?: TemplateComponent[] },
): Promise<{ messageId: string }> {
  const json = await graphRequest<SendResponse>(`${phoneNumberId()}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toWaId,
      type: "template",
      template: {
        name: template.name,
        language: { code: template.language },
        ...(template.components && template.components.length > 0 ? { components: template.components } : {}),
      },
    }),
  });
  const id = json.messages?.[0]?.id;
  if (!id) throw new WhatsAppApiError("WhatsApp did not return a message id.");
  return { messageId: id };
}

export async function markMessageRead(waMessageId: string): Promise<void> {
  await graphRequest(`${phoneNumberId()}/messages`, {
    method: "POST",
    body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: waMessageId }),
  }).catch(() => undefined);
}

export type MediaInfo = { url: string; mime_type: string; sha256: string; file_size: number; id: string };

export async function getMediaInfo(mediaId: string): Promise<MediaInfo> {
  return graphRequest<MediaInfo>(`${encodeURIComponent(mediaId)}?phone_number_id=${encodeURIComponent(phoneNumberId())}`);
}

export async function downloadMedia(url: string): Promise<Response> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken()}` }, cache: "no-store" });
  if (!response.ok) throw new WhatsAppApiError(`Unable to download media (${response.status})`);
  return response;
}

export type PhoneNumberInfo = {
  id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating?: string;
  code_verification_status?: string;
  platform_type?: string;
};

export async function getPhoneNumberInfo(): Promise<PhoneNumberInfo> {
  return graphRequest<PhoneNumberInfo>(
    `${phoneNumberId()}?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type`,
  );
}

export type MessageTemplate = {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components: Array<{
    type: string;
    format?: string;
    text?: string;
    example?: { body_text?: string[][]; header_text?: string[] };
    buttons?: Array<{ type: string; text: string; url?: string; example?: string[] }>;
  }>;
};

export async function listApprovedTemplates(): Promise<MessageTemplate[]> {
  const wabaId = env.whatsapp.businessAccountId;
  if (!wabaId) throw new WhatsAppApiError("WHATSAPP_BUSINESS_ACCOUNT_ID is not configured.");
  const json = await graphRequest<{ data?: MessageTemplate[] }>(
    `${wabaId}/message_templates?fields=id,name,status,category,language,components&limit=100`,
  );
  return (json.data ?? []).filter((template) => template.status === "APPROVED");
}

/** Counts the {{n}} placeholders in a template body. */
export function countTemplateParameters(template: MessageTemplate): { header: number; body: number } {
  let header = 0;
  let body = 0;
  for (const component of template.components) {
    const matches = component.text?.match(/\{\{\d+\}\}/g)?.length ?? 0;
    if (component.type === "HEADER" && component.format === "TEXT") header = matches;
    if (component.type === "BODY") body = matches;
  }
  return { header, body };
}

export function renderTemplatePreview(template: MessageTemplate, headerParams: string[], bodyParams: string[]): string {
  const fill = (text: string | undefined, params: string[]) =>
    (text ?? "").replace(/\{\{(\d+)\}\}/g, (_, n: string) => params[Number(n) - 1] ?? `{{${n}}}`);
  const parts: string[] = [];
  for (const component of template.components) {
    if (component.type === "HEADER" && component.format === "TEXT") parts.push(fill(component.text, headerParams));
    if (component.type === "BODY") parts.push(fill(component.text, bodyParams));
    if (component.type === "FOOTER" && component.text) parts.push(component.text);
  }
  return parts.join("\n\n");
}
