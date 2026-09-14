import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getGmailAccount } from "@/lib/gmail/account";
import { gmailSyncIsStale, syncGmail } from "@/lib/gmail/sync";
import { countUnreadInbound } from "@/lib/queries/messages";
import { countUnreadNotifications, listUnreadNotifications } from "@/lib/queries/notifications";

export const maxDuration = 30;

/**
 * Polled by the application shell. Optionally runs a short incremental Gmail
 * sync first so that new mail appears while the agent is working.
 */
export async function GET(request: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const wantsSync = request.nextUrl.searchParams.get("sync") === "1";
  let sync: Awaited<ReturnType<typeof syncGmail>> | null = null;
  if (wantsSync && (await gmailSyncIsStale())) {
    sync = await syncGmail({ reason: "poll", budgetMs: 12_000 });
  }

  const [unreadNotifications, unreadMessages, latest, account] = await Promise.all([
    countUnreadNotifications(),
    countUnreadInbound(),
    listUnreadNotifications(5),
    getGmailAccount(),
  ]);

  return NextResponse.json({
    unreadNotifications,
    unreadMessages,
    latest: latest.map((n) => ({ id: n.id, title: n.title, body: n.body, clientId: n.clientId, createdAt: n.createdAt })),
    gmail: account
      ? { connected: true, lastSyncAt: account.lastSyncAt, error: account.lastSyncError }
      : { connected: false, lastSyncAt: null, error: null },
    sync,
  });
}
