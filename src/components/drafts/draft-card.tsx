"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { dismissDraftAction, sendDraftAction } from "@/lib/actions/drafts";
import { formatSmartDate } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import type { DraftItem } from "@/lib/queries/drafts";
import type { ActionResult } from "@/lib/validation";
import { SubmitButton } from "@/components/ui/form-controls";
import { Avatar, ChannelTag, Field, StageChip, cx } from "@/components/ui/primitives";

export function DraftCard({ draft, initialBody, timezone }: { draft: DraftItem; initialBody: string; timezone: string }) {
  const router = useRouter();
  const [subject, setSubject] = useState(draft.subject ?? "");
  const [body, setBody] = useState(initialBody);
  const [done, setDone] = useState<"sent" | "dismissed" | null>(null);
  const [dismissing, startDismiss] = useTransition();
  const [state, action] = useActionState<ActionResult, FormData>(
    async (previous, formData) => {
      const result = await sendDraftAction(previous, formData);
      if (result.ok) {
        setDone("sent");
        router.refresh();
      }
      return result;
    },
    { ok: true },
  );
  const errors = (!state.ok && state.fieldErrors) || {};
  const name = draft.clientName ?? draft.contactName ?? (draft.channel === "whatsapp" ? formatPhone(draft.contactAddress) : draft.contactAddress);

  if (done) {
    return (
      <div className="panel px-5 py-4 text-[13px] text-ink-muted">
        {done === "sent" ? "Sent" : "Dismissed"}: {draft.channel === "email" ? "email" : "WhatsApp"} to {name}.
      </div>
    );
  }

  return (
    <form action={action} className="panel">
      <input type="hidden" name="id" value={draft.id} />
      <div className="flex items-start gap-3 border-b border-line px-5 py-4">
        <Avatar name={name} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {draft.clientId ? (
              <Link href={`/clients/${draft.clientId}`} className="text-[14px] font-semibold text-ink hover:underline">
                {name}
              </Link>
            ) : (
              <span className="text-[14px] font-semibold text-ink">{name}</span>
            )}
            <ChannelTag channel={draft.channel} />
            {draft.clientStage ? <StageChip stage={draft.clientStage} /> : <span className="badge badge-neutral">Not a client</span>}
            <span className="ml-auto text-[11px] text-ink-faint">{formatSmartDate(draft.createdAt, timezone)}</span>
          </div>
          <p className="mt-1 text-[12px] text-ink-muted">
            {draft.workflowName ? <span className="font-medium text-ink">{draft.workflowName}</span> : null}
            {draft.propertyTitle ? (
              <>
                {draft.workflowName ? " · " : ""}
                About{" "}
                {draft.propertyId ? (
                  <Link href={`/properties/${draft.propertyId}`} className="text-ink hover:underline">
                    {draft.propertyTitle}
                  </Link>
                ) : (
                  draft.propertyTitle
                )}
              </>
            ) : null}
            {draft.reason ? ` · ${draft.reason}` : ""}
          </p>
          <p className="mt-0.5 text-[12px] text-ink-faint">To {draft.channel === "whatsapp" ? formatPhone(draft.contactAddress) : draft.contactAddress}</p>
        </div>
      </div>
      <div className="space-y-3 px-5 py-4">
        {draft.channel === "email" ? (
          <Field label="Subject" htmlFor={`subject-${draft.id}`} error={errors.subject}>
            <input id={`subject-${draft.id}`} name="subject" className={cx("input", errors.subject && "input-error")} value={subject} onChange={(e) => setSubject(e.target.value)} />
          </Field>
        ) : null}
        <Field label="Message" htmlFor={`body-${draft.id}`} error={errors.body}>
          <textarea id={`body-${draft.id}`} name="body" className={cx("textarea", draft.channel === "email" ? "min-h-48" : "min-h-24", errors.body && "input-error")} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        {draft.notes ? (
          <p className="rounded-sm border border-sage-200 bg-sage-50 px-3 py-2 text-[12px] text-sage-900">
            <span className="font-medium">Check before sending: </span>
            {draft.notes}
          </p>
        ) : null}
        {!state.ok && state.error ? <p className="form-error">{state.error}</p> : null}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={dismissing}
            onClick={() =>
              startDismiss(async () => {
                await dismissDraftAction(draft.id);
                setDone("dismissed");
              })
            }
          >
            Dismiss
          </button>
          <SubmitButton pendingText="Sending…">{draft.channel === "email" ? "Send email" : "Send WhatsApp"}</SubmitButton>
        </div>
      </div>
    </form>
  );
}
