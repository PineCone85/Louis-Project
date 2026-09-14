"use client";

import { useActionState, useMemo, useState } from "react";
import { sendEmailAction } from "@/lib/actions/messages";
import { renderTemplate, withSignature, type RenderContext } from "@/lib/auto-reply/render";
import type { Template } from "@/lib/db/schema";
import { replySubject } from "@/lib/gmail/mime";
import type { ActionResult } from "@/lib/validation";
import { SubmitButton } from "@/components/ui/form-controls";
import { Field, cx } from "@/components/ui/primitives";

export type EmailThreadOption = { threadId: string; subject: string; lastAt: Date };

type Props = {
  clientId: string | null;
  contactName: string | null;
  client: { firstName: string; lastName: string } | null;
  emails: string[];
  threads: EmailThreadOption[];
  selectedThreadId: string | null;
  onSelectThread: (threadId: string | null) => void;
  signature: string;
  templates: Template[];
  renderContext: RenderContext["settings"];
  onSent: () => void;
};

export function EmailComposer(props: Props) {
  const { onSent } = props;
  const [state, action] = useActionState<ActionResult, FormData>(
    async (previous, formData) => {
      const result = await sendEmailAction(previous, formData);
      if (result.ok) onSent();
      return result;
    },
    { ok: true },
  );
  const thread = props.threads.find((t) => t.threadId === props.selectedThreadId) ?? null;
  const [subject, setSubject] = useState(thread ? replySubject(thread.subject) : "");
  const [previousThread, setPreviousThread] = useState(thread);
  if (thread !== previousThread) {
    setPreviousThread(thread);
    setSubject(thread ? replySubject(thread.subject) : "");
  }
  const [body, setBody] = useState(() => withSignature("", props.signature).replace(/^\n+/, "\n\n"));
  const [templateId, setTemplateId] = useState("");
  const errors = (!state.ok && state.fieldErrors) || {};

  const context = useMemo<RenderContext>(
    () => ({ client: props.client, contactName: props.contactName, settings: props.renderContext }),
    [props.client, props.contactName, props.renderContext],
  );

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const template = props.templates.find((t) => t.id === id);
    if (!template) return;
    setBody(withSignature(renderTemplate(template.body, context), props.signature));
    if (template.subject) setSubject(renderTemplate(template.subject, context));
  };

  return (
    <form action={action} className="space-y-3">
      {props.clientId ? <input type="hidden" name="clientId" value={props.clientId} /> : null}
      <input type="hidden" name="toName" value={props.contactName ?? ""} />
      {thread ? <input type="hidden" name="threadId" value={thread.threadId} /> : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="To" htmlFor="email-to" error={errors.to}>
          {props.emails.length > 1 ? (
            <select id="email-to" name="to" className="select" defaultValue={props.emails[0]}>
              {props.emails.map((email) => (
                <option key={email} value={email}>
                  {email}
                </option>
              ))}
            </select>
          ) : (
            <input id="email-to" name="to" type="email" className="input" defaultValue={props.emails[0] ?? ""} readOnly={props.emails.length === 1} />
          )}
        </Field>
        <Field label="Conversation" htmlFor="email-thread">
          <select
            id="email-thread"
            className="select"
            value={props.selectedThreadId ?? ""}
            onChange={(event) => props.onSelectThread(event.target.value || null)}
          >
            <option value="">New conversation</option>
            {props.threads.map((t) => (
              <option key={t.threadId} value={t.threadId}>
                Reply: {t.subject || "(no subject)"}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Subject" htmlFor="email-subject" error={errors.subject}>
        <input id="email-subject" name="subject" className={cx("input", errors.subject && "input-error")} value={subject} onChange={(e) => setSubject(e.target.value)} />
      </Field>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="label mb-0" htmlFor="email-body">
            Message
          </label>
          {props.templates.length > 0 ? (
            <select className="select h-7 w-48 text-[12px]" value={templateId} onChange={(e) => applyTemplate(e.target.value)} aria-label="Insert template">
              <option value="">Insert template…</option>
              {props.templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        <textarea id="email-body" name="body" className={cx("textarea min-h-40", errors.body && "input-error")} value={body} onChange={(e) => setBody(e.target.value)} />
        {errors.body ? <p className="field-error">{errors.body}</p> : null}
      </div>
      {!state.ok && state.error ? <p className="form-error">{state.error}</p> : null}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] text-ink-faint">Sent through your connected Gmail account and saved to the timeline.</span>
        <SubmitButton pendingText="Sending…">Send email</SubmitButton>
      </div>
    </form>
  );
}
