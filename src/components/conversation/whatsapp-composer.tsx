"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { sendWhatsAppAction, sendWhatsAppTemplateAction } from "@/lib/actions/messages";
import { renderTemplate, type RenderContext } from "@/lib/auto-reply/render";
import type { Template } from "@/lib/db/schema";
import { formatDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import type { ActionResult } from "@/lib/validation";
import type { WhatsAppWindow } from "@/lib/whatsapp/send";
import { SubmitButton } from "@/components/ui/form-controls";
import { Field, cx } from "@/components/ui/primitives";

type Props = {
  clientId: string | null;
  contactName: string | null;
  client: { firstName: string; lastName: string } | null;
  phones: string[];
  window: WhatsAppWindow | null;
  timezone: string;
  templates: Template[];
  renderContext: RenderContext["settings"];
  onSent: () => void;
};

type ApprovedTemplate = {
  id: string;
  name: string;
  language: string;
  category: string;
  components: Array<{ type: string; format?: string; text?: string }>;
  parameters: { header: number; body: number };
};

function fill(text: string | undefined, params: string[]): string {
  return (text ?? "").replace(/\{\{(\d+)\}\}/g, (_, n: string) => params[Number(n) - 1] || `{{${n}}}`);
}

function TemplateSender({ phone, clientId, contactName, onSent }: { phone: string; clientId: string | null; contactName: string | null; onSent: () => void }) {
  const [state, action] = useActionState<ActionResult, FormData>(
    async (previous, formData) => {
      const result = await sendWhatsAppTemplateAction(previous, formData);
      if (result.ok) onSent();
      return result;
    },
    { ok: true },
  );
  const [templates, setTemplates] = useState<ApprovedTemplate[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [headerParams, setHeaderParams] = useState<string[]>([]);
  const [bodyParams, setBodyParams] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/whatsapp/templates", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as { templates: ApprovedTemplate[]; error?: string };
        if (cancelled) return;
        setTemplates(data.templates ?? []);
        if (data.error) setLoadError(data.error);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Unable to load templates from WhatsApp.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const template = templates?.find((t) => t.id === selected) ?? null;
  const preview = useMemo(() => {
    if (!template) return "";
    return template.components
      .map((c) => {
        if (c.type === "HEADER" && c.format === "TEXT") return fill(c.text, headerParams);
        if (c.type === "BODY") return fill(c.text, bodyParams);
        if (c.type === "FOOTER") return c.text ?? "";
        return "";
      })
      .filter(Boolean)
      .join("\n\n");
  }, [template, headerParams, bodyParams]);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="phone" value={phone} />
      {clientId ? <input type="hidden" name="clientId" value={clientId} /> : null}
      <input type="hidden" name="contactName" value={contactName ?? ""} />
      <input type="hidden" name="templateName" value={template?.name ?? ""} />
      <input type="hidden" name="language" value={template?.language ?? ""} />
      <input type="hidden" name="preview" value={preview} />
      {headerParams.map((value, index) => (
        <input key={`h${index}`} type="hidden" name="headerParam" value={value} />
      ))}
      {bodyParams.map((value, index) => (
        <input key={`b${index}`} type="hidden" name="bodyParam" value={value} />
      ))}

      <Field label="Approved template" htmlFor="wa-template" hint={loadError ?? "Templates are managed in Meta Business Manager and must be approved before use."}>
        <select
          id="wa-template"
          className="select"
          value={selected}
          onChange={(event) => {
            const next = templates?.find((t) => t.id === event.target.value) ?? null;
            setSelected(event.target.value);
            setHeaderParams(Array.from({ length: next?.parameters.header ?? 0 }, () => ""));
            setBodyParams(Array.from({ length: next?.parameters.body ?? 0 }, () => ""));
          }}
          disabled={templates === null}
        >
          <option value="">{templates === null ? "Loading templates…" : templates.length === 0 ? "No approved templates" : "Choose a template"}</option>
          {(templates ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.language}, {t.category.toLowerCase()})
            </option>
          ))}
        </select>
      </Field>
      {template && (headerParams.length > 0 || bodyParams.length > 0) ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {headerParams.map((value, index) => (
            <Field key={`hp${index}`} label={`Header {{${index + 1}}}`} htmlFor={`hp${index}`}>
              <input id={`hp${index}`} className="input" value={value} onChange={(e) => setHeaderParams((p) => p.map((v, i) => (i === index ? e.target.value : v)))} />
            </Field>
          ))}
          {bodyParams.map((value, index) => (
            <Field key={`bp${index}`} label={`Body {{${index + 1}}}`} htmlFor={`bp${index}`}>
              <input id={`bp${index}`} className="input" value={value} onChange={(e) => setBodyParams((p) => p.map((v, i) => (i === index ? e.target.value : v)))} />
            </Field>
          ))}
        </div>
      ) : null}
      {template ? (
        <div className="rounded-sm border border-line bg-canvas p-3 text-[13px] whitespace-pre-wrap text-ink">{preview || "This template has no text content."}</div>
      ) : null}
      {!state.ok && state.error ? <p className="form-error">{state.error}</p> : null}
      <div className="flex justify-end">
        <SubmitButton pendingText="Sending…">Send template</SubmitButton>
      </div>
    </form>
  );
}

