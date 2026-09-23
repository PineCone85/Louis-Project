import Link from "next/link";
import { Plus } from "lucide-react";
import { getDashboardData } from "@/lib/queries/dashboard";
import { countClientsByStage } from "@/lib/queries/clients";
import { countProperties } from "@/lib/queries/properties";
import { countPendingDrafts } from "@/lib/queries/drafts";
import { getSettings, stagesFrom } from "@/lib/queries/settings";
import { getGmailAccount } from "@/lib/gmail/account";
import { env } from "@/lib/env";
import { formatDate, formatRelative, formatSmartDate, fullName } from "@/lib/format";
import { SyncButton } from "@/components/dashboard/sync-button";
import { Avatar, EmptyState, PageBody, PageHeader, Panel, StageChip } from "@/components/ui/primitives";

export const metadata = { title: "Dashboard" };

function Stat({ label, value, href }: { label: string; value: number | string; href?: string }) {
  const inner = (
    <div className="px-5 py-4">
      <div className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">{label}</div>
      <div className="mt-1 font-serif text-[30px] leading-none text-ink">{value}</div>
    </div>
  );
  return href ? (
    <Link href={href} className="block border-line bg-paper transition-colors hover:bg-sage-50/60 max-md:border-b md:border-r md:last:border-r-0">
      {inner}
    </Link>
  ) : (
    <div className="border-line bg-paper max-md:border-b md:border-r md:last:border-r-0">{inner}</div>
  );
}

