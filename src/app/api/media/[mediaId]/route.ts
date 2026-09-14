import { sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { downloadMedia, getMediaInfo, WhatsAppApiError } from "@/lib/whatsapp/client";

/** Proxies WhatsApp media through the CRM so that the access token never reaches the browser. */
export async function GET(_request: NextRequest, context: { params: Promise<{ mediaId: string }> }) {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const { mediaId } = await context.params;

  const known = await db.execute(sql`select id, media from messages where media->>'id' = ${mediaId} limit 1`);
  const row = known.rows[0] as { media?: { filename?: string | null; mimeType?: string | null } } | undefined;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const info = await getMediaInfo(mediaId);
    const upstream = await downloadMedia(info.url);
    const mimeType = info.mime_type || row.media?.mimeType || "application/octet-stream";
    const filename = (row.media?.filename ?? `whatsapp-${mediaId}`).replace(/[^\w.\- ]+/g, "_");
    const inline = /^(image\/|video\/|audio\/|application\/pdf)/.test(mimeType);
    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof WhatsAppApiError ? error.message : "Media is no longer available";
    return NextResponse.json({ error: message }, { status: 410 });
  }
}
