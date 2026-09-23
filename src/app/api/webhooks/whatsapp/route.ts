import { eq, and } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { db } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { ingestWhatsApp } from "@/lib/messaging/ingest";
import { getSettings } from "@/lib/queries/settings";
import { parseWhatsAppWebhook, verifyWhatsAppSignature } from "@/lib/whatsapp/webhook";

export const maxDuration = 60;

/** Webhook verification handshake performed by Meta when the webhook URL is saved. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token") ?? "";
  const challenge = params.get("hub.challenge") ?? "";
  const expected = env.whatsapp.verifyToken;
  if (mode === "subscribe" && expected && safeEqual(expected, token)) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!verifyWhatsAppSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const parsed = parseWhatsAppWebhook(payload);
  const ourNumber = env.whatsapp.phoneNumberId;
  if (ourNumber && parsed.phoneNumberIds.length > 0 && !parsed.phoneNumberIds.includes(ourNumber)) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  after(async () => {
    try {
      const settings = await getSettings();
      for (const message of parsed.messages) {
        await ingestWhatsApp({
          waMessageId: message.id,
          fromWaId: message.from,
          profileName: message.profileName,
          timestamp: message.timestamp,
          type: message.type,
          text: message.text,
          media: message.media,
          settings,
        });
      }
      for (const status of parsed.statuses) {
        const rank: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 4 };
        const existing = await db.query.messages.findFirst({
          where: and(eq(messages.channel, "whatsapp"), eq(messages.externalId, status.id)),
          columns: { id: true, status: true },
        });
        if (!existing) continue;
        if ((rank[status.status] ?? 0) < (rank[existing.status] ?? 0) && status.status !== "failed") continue;
        await db
          .update(messages)
          .set({ status: status.status, errorMessage: status.error })
          .where(eq(messages.id, existing.id));
      }
    } catch (error) {
      console.error("[whatsapp] webhook processing failed:", error);
    }
  });

  return NextResponse.json({ ok: true });
}
