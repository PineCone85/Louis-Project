import Link from "next/link";
import { env } from "@/lib/env";
import { formatSmartDate, truncate } from "@/lib/format";
import { getGmailAccount } from "@/lib/gmail/account";
import { formatPhone } from "@/lib/phone";
import { listClientsBrief } from "@/lib/queries/clients";
import { getConversationMessages, listConversations, markConversationRead } from "@/lib/queries/messages";
import { markNotificationsReadForMessages } from "@/lib/queries/notifications";
import { getSettings } from "@/lib/queries/settings";
import { listTemplates } from "@/lib/queries/templates";
import { getWhatsAppWindow } from "@/lib/whatsapp/send";
import { RefreshCounts } from "@/components/clients/refresh-counts";
import { Timeline } from "@/components/conversation/timeline";
import { SyncButton } from "@/components/dashboard/sync-button";
import { LinkConversationForm } from "@/components/inbox/link-conversation-form";
import { Avatar, ChannelTag, EmptyState, PageBody, PageHeader, StageChip, cx } from "@/components/ui/primitives";

export const metadata = { title: "Inbox" };

type Search = { filter?: string; channel?: string; who?: string; c?: string };

export default async function InboxPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const unreadOnly = params.filter === "unread";
  const channel = params.channel === "email" || params.channel === "whatsapp" ? params.channel : undefined;
  const clientsOnly = params.who === "clients";
  const [conversations, settings, gmail, templates] = await Promise.all([
    listConversations({ unreadOnly, channel, clientsOnly }),
    getSettings(),
    getGmailAccount(),
    listTemplates(),
  ]);

  /** Query string for the currently active filters, used to keep them when navigating. */
  const activeFilters: Record<string, string | undefined> = {
    filter: unreadOnly ? "unread" : undefined,
    channel,
    who: clientsOnly ? "clients" : undefined,
  };
  const listHref = (extra: Record<string, string | undefined> = {}) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...activeFilters, ...extra })) if (value) search.set(key, value);
    const qs = search.toString();
    return `/inbox${qs ? `?${qs}` : ""}`;
  };

  const selectedKey = params.c ?? null;
  const selected = selectedKey ? conversations.find((c) => c.key === selectedKey) ?? null : null;

  let selectedMessages: Awaited<ReturnType<typeof getConversationMessages>> = [];
  let whatsappWindow = null;
  let clients: Awaited<ReturnType<typeof listClientsBrief>> = [];
  if (selected) {
    selectedMessages = await getConversationMessages(selected.channel, selected.contactAddress);
    const unreadIds = selectedMessages.filter((m) => m.direction === "inbound" && !m.readAt).map((m) => m.id);
    if (unreadIds.length > 0) {
      await markConversationRead(selected.channel, selected.contactAddress);
      await markNotificationsReadForMessages(unreadIds);
    }
    if (selected.channel === "whatsapp") whatsappWindow = await getWhatsAppWindow(selected.contactAddress);
    if (!selected.clientId) clients = await listClientsBrief();
  }

  const filterLink = (label: string, query: Record<string, string | undefined>, active: boolean) => {
    return (
      <Link
        href={listHref({ ...query, c: params.c })}
        className={cx("btn btn-sm", active ? "border-sage-300 bg-sage-100 text-sage-900 hover:bg-sage-100" : "btn-secondary")}
        aria-current={active ? "true" : undefined}
      >
        {label}
      </Link>
    );
  };

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  return (
    <>
      <PageHeader
        title="Inbox"
        description={
          totalUnread > 0
            ? `${totalUnread} unread message${totalUnread === 1 ? "" : "s"} across email and WhatsApp.`
            : "All client conversations, across email and WhatsApp."
        }
        actions={<SyncButton />}
      />
      <PageBody>
        {selected ? <RefreshCounts /> : null}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {filterLink("All", { filter: undefined }, !unreadOnly)}
          {filterLink("Unread", { filter: "unread" }, unreadOnly)}
          <span className="mx-1 h-5 w-px bg-line" />
          {filterLink("Email and WhatsApp", { channel: undefined }, !channel)}
          {filterLink("Email", { channel: "email" }, channel === "email")}
          {filterLink("WhatsApp", { channel: "whatsapp" }, channel === "whatsapp")}
          <span className="mx-1 h-5 w-px bg-line" />
          {filterLink("Everyone", { who: undefined }, !clientsOnly)}
          {filterLink("Clients only", { who: "clients" }, clientsOnly)}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
          <div className={cx("panel overflow-hidden xl:col-span-2", selected && "max-xl:hidden")}>
            {conversations.length === 0 ? (
              <EmptyState
                title={unreadOnly ? "Nothing unread" : clientsOnly ? "No client conversations" : "No conversations yet"}
                description={
                  clientsOnly
                    ? "Only conversations linked to a client are shown. Switch to Everyone to see all contacts."
                    : gmail || env.whatsapp.configured
                    ? "Messages from clients will appear here as they arrive."
                    : "Connect Gmail or configure WhatsApp in Settings to start receiving client messages."
                }
              />
            ) : (
              <ul className="scrollbar-thin max-h-[calc(100vh-16rem)] divide-y divide-line overflow-y-auto">
                {conversations.map((conversation) => {
                  const name = conversation.clientName ?? conversation.contactName ?? (conversation.channel === "whatsapp" ? formatPhone(conversation.contactAddress) : conversation.contactAddress);
                  const isSelected = selected?.key === conversation.key;
                  return (
                    <li key={conversation.key}>
                      <Link href={listHref({ c: conversation.key })} className={cx("flex gap-3 px-4 py-3 transition-colors hover:bg-sage-50/60", isSelected && "bg-sage-50")}>
                        <Avatar name={name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className={cx("truncate text-[13px]", conversation.unreadCount > 0 ? "font-semibold text-ink" : "font-medium text-ink")}>{name}</span>
                            <span className="shrink-0 text-[11px] text-ink-faint">{formatSmartDate(conversation.lastMessage.sentAt, settings.timezone)}</span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <ChannelTag channel={conversation.channel} />
                            {conversation.clientStage ? <StageChip stage={conversation.clientStage} /> : <span className="badge badge-neutral">Not a client</span>}
                          </div>
                          <p className={cx("mt-1 truncate text-[12px]", conversation.unreadCount > 0 ? "text-ink" : "text-ink-muted")}>
                            {conversation.lastMessage.direction === "outbound" ? "You: " : ""}
                            {conversation.lastMessage.subject ? `${conversation.lastMessage.subject} — ` : ""}
                            {truncate(conversation.lastMessage.snippet, 90) || (conversation.lastMessage.mediaType ? `Sent a ${conversation.lastMessage.mediaType}` : "")}
                          </p>
                        </div>
                        {conversation.unreadCount > 0 ? <span className="badge-count self-center">{conversation.unreadCount}</span> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="xl:col-span-3">
            {selected ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={listHref()} className="text-[12px] font-medium text-ink-muted hover:text-ink xl:hidden">
                      Back to conversations
                    </Link>
                    <h2 className="truncate font-serif text-[22px] leading-tight text-ink">
                      {selected.clientId ? (
                        <Link href={`/clients/${selected.clientId}`} className="hover:underline">
                          {selected.clientName}
                        </Link>
                      ) : (
                        selected.contactName ?? (selected.channel === "whatsapp" ? formatPhone(selected.contactAddress) : selected.contactAddress)
                      )}
                    </h2>
                    <p className="text-[12px] text-ink-muted">{selected.channel === "whatsapp" ? formatPhone(selected.contactAddress) : selected.contactAddress}</p>
                  </div>
                  {selected.clientId ? (
                    <Link href={`/clients/${selected.clientId}`} className="btn btn-secondary btn-sm">
                      Open client
                    </Link>
                  ) : null}
                </div>
                {!selected.clientId ? (
                  <LinkConversationForm channel={selected.channel} contactAddress={selected.contactAddress} contactName={selected.contactName} clients={clients} />
                ) : null}
                <Timeline
                  contact={{
                    clientId: selected.clientId,
                    firstName: selected.clientName ? selected.clientName.split(" ")[0] : null,
                    lastName: selected.clientName ? selected.clientName.split(" ").slice(1).join(" ") : null,
                    displayName: selected.clientName ?? selected.contactName,
                    emails: selected.channel === "email" ? [selected.contactAddress] : [],
                    phones: selected.channel === "whatsapp" ? [selected.contactAddress] : [],
                  }}
                  messages={selectedMessages}
                  activities={[]}
                  timezone={settings.timezone}
                  emailSignature={settings.emailSignature}
                  renderContext={{ agentName: settings.agentName, agencyName: settings.agencyName, agentPhone: settings.agentPhone }}
                  gmail={{ connected: Boolean(gmail) || env.demo }}
                  whatsapp={{ configured: env.whatsapp.configured || env.demo, window: whatsappWindow }}
                  ai={{ configured: env.anthropic.configured }}
                  templates={templates}
                  defaultChannel={selected.channel}
                  compact
                />
              </div>
            ) : (
              <div className="panel hidden xl:block">
                <EmptyState title="Select a conversation" description="Choose a conversation on the left to read and reply." />
              </div>
            )}
          </div>
        </div>
      </PageBody>
    </>
  );
}
