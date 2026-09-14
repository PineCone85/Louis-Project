"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { deleteActivityAction } from "@/lib/actions/clients";
import type { RenderContext } from "@/lib/auto-reply/render";
import type { Activity, Message, Template } from "@/lib/db/schema";
import { formatDateTime } from "@/lib/format";
import type { WhatsAppWindow } from "@/lib/whatsapp/send";
import { ConfirmButton } from "@/components/ui/form-controls";
import { EmptyState, cx } from "@/components/ui/primitives";
import { EmailComposer, type EmailThreadOption } from "./email-composer";
import { EmailMessage, WhatsAppMessage } from "./message-item";
import { WhatsAppComposer } from "./whatsapp-composer";

export type TimelineContact = {
  clientId: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  emails: string[];
  phones: string[];
};

type Props = {
  contact: TimelineContact;
  messages: Message[];
  activities: Activity[];
  timezone: string;
  emailSignature: string;
  renderContext: RenderContext["settings"];
  gmail: { connected: boolean };
  whatsapp: { configured: boolean; window: WhatsAppWindow | null };
  templates: Template[];
  defaultChannel?: "email" | "whatsapp";
  compact?: boolean;
};

type Item = { kind: "message"; at: Date; message: Message } | { kind: "activity"; at: Date; activity: Activity };
type Filter = "all" | "email" | "whatsapp" | "activity";