export default async function DashboardPage() {
  const [data, stageCounts, propertyCounts, settings, gmail, pendingDrafts] = await Promise.all([
    getDashboardData(),
    countClientsByStage(),
    countProperties(),
    getSettings(),
    getGmailAccount(),
    countPendingDrafts(),
  ]);
  const stages = stagesFrom(settings);
  const today = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: settings.timezone }).format(new Date());
  const attentionCount = data.attentionCount;
  const setupItems = [
    !gmail && !env.demo && { label: "Connect Gmail to see client email in the CRM", href: "/settings/gmail" },
    !env.whatsapp.configured && !env.demo && { label: "Configure WhatsApp Business to receive WhatsApp messages", href: "/settings/whatsapp" },
    !settings.agentName && { label: "Add your name and signature for outgoing messages", href: "/settings" },
  ].filter((item): item is { label: string; href: string } => Boolean(item));

  return (
    <>
      <PageHeader
        eyebrow={today}
        title={settings.agentName ? `Good day, ${settings.agentName.split(" ")[0]}` : "Dashboard"}
        description={
          attentionCount > 0
            ? `${attentionCount} client${attentionCount === 1 ? "" : "s"} ${attentionCount === 1 ? "has" : "have"} sent messages you have not read yet.`
            : "You are up to date with client communication."
        }
        actions={
          <>
            <SyncButton />
            <Link href="/clients/new" className="btn btn-primary">
              <Plus size={14} /> Add client
            </Link>
          </>
        }
      />
      <PageBody className="space-y-6">
        {pendingDrafts > 0 ? (
          <Link href="/drafts" className="flex items-center justify-between gap-3 rounded-md border border-sage-200 bg-sage-50 px-5 py-3 text-[13px] text-sage-900 transition-colors hover:bg-sage-100">
            <span>
              <span className="font-semibold">{pendingDrafts} suggested message{pendingDrafts === 1 ? "" : "s"}</span> written by your workflows are waiting for review.
            </span>
            <span className="font-medium">Open Drafts</span>
          </Link>
        ) : null}
        {setupItems.length > 0 ? (
          <div className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Finish setting up</h2>
            </div>
            <ul className="divide-y divide-line">
              {setupItems.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="flex items-center justify-between px-5 py-3 text-[13px] hover:bg-sage-50/60">
                    <span>{item.label}</span>
                    <span className="text-ink-muted">Open settings</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="panel grid grid-cols-1 overflow-hidden md:grid-cols-5">
          <Stat label="Active clients" value={data.activeClients} href="/clients" />
          <Stat label="Need attention" value={attentionCount} href="/clients?attention=1" />
          <Stat label="Follow-ups due" value={data.followUpCount} href="/clients?followups=1" />
          <Stat label="In transaction" value={data.inTransaction} href="/pipeline" />
          <Stat label="Available properties" value={`${propertyCounts.available}`} href="/properties?status=available" />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <Panel title="Needs attention" padded={false} actions={<Link href="/inbox" className="text-[12px] font-medium text-ink-muted hover:text-ink">Open inbox</Link>}>
              {data.needsAttention.length === 0 ? (
                <EmptyState title="No unread client messages" description="New emails and WhatsApp messages from clients will appear here." />
              ) : (
                <ul className="divide-y divide-line">
                  {data.needsAttention.map((client) => (
                    <li key={client.id}>
                      <Link href={`/clients/${client.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-sage-50/60">
                        <Avatar name={fullName(client)} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[13px] font-medium text-ink">{fullName(client)}</span>
                            <StageChip stage={client.stage} />
                          </div>
                          <div className="text-[12px] text-ink-muted">Last message {formatSmartDate(client.lastInboundAt, settings.timezone)}</div>
                        </div>
                        <span className="badge-count">{client.unreadCount}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Recent activity" padded={false}>
              {data.recentActivity.length === 0 ? (
                <EmptyState title="No activity yet" description="Stage changes, notes and sent messages will be listed here." />
              ) : (
                <ul className="divide-y divide-line">
                  {data.recentActivity.map((item) => (
                    <li key={item.id} className="flex items-start gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] text-ink">
                          <Link href={`/clients/${item.clientId}`} className="font-medium hover:underline">
                            {item.clientName}
                          </Link>
                          <span className="text-ink-muted"> · {item.title}</span>
                        </p>
                        {item.body ? <p className="mt-0.5 line-clamp-1 text-[12px] text-ink-muted">{item.body}</p> : null}
                      </div>
                      <span className="shrink-0 text-[11px] text-ink-faint">{formatRelative(item.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <div className="space-y-6">
            <Panel title="Pipeline" padded={false} actions={<Link href="/pipeline" className="text-[12px] font-medium text-ink-muted hover:text-ink">Open board</Link>}>
              <ul className="divide-y divide-line">
                {stages.map((stage) => (
                  <li key={stage.key}>
                    <Link href={`/clients?stage=${stage.key}`} className="flex items-center justify-between px-5 py-2 text-[13px] hover:bg-sage-50/60">
                      <span className={stage.group === "closed" ? "text-ink-muted" : "text-ink"}>{stage.label}</span>
                      <span className="tabular-nums text-ink-muted">{stageCounts[stage.key] ?? 0}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Follow-ups due" padded={false}>
              {data.followUpsDue.length === 0 ? (
                <p className="px-5 py-4 text-[13px] text-ink-faint">No follow-ups are due.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {data.followUpsDue.map((client) => (
                    <li key={client.id}>
                      <Link href={`/clients/${client.id}`} className="flex items-center justify-between px-5 py-2.5 text-[13px] hover:bg-sage-50/60">
                        <span className="truncate font-medium">{fullName(client)}</span>
                        <span className="shrink-0 text-ink-muted">{formatDate(client.nextFollowUpAt, settings.timezone)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Gone quiet" padded={false}>
              {data.stale.length === 0 ? (
                <p className="px-5 py-4 text-[13px] text-ink-faint">Every active client has been contacted in the last two weeks.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {data.stale.map((client) => (
                    <li key={client.id}>
                      <Link href={`/clients/${client.id}`} className="flex items-center justify-between px-5 py-2.5 text-[13px] hover:bg-sage-50/60">
                        <span className="truncate font-medium">{fullName(client)}</span>
                        <span className="shrink-0 text-ink-muted">{client.lastContactAt ? formatRelative(client.lastContactAt) : "never contacted"}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      </PageBody>
    </>
  );
}