export function WhatsAppComposer(props: Props) {
  const { onSent } = props;
  const [text, setText] = useState("");
  const [state, action] = useActionState<ActionResult, FormData>(
    async (previous, formData) => {
      const result = await sendWhatsAppAction(previous, formData);
      if (result.ok) {
        setText("");
        onSent();
      }
      return result;
    },
    { ok: true },
  );
  const [phone, setPhone] = useState(props.phones[0] ?? "");
  const [templateId, setTemplateId] = useState("");
  const [showTemplate, setShowTemplate] = useState(false);
  const errors = (!state.ok && state.fieldErrors) || {};
  const windowOpen = props.window?.open ?? false;

  const context = useMemo<RenderContext>(
    () => ({ client: props.client, contactName: props.contactName, settings: props.renderContext }),
    [props.client, props.contactName, props.renderContext],
  );

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const template = props.templates.find((t) => t.id === id);
    if (template) setText(renderTemplate(template.body, context));
  };

  const notice = windowOpen
    ? `Free-form replies are allowed until ${formatDateTime(props.window?.expiresAt, props.timezone)} (24 hours after their last message).`
    : props.window?.lastInboundAt
      ? `Their last message was ${formatDateTime(props.window.lastInboundAt, props.timezone)}. WhatsApp only allows free-form replies within 24 hours, so send an approved template to reopen the conversation.`
      : "This contact has not messaged you on WhatsApp yet. WhatsApp requires an approved template message to start a conversation.";

  return (
    <div className="space-y-3">
      <p className={cx("rounded-sm border px-3 py-2 text-[12px]", windowOpen ? "border-sage-200 bg-sage-50 text-sage-900" : "border-line bg-canvas text-ink-muted")}>{notice}</p>
      {windowOpen && !showTemplate ? (
        <form action={action} className="space-y-3">
          {props.clientId ? <input type="hidden" name="clientId" value={props.clientId} /> : null}
          <input type="hidden" name="contactName" value={props.contactName ?? ""} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            {props.phones.length > 1 ? (
              <select name="phone" className="select w-52" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="Phone number">
                {props.phones.map((p) => (
                  <option key={p} value={p}>
                    {formatPhone(p)}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <input type="hidden" name="phone" value={phone} />
                <span className="text-[12px] text-ink-muted">To {formatPhone(phone)}</span>
              </>
            )}
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
          <textarea name="text" className={cx("textarea min-h-24", errors.text && "input-error")} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a WhatsApp message" />
          {errors.text ? <p className="field-error">{errors.text}</p> : null}
          {!state.ok && state.error ? <p className="form-error">{state.error}</p> : null}
          <div className="flex items-center justify-between gap-3">
            <button type="button" className="text-[12px] font-medium text-ink-muted hover:text-ink" onClick={() => setShowTemplate(true)}>
              Send an approved template instead
            </button>
            <SubmitButton pendingText="Sending…">Send WhatsApp</SubmitButton>
          </div>
        </form>
      ) : (
        <>
          <TemplateSender phone={phone} clientId={props.clientId} contactName={props.contactName} onSent={props.onSent} />
          {windowOpen ? (
            <button type="button" className="text-[12px] font-medium text-ink-muted hover:text-ink" onClick={() => setShowTemplate(false)}>
              Back to free-form message
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
