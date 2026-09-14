import Link from "next/link";
import type { ReactNode } from "react";
import { getStage } from "@/lib/pipeline";

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-line bg-paper px-6 py-5 md:flex-row md:items-end md:justify-between md:px-8">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-[12px] font-medium text-ink-muted">{eyebrow}</div> : null}
        <h1 className="font-serif text-[30px] leading-none tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-[13px] text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("px-6 py-6 md:px-8", className)}>{children}</div>;
}

export function Panel({ title, actions, children, className, padded = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cx("panel", className)}>
      {title || actions ? (
        <div className="panel-header">
          {title ? <h2 className="panel-title">{title}</h2> : <span />}
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={padded ? "panel-body" : undefined}>{children}</div>
    </section>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 h-px w-10 bg-sage-300" />
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {description ? <p className="mt-1.5 max-w-sm text-[13px] text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function StageChip({ stage, className }: { stage: string; className?: string }) {
  const meta = getStage(stage);
  const variant =
    meta.key === "completed" ? "stage-completed" : meta.key === "lost" ? "stage-lost" : meta.group === "transaction" ? "stage-transaction" : meta.group === "active" ? "stage-active" : "stage-lead";
  return <span className={cx("badge", variant, className)}>{meta.label}</span>;
}

export function ChannelTag({ channel, className }: { channel: string; className?: string }) {
  const label = channel === "email" ? "Email" : channel === "whatsapp" ? "WhatsApp" : channel;
  return (
    <span className={cx("badge", channel === "whatsapp" ? "badge-solid" : "badge-sage", className)}>{label}</span>
  );
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? <p className="field-error">{error}</p> : hint ? <p className="mt-1.5 text-[12px] text-ink-faint">{hint}</p> : null}
    </div>
  );
}

export function DescriptionList({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  const visible = items.filter((item) => item.value !== null && item.value !== undefined && item.value !== "");
  if (visible.length === 0) return <p className="text-[13px] text-ink-faint">Nothing recorded yet.</p>;
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {visible.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">{item.label}</dt>
          <dd className="mt-0.5 text-[13px] break-words text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-[12px] font-medium text-ink-muted hover:text-ink">
      {children}
    </Link>
  );
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const text = parts.length === 0 ? "?" : parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0];
  const dims = size === "lg" ? "h-12 w-12 text-[15px]" : size === "sm" ? "h-7 w-7 text-[11px]" : "h-9 w-9 text-[12px]";
  return (
    <span className={cx("inline-flex shrink-0 items-center justify-center rounded-full bg-sage-100 font-semibold text-sage-900 uppercase", dims)}>
      {text}
    </span>
  );
}
