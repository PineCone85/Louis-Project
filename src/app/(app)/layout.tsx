import { logoutAction } from "@/lib/actions/auth";
import { requireSession } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { listEmailAccounts } from "@/lib/email/accounts";
import { countUnreadInbound } from "@/lib/queries/messages";
import { countUnreadNotifications } from "@/lib/queries/notifications";
import { countPendingDrafts } from "@/lib/queries/drafts";
import { getSettings, stagesFrom } from "@/lib/queries/settings";
import { StagesProvider } from "@/components/pipeline/stages-provider";
import { NotificationsProvider } from "@/components/shell/notifications-provider";
import { Sidebar } from "@/components/shell/sidebar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  const [settings, unreadNotifications, unreadMessages, emailAccounts, pendingDrafts] = await Promise.all([
    getSettings(),
    countUnreadNotifications(),
    countUnreadInbound(),
    listEmailAccounts(),
    countPendingDrafts(),
  ]);

  return (
    <StagesProvider stages={stagesFrom(settings)}>
    <NotificationsProvider initial={{ unreadNotifications, unreadMessages }}>
      <div className="flex min-h-screen flex-col lg:flex-row">
        <Sidebar
          pendingDrafts={pendingDrafts}
          agentName={settings.agentName}
          agencyName={settings.agencyName}
          email={{
            accounts: emailAccounts.map((a) => ({ id: a.id, provider: a.provider, emailAddress: a.emailAddress, error: a.lastSyncError })),
            demo: env.demo,
          }}
          whatsapp={{ configured: env.whatsapp.configured || env.demo }}
          signOut={logoutAction}
        />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </NotificationsProvider>
    </StagesProvider>
  );
}
