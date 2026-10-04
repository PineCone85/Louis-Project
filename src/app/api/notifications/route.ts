import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listEmailAccounts } from "@/lib/email/accounts";
import { emailSyncIsStale, syncEmailAccounts } from "@/lib/email/sync";
import { countUnreadInbound } from "@/lib/queries/messages";
import { countUnreadNotifications, listUnreadNotifications } from "@/lib/queries/notifications";
import { runScheduledWorkflows } from "@/lib/workflows/scheduled";

export const maxDuration = 30;

/**
 * Polled by the application shell. Optionally runs a short incremental mail
 * sync first so that new messages appear while the agent is working.
 */
export async function GET(request: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const wantsSync = request.nextUrl.searchParams.get("sync") === "1";
  let sync: Awaited<ReturnType<typeof syncEmailAccounts>> | null = null;
  if (wantsSync && (await emailSyncIsStale())) {
    sync = await syncEmailAccounts({ reason: "poll", budgetMs: 12_000 });
    await runScheduledWorkflows().catch((error) => console.error("[workflows] scheduled check failed:", error));
  }

  const [unreadNotifications, unreadMessages, latest, accounts] = await Promise.all([
    countUnreadNotifications(),
    countUnreadInbound(),
    listUnreadNotifications(5),
    listEmailAccounts(),
  ]);

  // While a mailbox is still importing its first 30 days, keep going after the response is sent.
  if (sync?.ran && accounts.some((a) => !a.backfillCompletedAt && !a.lastSyncError)) {
    after(async () => {
      await syncEmailAccounts({ reason: "manual", budgetMs: 15_000 });
    });
  }

  const failing = accounts.filter((a) => a.lastSyncError);
  return NextResponse.json({
    unreadNotifications,
    unreadMessages,
    latest: latest.map((n) => ({ id: n.id, title: n.title, body: n.body, clientId: n.clientId, createdAt: n.createdAt })),
    email: {
      connected: accounts.length > 0,
      accounts: accounts.map((a) => ({ id: a.id, provider: a.provider, emailAddress: a.emailAddress, lastSyncAt: a.lastSyncAt, error: a.lastSyncError })),
      error: failing.length > 0 ? `${failing[0].emailAddress}: ${failing[0].lastSyncError}` : null,
    },
    sync,
  });
}