export function Timeline(props: Props) {
  const router = useRouter();
  const emailAvailable = props.gmail.connected && props.contact.emails.length > 0;
  const whatsappAvailable = props.whatsapp.configured && props.contact.phones.length > 0;
  const [channel, setChannel] = useState<"email" | "whatsapp">(
    props.defaultChannel ?? (emailAvailable ? "email" : whatsappAvailable ? "whatsapp" : "email"),
  );
  const [filter, setFilter] = useState<Filter>("all");
  const [composerKey, setComposerKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const threads = useMemo<EmailThreadOption[]>(() => {
    const map = new Map<string, EmailThreadOption>();
    for (const message of props.messages) {
      if (message.channel !== "email" || !message.threadId) continue;
      const existing = map.get(message.threadId);
      if (!existing || message.sentAt > existing.lastAt) {
        map.set(message.threadId, { threadId: message.threadId, subject: existing?.subject ?? message.subject ?? "", lastAt: message.sentAt });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
  }, [props.messages]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(threads[0]?.threadId ?? null);

  const items = useMemo<Item[]>(() => {
    const list: Item[] = [
      ...props.messages.map((message) => ({ kind: "message" as const, at: message.sentAt, message })),
      ...props.activities.map((activity) => ({ kind: "activity" as const, at: activity.createdAt, activity })),
    ];
    return list
      .filter((item) => {
        if (filter === "all") return true;
        if (filter === "activity") return item.kind === "activity";
        return item.kind === "message" && item.message.channel === filter;
      })
      .sort((a, b) => b.at.getTime() - a.at.getTime());
  }, [props.messages, props.activities, filter]);

  const firstEmailId = items.find((item) => item.kind === "message" && item.message.channel === "email")?.kind === "message"
    ? (items.find((item) => item.kind === "message" && item.message.channel === "email") as Extract<Item, { kind: "message" }>).message.id
    : null;

  const client = props.contact.firstName ? { firstName: props.contact.firstName, lastName: props.contact.lastName ?? "" } : null;

  const handleSent = (label: string) => {
    setNotice(label);
    setComposerKey((k) => k + 1);
    router.refresh();
    window.setTimeout(() => setNotice(null), 6000);
  };

  const tabs: Array<{ key: "email" | "whatsapp"; label: string; available: boolean; reason: string }> = [
    {
      key: "email",
      label: "Email",
      available: emailAvailable,
      reason: !props.gmail.connected ? "Connect Gmail in Settings to send email." : "Add an email address to send email.",
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      available: whatsappAvailable,
      reason: !props.whatsapp.configured ? "Configure WhatsApp in Settings to send messages." : "Add a mobile number to send WhatsApp messages.",
    },
  ];
  const activeTab = tabs.find((t) => t.key === channel)!;

  return (
    <div className="space-y-4">
      <section className="panel">
        <div className="flex items-center justify-between border-b border-line px-5">
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setChannel(tab.key)}
                className={cx(
                  "-mb-px border-b-2 px-3 py-3 text-[13px] font-medium transition-colors",
                  channel === tab.key ? "border-ink text-ink" : "border-transparent text-ink-muted hover:text-ink",
                  !tab.available && "opacity-60",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {notice ? <span className="text-[12px] font-medium text-sage-800">{notice}</span> : null}
        </div>
        <div className="panel-body">
          {!activeTab.available ? (
            <p className="text-[13px] text-ink-muted">
              {activeTab.reason}{" "}
              {activeTab.key === "email" && !props.gmail.connected ? (
                <Link href="/settings/gmail" className="font-medium text-ink hover:underline">
                  Open Gmail settings
                </Link>
              ) : activeTab.key === "whatsapp" && !props.whatsapp.configured ? (
                <Link href="/settings/whatsapp" className="font-medium text-ink hover:underline">
                  Open WhatsApp settings
                </Link>
              ) : props.contact.clientId ? (
                <Link href={`/clients/${props.contact.clientId}/edit`} className="font-medium text-ink hover:underline">
                  Edit client
                </Link>
              ) : null}
            </p>
          ) : channel === "email" ? (
            <EmailComposer
              key={`email-${composerKey}`}
              clientId={props.contact.clientId}
              contactName={props.contact.displayName}
              client={client}
              emails={props.contact.emails}
              threads={threads}
              selectedThreadId={selectedThreadId}
              onSelectThread={setSelectedThreadId}
              signature={props.emailSignature}
              templates={props.templates.filter((t) => t.channel === "any" || t.channel === "email")}
              renderContext={props.renderContext}
              onSent={() => handleSent("Email sent")}
            />
          ) : (
            <WhatsAppComposer
              key={`wa-${composerKey}`}
              clientId={props.contact.clientId}
              contactName={props.contact.displayName}
              client={client}
              phones={props.contact.phones}
              window={props.whatsapp.window}
              timezone={props.timezone}
              templates={props.templates.filter((t) => t.channel === "any" || t.channel === "whatsapp")}
              renderContext={props.renderContext}
              onSent={() => handleSent("WhatsApp message sent")}
            />
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">{props.compact ? "Messages" : "Conversation and activity"}</h2>
          <div className="flex gap-1">
            {(props.compact ? (["all", "email", "whatsapp"] as Filter[]) : (["all", "email", "whatsapp", "activity"] as Filter[])).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={cx("rounded-sm px-2 py-1 text-[12px] font-medium capitalize", filter === key ? "bg-sage-100 text-sage-900" : "text-ink-muted hover:text-ink")}
              >
                {key === "whatsapp" ? "WhatsApp" : key}
              </button>
            ))}
          </div>
        </div>
        {items.length === 0 ? (
          <EmptyState title="Nothing here yet" description="Messages and activity for this contact will appear in chronological order." />
        ) : (
          <div className="divide-y divide-line">
            {items.map((item) =>
              item.kind === "message" ? (
                item.message.channel === "email" ? (
                  <EmailMessage
                    key={item.message.id}
                    message={item.message}
                    timezone={props.timezone}
                    expandedByDefault={item.message.id === firstEmailId}
                    onReply={
                      emailAvailable
                        ? (message) => {
                            setChannel("email");
                            setSelectedThreadId(message.threadId);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }
                        : undefined
                    }
                  />
                ) : (
                  <WhatsAppMessage key={item.message.id} message={item.message} timezone={props.timezone} />
                )
              ) : (
                <ActivityRow key={item.activity.id} activity={item.activity} timezone={props.timezone} clientId={props.contact.clientId} />
              ),
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function ActivityRow({ activity, timezone, clientId }: { activity: Activity; timezone: string; clientId: string | null }) {
  const deletable = ["note", "call", "meeting", "viewing"].includes(activity.type) && clientId;
  return (
    <div className="flex items-start gap-3 px-5 py-3">
      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sage-400" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] font-medium text-ink">{activity.title}</p>
          <time className="shrink-0 text-[11px] text-ink-faint">{formatDateTime(activity.createdAt, timezone)}</time>
        </div>
        {activity.body ? <p className="mt-0.5 text-[13px] whitespace-pre-wrap text-ink-muted">{activity.body}</p> : null}
        {deletable ? (
          <ConfirmButton
            className="btn-ghost h-auto p-0 text-[11px] text-ink-faint hover:bg-transparent hover:text-danger"
            confirmText="Delete this entry?"
            action={() => deleteActivityAction(activity.id, clientId!)}
          >
            Delete
          </ConfirmButton>
        ) : null}
      </div>
    </div>
  );
}
