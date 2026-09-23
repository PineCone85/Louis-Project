"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Inbox, KanbanSquare, LayoutDashboard, Settings, Sparkles, Users } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { cx } from "@/components/ui/primitives";
import { useNotifications } from "./notifications-provider";

const NAV: Array<{ href: string; label: string; icon: typeof Inbox; exact?: boolean; badge?: boolean; drafts?: boolean }> = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/inbox", label: "Inbox", icon: Inbox, badge: true },
  { href: "/drafts", label: "Drafts", icon: Sparkles, drafts: true },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/properties", label: "Properties", icon: Building2 },
  { href: "/settings", label: "Settings", icon: Settings },
];

type Props = {
  agentName: string;
  agencyName: string;
  gmail: { connected: boolean; email: string | null; error: string | null };
  whatsapp: { configured: boolean };
  /** Messages drafted by workflows that are waiting for review. */
  pendingDrafts: number;
  signOut: () => Promise<void>;
};

function StatusDot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  return <span className={cx("inline-block h-1.5 w-1.5 rounded-full", ok ? (warn ? "bg-danger" : "bg-sage-500") : "bg-line-strong")} />;
}

export function Sidebar({ agentName, agencyName, gmail, whatsapp, pendingDrafts, signOut }: Props) {
  const pathname = usePathname();
  const { counts, gmailError } = useNotifications();
  const unread = counts.unreadMessages.total;
  const gmailWarning = Boolean(gmail.error || gmailError);

  const links = NAV.map((item) => {
    const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
    const Icon = item.icon;
    return (
      <Link key={item.href} href={item.href} className={cx("nav-link", active && "nav-link-active")} aria-current={active ? "page" : undefined}>
        <Icon size={16} strokeWidth={1.75} className="shrink-0" />
        <span className="flex-1">{item.label}</span>
        {item.badge && unread > 0 ? <span className="badge-count">{unread > 99 ? "99+" : unread}</span> : null}
        {item.drafts && pendingDrafts > 0 ? <span className="badge-count">{pendingDrafts > 99 ? "99+" : pendingDrafts}</span> : null}
      </Link>
    );
  });

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-paper lg:flex">
        <div className="px-5 pt-6 pb-5">
          <Link href="/" className="block">
            <span className="font-serif text-[26px] leading-none tracking-tight text-ink">{APP_NAME}</span>
          </Link>
          <p className="mt-1.5 truncate text-[12px] text-ink-muted">{agencyName || "Real estate CRM"}</p>
        </div>
        <nav className="flex flex-col gap-0.5 px-3">{links}</nav>
        <div className="mt-auto border-t border-line px-5 py-4">
          <div className="space-y-1.5 text-[12px] text-ink-muted">
            <Link href="/settings/gmail" className="flex items-center gap-2 hover:text-ink">
              <StatusDot ok={gmail.connected} warn={gmailWarning} />
              <span className="truncate">{gmail.connected ? (gmailWarning ? "Gmail needs attention" : gmail.email) : "Gmail not connected"}</span>
            </Link>
            <Link href="/settings/whatsapp" className="flex items-center gap-2 hover:text-ink">
              <StatusDot ok={whatsapp.configured} />
              <span>{whatsapp.configured ? "WhatsApp connected" : "WhatsApp not configured"}</span>
            </Link>
          </div>
          <div className="mt-4 flex items-center justify-between gap-2">
            <span className="truncate text-[13px] font-medium text-ink">{agentName || "Agent"}</span>
            <form action={signOut}>
              <button type="submit" className="text-[12px] text-ink-muted hover:text-ink">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-line bg-paper px-4 py-2.5 lg:hidden">
        <Link href="/" className="font-serif text-[22px] leading-none tracking-tight text-ink">
          {APP_NAME}
        </Link>
        <nav className="flex items-center gap-1">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} aria-label={item.label} className={cx("relative rounded-sm p-2 text-ink-muted", active && "bg-sage-100 text-sage-900")}>
                <Icon size={18} strokeWidth={1.75} />
                {(item.badge && unread > 0) || (item.drafts && pendingDrafts > 0) ? <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-sage-700" /> : null}
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}
