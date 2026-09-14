import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { getGmailAccount } from "@/lib/gmail/account";
import { syncGmail } from "@/lib/gmail/sync";

export const maxDuration = 60;

/**
 * Receives Gmail push notifications delivered by a Google Cloud Pub/Sub push
 * subscription. The payload only says "something changed"; the actual mail is
 * always fetched from the Gmail API, so a forged notification can at most
 * trigger a harmless sync.
 */
export async function POST(request: NextRequest) {
  const expected = env.google.pushToken;
  const provided = request.nextUrl.searchParams.get("token") ?? "";
  if (!expected || !safeEqual(expected, provided)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let emailAddress: string | undefined;
  try {
    const body = (await request.json()) as { message?: { data?: string } };
    if (body.message?.data) {
      const decoded = JSON.parse(Buffer.from(body.message.data, "base64").toString("utf8")) as { emailAddress?: string };
      emailAddress = decoded.emailAddress?.toLowerCase();
    }
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const account = await getGmailAccount();
  if (!account || (emailAddress && emailAddress !== account.emailAddress.toLowerCase())) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  after(async () => {
    await syncGmail({ reason: "push", budgetMs: 40_000 });
  });

  return NextResponse.json({ ok: true });
}
