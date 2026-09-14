import { logoutAction } from "@/lib/actions/auth";
import { requireSession } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { getGmailAccount } from "@/lib/gmail/account";
import { countUnreadInbound } from "@/lib/queries/messages";
import { countUnreadNotifications } from "@/lib/queries/notifications";
import { getSettings } from "@/lib/queries/settings";
import { NotificationsProvider } from "@/components/shell/notifications-provider";
import { Sidebar } from "@/components/shell/sidebar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  const [settings, unreadNotifications, unreadMessages, gmail] = await Promise.all([
    getSettings(),
    countUnreadNotifications(),
    countUnreadInbound(),
    getGmailAccount(),
  ]);

  return (
    <NotificationsProvider initial={{ unreadNotifications, unreadMessages }}>
      <div className="flex min-h-screen flex-col lg:flex-row">
        <Sidebar
          agentName={settings.agentName}
          agencyName={settings.agencyName}
          gmail={{ connected: Boolean(gmail), email: gmail?.emailAddress ?? null, error: gmail?.lastSyncError ?? null }}
          whatsapp={{ configured: env.whatsapp.configured }}
          signOut={logoutAction}
        />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </NotificationsProvider>
  );
}
