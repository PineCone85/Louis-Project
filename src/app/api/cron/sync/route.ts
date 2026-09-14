import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { syncGmail } from "@/lib/gmail/sync";

export const maxDuration = 60;

/** Scheduled synchronisation. Vercel Cron sends the CRON_SECRET as a bearer token automatically. */
export async function GET(request: NextRequest) {
  const secret = env.cronSecret;
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!secret || !safeEqual(secret, provided)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const result = await syncGmail({ reason: "cron", budgetMs: 50_000 });
  return NextResponse.json(result);
}
