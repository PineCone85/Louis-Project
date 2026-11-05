"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Inbox, KanbanSquare, LayoutDashboard, Settings, Sparkles, Users } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { providerLabel } from "@/lib/email/types";
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
  email: { accounts: Array<{ id: string; provider: string; emailAddress: string; error: string | null }>; demo: boolean };
  whatsapp: { configured: boolean; demo: boolean; detail?: string | null; warning?: boolean };
  /** Messages drafted by workflows that are waiting for review. */
  pendingDrafts: number;
  signOut: () => Promise<void>;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A";
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type Connection = { key: string; href: string; label: string; detail: string; state: "ok" | "warn" | "off" };

function ConnectionRow({ connection }: { connection: Connection }) {
  return (
    <Link
      href={connection.href}
      title={connection.detail}
      className="flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-[12px] text-white/70 transition-colors hover:bg-white/5 hover:text-white"
    >
      <span
        className={cx(
          "status-dot",
          connection.state === "ok" ? "bg-[#4ade80]" : connection.state === "warn" ? "bg-[#fbbf24]" : "bg-white/25",
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-white/85">{connection.label}</span>
        <span className="block truncate text-[11px] text-white/45">{connection.detail}</span>
      </span>
    </Link>
  );
}

export function Sidebar({ agentName, agencyName, email, whatsapp, pendingDrafts, signOut }: Props) {
  const pathname = usePathname();
  const { counts, emailError } = useNotifications();
  const unread = counts.unreadMessages.total;

  const isActive = (item: (typeof NAV)[number]) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));

  const links = NAV.map((item) => {
    const active = isActive(item);
    const Icon = item.icon;
    return (
      <Link key={item.href} href={item.href} className={cx("nav-link", active && "nav-link-active")} aria-current={active ? "page" : undefined}>
        <Icon size={16} strokeWidth={1.75} className={cx("shrink-0", active ? "text-[#86efac]" : undefined)} />
        <span className="flex-1">{item.label}</span>
        {item.badge && unread > 0 ? <span className="badge-count bg-[#4ade80] text-night">{unread > 99 ? "99+" : unread}</span> : null}
        {item.drafts && pendingDrafts > 0 ? <span className="badge-count bg-white/15 text-white">{pendingDrafts > 99 ? "99+" : pendingDrafts}</span> : null}
      </Link>
    );
  });

  const emailWarnings = email.accounts.filter((a) => Boolean(a.error) || (emailError?.startsWith(a.emailAddress) ?? false));
  const connections: Connection[] = [
    email.accounts.length === 0
      ? {
          key: "email",
          href: "/settings/email",
          label: "Email",
          detail: email.demo ? "Simulated (demo mode)" : "Not connected",
          state: email.demo ? "ok" : "off",
        }
      : {
          key: "email",
          href: "/settings/email",
          label: email.accounts.length === 1 ? providerLabel(email.accounts[0].provider) : `Email · ${email.accounts.length} mailboxes`,
          detail: emailWarnings.length > 0 ? `${emailWarnings[0].emailAddress} needs attention` : email.accounts.map((a) => a.emailAddress).join(", "),
          state: emailWarnings.length > 0 ? "warn" : "ok",
        },
    {
      key: "whatsapp",
      href: "/settings/whatsapp",
      label: "WhatsApp",
      detail: whatsapp.configured ? whatsapp.detail ?? "Connected" : whatsapp.demo ? "Simulated (demo mode)" : "Not connected",
      state: whatsapp.configured ? (whatsapp.warning ? "warn" : "ok") : whatsapp.demo ? "ok" : "off",
    },
  ];

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-night text-white lg:flex">
        <div className="flex items-center gap-3 px-5 pt-6 pb-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-sm bg-[#4ade80]/15 font-serif text-[20px] leading-none text-[#86efac]">
            {APP_NAME.slice(0, 1)}
          </span>
          <Link href="/" className="min-w-0">
            <span className="block font-serif text-[24px] leading-none tracking-tight text-white">{APP_NAME}</span>
            <span className="mt-1 block truncate text-[11px] text-white/50">{agencyName || "Real estate CRM"}</span>
          </Link>
        </div>
        <nav className="scrollbar-thin flex flex-col gap-0.5 overflow-y-auto px-3">{links}</nav>
        <div className="mt-auto space-y-3 p-3">
          <div className="rounded-md border border-night-line bg-night-soft p-2">
            <p className="px-2 pt-1 pb-1.5 text-[10px] font-semibold tracking-[0.08em] text-white/40 uppercase">Connections</p>
            {connections.map((connection) => (
              <ConnectionRow key={connection.key} connection={connection} />
            ))}
          </div>
          <div className="flex items-center gap-3 px-2 pb-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-white">{initials(agentName || "Agent")}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-white">{agentName || "Agent"}</span>
            <form action={signOut}>
              <button type="submit" className="cursor-pointer rounded-xs px-1.5 py-1 text-[12px] text-white/55 hover:bg-white/5 hover:text-white">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="sticky top-0 z-40 bg-night text-white lg:hidden">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <Link href="/" className="font-serif text-[22px] leading-none tracking-tight text-white">
            {APP_NAME}
          </Link>
          <div className="flex items-center gap-3">
            {connections.map((c) => (
              <Link key={c.key} href={c.href} className="flex items-center gap-1.5 text-[11px] text-white/70" title={c.detail}>
                <span className={cx("status-dot", c.state === "ok" ? "bg-[#4ade80]" : c.state === "warn" ? "bg-[#fbbf24]" : "bg-white/25")} />
                {c.label.split(" ")[0]}
              </Link>
            ))}
          </div>
        </div>
        <nav className="scrollbar-thin flex items-center gap-1 overflow-x-auto px-2 pb-2">
          {NAV.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                className={cx("relative flex shrink-0 items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[12px] text-white/60", active && "bg-white/10 text-white")}
              >
                <Icon size={16} strokeWidth={1.75} />
                <span className={active ? undefined : "sr-only sm:not-sr-only"}>{item.label}</span>
                {(item.badge && unread > 0) || (item.drafts && pendingDrafts > 0) ? <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-[#4ade80]" /> : null}
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}
