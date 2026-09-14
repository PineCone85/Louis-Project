"use client";

import { useFormStatus } from "react-dom";
import { useState, useTransition, type ReactNode } from "react";
import { cx } from "./primitives";

export function SubmitButton({ children, className, pendingText, variant = "btn-primary" }: { children: ReactNode; className?: string; pendingText?: string; variant?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={cx("btn", variant, className)} disabled={pending} aria-busy={pending}>
      {pending ? (pendingText ?? "Saving…") : children}
    </button>
  );
}

/** Button that asks for confirmation before running a server action. */
export function ConfirmButton({
  action,
  confirmText,
  children,
  className,
}: {
  action: () => Promise<unknown>;
  confirmText: string;
  children: ReactNode;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className={cx("btn", className)}
      disabled={pending}
      onClick={() => {
        if (!window.confirm(confirmText)) return;
        startTransition(async () => {
          await action();
        });
      }}
    >
      {pending ? "Working…" : children}
    </button>
  );
}

/** Button that runs a server action and shows the returned message. */
export function ActionButton({
  action,
  children,
  className,
  pendingText,
  successText,
  confirmText,
}: {
  action: () => Promise<{ ok: boolean; error?: string } | void>;
  children: ReactNode;
  className?: string;
  pendingText?: string;
  successText?: string;
  confirmText?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <button
        type="button"
        className={cx("btn", className)}
        disabled={pending}
        onClick={() => {
          if (confirmText && !window.confirm(confirmText)) return;
          setMessage(null);
          startTransition(async () => {
            const result = await action();
            if (result && !result.ok) setMessage({ ok: false, text: result.error ?? "Something went wrong" });
            else if (successText) setMessage({ ok: true, text: successText });
          });
        }}
      >
        {pending ? (pendingText ?? "Working…") : children}
      </button>
      {message ? <span className={cx("text-[12px]", message.ok ? "text-sage-800" : "text-danger")}>{message.text}</span> : null}
    </span>
  );
}
