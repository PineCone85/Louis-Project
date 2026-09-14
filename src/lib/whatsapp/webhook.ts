import { createHmac, timingSafeEqual } from "node:crypto";
import type { WhatsAppMedia } from "@/lib/db/schema";
import { env } from "@/lib/env";

export function verifyWhatsAppSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = env.whatsapp.appSecret;
  if (!secret) return false;
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const provided = signatureHeader.slice("sha256=".length);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
}

export type InboundWhatsAppMessage = {
  id: string;
  from: string;
  profileName: string | null;
  timestamp: Date;
  type: string;
  text: string | null;
  media: WhatsAppMedia | null;
  contextMessageId: string | null;
};

export type WhatsAppStatusUpdate = {
  id: string;
  status: string;
  timestamp: Date;
  recipientId: string;
  error: string | null;
};

type RawMessage = {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: RawMedia;
  video?: RawMedia;
  audio?: RawMedia;
  document?: RawMedia;
  sticker?: RawMedia;
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  contacts?: Array<{ name?: { formatted_name?: string }; phones?: Array<{ phone?: string; wa_id?: string }> }>;
  button?: { text?: string; payload?: string };
  interactive?: { type?: string; button_reply?: { title?: string }; list_reply?: { title?: string; description?: string } };
  reaction?: { message_id?: string; emoji?: string };
  context?: { id?: string };
  errors?: Array<{ title?: string; message?: string }>;
};
type RawMedia = { id: string; mime_type?: string; sha256?: string; caption?: string; filename?: string };

type WebhookPayload = {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: { phone_number_id?: string; display_phone_number?: string };
        contacts?: Array<{ wa_id: string; profile?: { name?: string } }>;
        messages?: RawMessage[];
        statuses?: Array<{
          id: string;
          status: string;
          timestamp: string;
          recipient_id: string;
          errors?: Array<{ code?: number; title?: string; message?: string; error_data?: { details?: string } }>;
        }>;
      };
    }>;
  }>;
};

function toMedia(raw: RawMedia | undefined): WhatsAppMedia | null {
  if (!raw) return null;
  return {
    id: raw.id,
    mimeType: raw.mime_type ?? null,
    filename: raw.filename ?? null,
    caption: raw.caption ?? null,
    sha256: raw.sha256 ?? null,
  };
}

function describe(message: RawMessage): { text: string | null; media: WhatsAppMedia | null } {
  switch (message.type) {
    case "text":
      return { text: message.text?.body ?? "", media: null };
    case "image":
    case "video":
    case "audio":
    case "document":
    case "sticker": {
      const raw = message[message.type];
      return { text: raw?.caption ?? null, media: toMedia(raw) };
    }
    case "location": {
      const loc = message.location;
      const label = [loc?.name, loc?.address].filter(Boolean).join(", ");
      return {
        text: loc ? `Shared a location: ${label ? `${label} ` : ""}(${loc.latitude}, ${loc.longitude})` : "Shared a location",
        media: null,
      };
    }
    case "contacts": {
      const entries = (message.contacts ?? []).map((c) => {
        const phones = (c.phones ?? []).map((p) => p.phone ?? p.wa_id).filter(Boolean).join(", ");
        return [c.name?.formatted_name, phones].filter(Boolean).join(": ");
      });
      return { text: `Shared contact${entries.length === 1 ? "" : "s"}: ${entries.join("; ")}`, media: null };
    }
    case "button":
      return { text: message.button?.text ?? message.button?.payload ?? "", media: null };
    case "interactive":
      return {
        text: message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title ?? "",
        media: null,
      };
    case "reaction":
      return { text: message.reaction?.emoji ? `Reacted ${message.reaction.emoji}` : "Removed a reaction", media: null };
    default:
      return { text: message.errors?.[0]?.title ? `Unsupported message: ${message.errors[0].title}` : "Unsupported message type", media: null };
  }
}

export function parseWhatsAppWebhook(payload: unknown): {
  messages: InboundWhatsAppMessage[];
  statuses: WhatsAppStatusUpdate[];
  phoneNumberIds: string[];
} {
  const body = (payload ?? {}) as WebhookPayload;
  const messages: InboundWhatsAppMessage[] = [];
  const statuses: WhatsAppStatusUpdate[] = [];
  const phoneNumberIds: string[] = [];
  if (body.object !== "whatsapp_business_account") return { messages, statuses, phoneNumberIds };

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value || value.messaging_product !== "whatsapp") continue;
      if (value.metadata?.phone_number_id) phoneNumberIds.push(value.metadata.phone_number_id);
      const names = new Map((value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name ?? null]));
      for (const raw of value.messages ?? []) {
        const { text, media } = describe(raw);
        messages.push({
          id: raw.id,
          from: raw.from,
          profileName: names.get(raw.from) ?? null,
          timestamp: new Date(Number(raw.timestamp) * 1000),
          type: raw.type,
          text,
          media,
          contextMessageId: raw.context?.id ?? null,
        });
      }
      for (const status of value.statuses ?? []) {
        const err = status.errors?.[0];
        statuses.push({
          id: status.id,
          status: status.status,
          timestamp: new Date(Number(status.timestamp) * 1000),
          recipientId: status.recipient_id,
          error: err ? [err.title, err.error_data?.details ?? err.message].filter(Boolean).join(": ") : null,
        });
      }
    }
  }
  return { messages, statuses, phoneNumberIds };
}
