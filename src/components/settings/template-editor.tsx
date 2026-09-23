"use client";

import { useActionState, useState } from "react";
import { deleteTemplateAction, saveTemplateAction } from "@/lib/actions/templates";
import { TEMPLATE_PLACEHOLDERS } from "@/lib/constants";
import type { Template } from "@/lib/db/schema";
import type { ActionResult } from "@/lib/validation";
import { ActionButton, SubmitButton } from "@/components/ui/form-controls";
import { ChannelTag, EmptyState, Field, cx } from "@/components/ui/primitives";

function TemplateForm({ template, onClose }: { template: Template | null; onClose: () => void }) {
  const [state, action] = useActionState<ActionResult<{ saved: boolean }>, FormData>(
    async (previous, formData) => {
      const result = await saveTemplateAction(previous, formData);
      if (result.ok && result.data?.saved) onClose();
      return result;
    },
    { ok: true },
  );
  const [channel, setChannel] = useState(template?.channel ?? "any");
  const errors = (!state.ok && state.fieldErrors) || {};

  return (
    <form action={action} className="space-y-4 rounded-md border border-sage-200 bg-sage-50/60 p-4">
      {template ? <input type="hidden" name="id" value={template.id} /> : null}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Template name" htmlFor="template-name" error={errors.name}>
          <input id="template-name" name="name" defaultValue={template?.name ?? ""} className={cx("input", errors.name && "input-error")} autoFocus />
        </Field>
        <Field label="Channel" htmlFor="template-channel">
          <select id="template-channel" name="channel" className="select" value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="any">Email and WhatsApp</option>
            <option value="email">Email only</option>
            <option value="whatsapp">WhatsApp only</option>
          </select>
        </Field>
        {channel !== "whatsapp" ? (
          <Field label="Email subject" htmlFor="template-subject" className="md:col-span-2" hint="Optional. When blank, automatic replies use the original subject.">
            <input id="template-subject" name="subject" defaultValue={template?.subject ?? ""} className="input" />
          </Field>
        ) : null}
        <Field label="Message" htmlFor="template-body" error={errors.body} className="md:col-span-2">
          <textarea id="template-body" name="body" defaultValue={template?.body ?? ""} className={cx("textarea min-h-36", errors.body && "input-error")} />
        </Field>
      </div>
      <div className="text-[12px] text-ink-muted">
        <span className="font-medium text-ink">Placeholders: </span>
        {TEMPLATE_PLACEHOLDERS.map((p, index) => (
          <span key={p.token}>
            <code className="text-ink">{p.token}</code> {p.description}
            {index < TEMPLATE_PLACEHOLDERS.length - 1 ? " · " : ""}
          </span>
        ))}
      </div>
      {!state.ok && state.error ? <p className="form-error">{state.error}</p> : null}
      <div className="flex items-center gap-2">
        <SubmitButton>{template ? "Save template" : "Create template"}</SubmitButton>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function TemplateEditor({ templates }: { templates: Template[] }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-ink-muted">Templates are used for quick replies in conversations and as the content of automatic replies.</p>
        {editing !== "new" ? (
          <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
            New template
          </button>
        ) : null}
      </div>
      {editing === "new" ? <TemplateForm template={null} onClose={() => setEditing(null)} /> : null}
      <div className="panel">
        {templates.length === 0 && editing !== "new" ? (
          <EmptyState title="No templates yet" description="Create a template for common replies, such as acknowledging a new enquiry or confirming a viewing." />
        ) : (
          <ul className="divide-y divide-line">
            {templates.map((template) => (
              <li key={template.id} className="px-5 py-4">
                {editing === template.id ? (
                  <TemplateForm template={template} onClose={() => setEditing(null)} />
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-[14px] font-semibold text-ink">{template.name}</h3>
                        {template.channel === "any" ? (
                          <>
                            <ChannelTag channel="email" />
                            <ChannelTag channel="whatsapp" />
                          </>
                        ) : (
                          <ChannelTag channel={template.channel} />
                        )}
                      </div>
                      {template.subject ? <p className="mt-1 text-[12px] text-ink-muted">Subject: {template.subject}</p> : null}
                      <p className="mt-1.5 line-clamp-3 text-[13px] whitespace-pre-line text-ink-muted">{template.body}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(template.id)}>
                        Edit
                      </button>
                      <ActionButton className="btn-ghost btn-sm" confirmText={`Delete the template "${template.name}"?`} action={() => deleteTemplateAction(template.id)} pendingText="Deleting…">
                        Delete
                      </ActionButton>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
