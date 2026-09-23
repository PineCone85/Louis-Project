"use client";

import { useState } from "react";
import { Paperclip } from "lucide-react";
import type { Message } from "@/lib/db/schema";
import { formatDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { ChannelTag, cx } from "@/components/ui/primitives";

const STATUS_LABEL: Record<string, string> = { sent: "Sent", delivered: "Delivered", read: "Read", failed: "Failed", queued: "Sending" };

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function EmailMessage({
  message,
  timezone,
  expandedByDefault,
  onReply,
}: {
  message: Message;
  timezone: string;
  expandedByDefault: boolean;
  onReply?: (message: Message) => void;
}) {
  const [expanded, setExpanded] = useState(expandedByDefault);
  const inbound = message.direction === "inbound";
  const counterpart = message.contactName ? `${message.contactName} <${message.contactAddress}>` : message.contactAddress;
  const recipients = (message.toAddresses ?? []).map((a) => a.address).join(", ");
  const attachments = message.attachments ?? [];

  return (
    <article className={cx("px-5 py-4", !inbound && "bg-canvas/60")}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <ChannelTag channel="email" />
          {message.isAutoReply ? <span className="badge badge-neutral">Automatic reply</span> : null}
          <span className="truncate text-[12px] text-ink-muted">{inbound ? `From ${counterpart}` : `To ${recipients || message.contactAddress}`}</span>
        </div>
        <time className="text-[11px] text-ink-faint">{formatDateTime(message.sentAt, timezone)}</time>
      </div>
      <h3 className="mt-1.5 text-[14px] font-semibold text-ink">{message.subject || "(no subject)"}</h3>
      {expanded ? (
        message.bodyHtml ? (
          <div className="prose-email mt-2 overflow-x-auto" dangerouslySetInnerHTML={{ __html: message.bodyHtml }} />
        ) : (
          <p className="mt-2 text-[13px] leading-relaxed whitespace-pre-wrap text-ink">{message.bodyText}</p>
        )
      ) : (
        <p className="mt-1 line-clamp-2 text-[13px] text-ink-muted">{message.snippet || message.bodyText}</p>
      )}
      {attachments.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <li key={attachment.attachmentId}>
              <a
                href={`/api/attachments/${message.id}/${encodeURIComponent(attachment.attachmentId)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-sm border border-line bg-paper px-2.5 py-1 text-[12px] text-ink hover:bg-sage-50"
              >
                <Paperclip size={12} className="text-ink-muted" />
                <span className="max-w-48 truncate">{attachment.filename}</span>
                <span className="text-ink-faint">{formatBytes(attachment.size)}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-2.5 flex items-center gap-3 text-[12px]">
        <button type="button" className="font-medium text-ink-muted hover:text-ink" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Collapse" : "Show full message"}
        </button>
        {onReply ? (
          <button type="button" className="font-medium text-sage-800 hover:underline" onClick={() => onReply(message)}>
            Reply
          </button>
        ) : null}
      </div>
    </article>
  );
}

function MediaPreview({ message }: { message: Message }) {
  const media = message.media;
  if (!media) return null;
  const src = `/api/media/${encodeURIComponent(media.id)}`;
  const mime = media.mimeType ?? "";
  if (mime.startsWith("image/")) {
    return (
      <a href={src} target="_blank" rel="noopener noreferrer" className="mt-1 block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={media.caption ?? "Image"} className="max-h-72 max-w-full rounded-sm border border-line" loading="lazy" />
      </a>
    );
  }
  if (mime.startsWith("audio/")) {
    return <audio controls src={src} className="mt-1 w-full max-w-xs" preload="none" />;
  }
  if (mime.startsWith("video/")) {
    return <video controls src={src} className="mt-1 max-h-72 max-w-full rounded-sm border border-line" preload="none" />;
  }
  return (
    <a href={src} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1.5 rounded-sm border border-line bg-paper px-2.5 py-1 text-[12px] text-ink hover:bg-sage-50">
      <Paperclip size={12} className="text-ink-muted" />
      {media.filename ?? `${message.mediaType ?? "file"}`}
    </a>
  );
}

export function WhatsAppMessage({ message, timezone }: { message: Message; timezone: string }) {
  const inbound = message.direction === "inbound";
  const status = STATUS_LABEL[message.status] ?? message.status;
  return (
    <article className={cx("flex px-5 py-2", inbound ? "justify-start" : "justify-end")}>
      <div className={cx("max-w-[80%] rounded-md px-3.5 py-2.5", inbound ? "border border-line bg-paper" : "bg-sage-100")}>
        <div className="flex items-center gap-2 text-[11px] text-ink-muted">
          <ChannelTag channel="whatsapp" />
          {message.isAutoReply ? <span>Automatic reply</span> : null}
          {message.mediaType === "template" ? <span>Template</span> : null}
          {inbound && message.contactName ? <span className="truncate">{message.contactName}</span> : null}
        </div>
        {message.bodyText ? <p className="mt-1 text-[13px] leading-relaxed whitespace-pre-wrap text-ink">{message.bodyText}</p> : null}
        <MediaPreview message={message} />
        <div className="mt-1 flex items-center justify-end gap-2 text-[11px] text-ink-faint">
          <span>{formatDateTime(message.sentAt, timezone)}</span>
          {!inbound ? <span className={message.status === "failed" ? "text-danger" : undefined}>{status}</span> : null}
        </div>
        {message.status === "failed" && message.errorMessage ? <p className="mt-1 text-[11px] text-danger">{message.errorMessage}</p> : null}
        {inbound && !message.contactName ? <span className="sr-only">{formatPhone(message.contactAddress)}</span> : null}
      </div>
    </article>
  );
}
