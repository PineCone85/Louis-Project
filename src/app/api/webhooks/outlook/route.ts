import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { listEmailAccounts, updateEmailAccount } from "@/lib/email/accounts";
import { syncEmailAccounts } from "@/lib/email/sync";
import { env } from "@/lib/env";
import { GraphClient } from "@/lib/outlook/client";
import { SUBSCRIPTION_MINUTES } from "@/lib/outlook/sync";

export const maxDuration = 60;

type Notification = {
  subscriptionId?: string;
  clientState?: string;
  changeType?: string;
  lifecycleEvent?: string;
  resource?: string;
};

/**
 * Microsoft Graph change notifications for Outlook mailboxes. Graph first
 * validates the endpoint by posting a validationToken that must be echoed
 * back as plain text; afterwards it posts batches of notifications whose
 * clientState must match our shared secret. Only the subscription id is used:
 * the mail itself is always fetched through the Graph API.
 */
export async function POST(request: NextRequest) {
  const validationToken = request.nextUrl.searchParams.get("validationToken");
  if (validationToken) {
    return new NextResponse(validationToken, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  const secret = env.microsoft.webhookSecret;
  if (!secret) return NextResponse.json({ error: "Push notifications are not configured" }, { status: 403 });

  let payload: { value?: Notification[] };
  try {
    payload = (await request.json()) as { value?: Notification[] };
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const notifications = (payload.value ?? []).filter((n) => typeof n.clientState === "string" && safeEqual(secret, n.clientState));
  if (notifications.length === 0) return new NextResponse(null, { status: 202 });

  const accounts = await listEmailAccounts();
  const subscriptionIds = new Set(notifications.map((n) => n.subscriptionId).filter((id): id is string => Boolean(id)));
  const affected = accounts.filter((a) => a.provider === "outlook" && a.watchId && subscriptionIds.has(a.watchId));

  const lifecycle = notifications.filter((n) => n.lifecycleEvent);
  after(async () => {
    for (const event of lifecycle) {
      const account = affected.find((a) => a.watchId === event.subscriptionId);
      if (!account || !account.watchId) continue;
      if (event.lifecycleEvent === "reauthorizationRequired") {
        // Renewing re-authorises the endpoint; fall back to a fresh subscription on the next sync if that fails.
        try {
          const renewed = await new GraphClient(account).renewSubscription(account.watchId, new Date(Date.now() + SUBSCRIPTION_MINUTES * 60_000));
          await updateEmailAccount(account.id, { watchExpiresAt: new Date(renewed.expirationDateTime) });
        } catch (error) {
          console.error("[outlook] subscription renewal after lifecycle event failed:", error);
          await updateEmailAccount(account.id, { watchId: null, watchExpiresAt: null });
        }
      } else if (event.lifecycleEvent === "subscriptionRemoved") {
        await updateEmailAccount(account.id, { watchId: null, watchExpiresAt: null });
      }
      // "missed" needs no bookkeeping: the delta sync below catches up.
    }
    if (affected.length > 0) {
      await syncEmailAccounts({ reason: "push", budgetMs: 40_000, accountIds: affected.map((a) => a.id) });
    }
  });

  return new NextResponse(null, { status: 202 });
}
