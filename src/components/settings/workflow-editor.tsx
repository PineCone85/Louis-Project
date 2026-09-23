"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { deleteWorkflowAction, moveWorkflowAction, runWorkflowForPropertyAction, saveWorkflowAction, toggleWorkflowAction } from "@/lib/actions/workflows";
import { ACTIVITY_TYPES, CLIENT_PROPERTY_STATUSES, CLIENT_TYPES, LISTING_TYPES, PROPERTY_STATUSES, PROPERTY_TYPES } from "@/lib/constants";
import type { Template, Workflow } from "@/lib/db/schema";
import { formatDateTime } from "@/lib/format";
import type { WorkflowRunItem } from "@/lib/queries/workflows";
import type { ActionResult } from "@/lib/validation";
import {
  ACTIONS,
  CHANNEL_CHOICES,
  DRAFT_TARGETS,
  OPERATORS,
  TRIGGERS,
  WORKFLOW_PLACEHOLDERS,
  actionDef,
  actionsForTrigger,
  fieldsForTrigger,
  triggerDef,
  type ActionType,
  type FieldDef,
  type MatchMode,
  type WorkflowAction,
  type WorkflowCondition,
} from "@/lib/workflows/types";
import { useStages } from "@/components/pipeline/stages-provider";
import { ConfirmButton, SubmitButton } from "@/components/ui/form-controls";
import { EmptyState, Field, cx } from "@/components/ui/primitives";

type PropertyOption = { id: string; title: string };

type Draft = {
  id: string | null;
  name: string;
  description: string;
  trigger: string;
  matchMode: MatchMode;
  enabled: boolean;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
};

const RECIPES: Array<{ name: string; description: string; build: () => Omit<Draft, "id"> }> = [
  {
    name: "New listing → AI drafts for matching clients",
    description: "When a property is added, find active clients whose budget and areas fit, link the property to them and draft a personal introduction for each.",
    build: () => ({
      name: "New listing: introduce to matching clients",
      description: "Links new listings to clients who fit and drafts an intro message for review.",
      trigger: "property.created",
      matchMode: "all",
      enabled: true,
      conditions: [{ field: "property.status", op: "eq", value: "available" }],
      actions: [
        act("link_property", { target: "matching_clients", status: "suggested", max_clients: "10" }),
        act("ai_draft", { target: "matching_clients", channel: "preferred", max_clients: "10", instruction: "" }),
        act("notify", { title: "{{matches.count}} clients matched {{property.title}}", body: "Drafts are waiting on the Drafts page." }),
      ],
    }),
  },
  {
    name: "New enquiry → notify me and set a follow-up",
    description: "When a first message arrives from someone new, add a notification and schedule a follow-up for tomorrow.",
    build: () => ({
      name: "New enquiry: follow up tomorrow",
      description: "",
      trigger: "message.received",
      matchMode: "all",
      enabled: true,
      conditions: [
        { field: "message.is_new_contact", op: "eq", value: "true" },
        { field: "message.is_automated", op: "eq", value: "false" },
      ],
      actions: [
        act("notify", { title: "New enquiry from {{contact.name}}", body: "{{message.snippet}}" }),
        act("set_follow_up", { days: "1", time: "09:00", only_if_empty: "true" }),
      ],
    }),
  },
  {
    name: "Follow-up due → AI drafts a check-in",
    description: "When a client's follow-up date arrives, draft a check-in message so you only have to read and send.",
    build: () => ({
      name: "Follow-up due: draft a check-in",
      description: "",
      trigger: "client.follow_up_due",
      matchMode: "all",
      enabled: true,
      conditions: [],
      actions: [act("ai_draft", { target: "event_client", channel: "preferred", instruction: "Check in ahead of the follow-up and ask what would help next." })],
    }),
  },
  {
    name: "Gone quiet for 14 days → nudge me",
    description: "When an active client has had no contact for two weeks, notify you and add a note.",
    build: () => ({
      name: "Gone quiet: 14-day nudge",
      description: "",
      trigger: "client.inactive",
      matchMode: "all",
      enabled: true,
      conditions: [{ field: "client.days_since_contact", op: "gte", value: "14" }],
      actions: [
        act("notify", { title: "{{client.full_name}} has gone quiet", body: "No contact for {{client.days_since_contact}} days while in {{client.stage_label}}." }),
        act("log_activity", { activity_type: "note", body: "Flagged by workflow: no contact for {{client.days_since_contact}} days." }),
      ],
    }),
  },
  {
    name: "Property sold → tell interested clients",
    description: "When a listing is marked sold or rented, draft a message to everyone who had it on their record.",
    build: () => ({
      name: "Sold: update interested clients",
      description: "",
      trigger: "property.status_changed",
      matchMode: "any",
      enabled: true,
      conditions: [
        { field: "property.status", op: "eq", value: "sold" },
        { field: "property.status", op: "eq", value: "rented" },
      ],
      actions: [act("ai_draft", { target: "linked_clients", channel: "preferred", instruction: "" })],
    }),
  },
  {
    name: "Offer accepted → schedule the next step",
    description: "When a client reaches an offer-accepted stage, add a note and set a follow-up in three days.",
    build: () => ({
      name: "Offer accepted: bond follow-up",
      description: "",
      trigger: "client.stage_changed",
      matchMode: "all",
      enabled: true,
      conditions: [{ field: "client.stage", op: "eq", value: "offer_accepted" }],
      actions: [
        act("log_activity", { activity_type: "note", body: "Offer accepted. Check bond application progress and confirm the attorneys have been instructed." }),
        act("set_follow_up", { days: "3", time: "09:00" }),
      ],
    }),
  },
];

/** Builds an action with a loosely typed config, which keeps the recipe literals readable. */
function act(type: ActionType, config: Record<string, string>): WorkflowAction {
  return { type, config };
}

function emptyDraft(): Draft {
  return { id: null, name: "", description: "", trigger: "property.created", matchMode: "all", enabled: true, conditions: [], actions: [] };
}

function draftFrom(workflow: Workflow): Draft {
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description ?? "",
    trigger: workflow.trigger,
    matchMode: (workflow.matchMode as MatchMode) ?? "all",
    enabled: workflow.enabled,
    conditions: workflow.conditions,
    actions: workflow.actions,
  };
}

// ---------------------------------------------------------------------------
// Option sets for select-type fields
// ---------------------------------------------------------------------------

function useOptionSets() {
  const stages = useStages();
  return useMemo(
    () => ({
      stages: stages.map((s) => ({ value: s.key, label: s.label })),
      clientTypes: CLIENT_TYPES.map((t) => ({ value: t.key, label: t.label })),
      propertyStatuses: PROPERTY_STATUSES.map((s) => ({ value: s.key, label: s.label })),
      listingTypes: LISTING_TYPES.map((t) => ({ value: t.key, label: t.label })),
      propertyTypes: PROPERTY_TYPES.map((t) => ({ value: t.key, label: t.label })),
      channels: [
        { value: "email", label: "Email" },
        { value: "whatsapp", label: "WhatsApp" },
      ],
      linkStatuses: CLIENT_PROPERTY_STATUSES.map((s) => ({ value: s.key, label: s.label })),
      activityTypes: ACTIVITY_TYPES.map((t) => ({ value: t.key, label: t.label })),
    }),
    [stages],
  );
}

type OptionSets = ReturnType<typeof useOptionSets>;

function optionLabel(sets: OptionSets, field: FieldDef | undefined, value: string): string {
  if (!field?.options) return value;
  return sets[field.options].find((o) => o.value === value)?.label ?? value;
}

// ---------------------------------------------------------------------------
// Condition row
// ---------------------------------------------------------------------------

function ConditionRow({ condition, fields, sets, onChange, onRemove }: { condition: WorkflowCondition; fields: FieldDef[]; sets: OptionSets; onChange: (c: WorkflowCondition) => void; onRemove: () => void }) {
  const field = fields.find((f) => f.key === condition.field) ?? fields[0];
  const operators = OPERATORS.filter((o) => (field ? o.kinds.includes(field.kind) : true));
  const operator = operators.find((o) => o.key === condition.op) ?? operators[0];
  const setField = (key: string) => {
    const next = fields.find((f) => f.key === key);
    const nextOps = OPERATORS.filter((o) => (next ? o.kinds.includes(next.kind) : true));
    onChange({ field: key, op: nextOps.some((o) => o.key === condition.op) ? condition.op : nextOps[0].key, value: "" });
  };
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
      <select className="select" value={field?.key ?? ""} onChange={(e) => setField(e.target.value)} aria-label="Field">
        {fields.map((f) => (
          <option key={f.key} value={f.key}>
            {f.label}
          </option>
        ))}
      </select>
      <select className="select" value={operator?.key ?? "eq"} onChange={(e) => onChange({ ...condition, op: e.target.value as WorkflowCondition["op"] })} aria-label="Comparison">
        {operators.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      {operator?.needsValue ? (
        field?.kind === "boolean" ? (
          <select className="select" value={condition.value || "true"} onChange={(e) => onChange({ ...condition, value: e.target.value })} aria-label="Value">
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        ) : field?.kind === "select" && field.options && operator.key !== "in" ? (
          <select className="select" value={condition.value} onChange={(e) => onChange({ ...condition, value: e.target.value })} aria-label="Value">
            <option value="">Choose…</option>
            {sets[field.options].map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            className="input"
            value={condition.value}
            onChange={(e) => onChange({ ...condition, value: e.target.value })}
            inputMode={field?.kind === "number" ? "numeric" : undefined}
            placeholder={operator.key === "in" ? "value1, value2" : field?.kind === "number" ? "0" : "text"}
            aria-label="Value"
          />
        )
      ) : (
        <span />
      )}
      <button type="button" className="btn btn-ghost btn-sm" onClick={onRemove} aria-label="Remove condition">
        <X size={14} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Action row
// ---------------------------------------------------------------------------

function ActionRow({
  action,
  available,
  trigger,
  templates,
  sets,
  onChange,
  onRemove,
}: {
  action: WorkflowAction;
  available: ReturnType<typeof actionsForTrigger>;
  trigger: string;
  templates: Template[];
  sets: OptionSets;
  onChange: (a: WorkflowAction) => void;
  onRemove: () => void;
}) {
  const def = actionDef(action.type);
  const set = (key: string, value: string) => onChange({ ...action, config: { ...action.config, [key]: value } });
  const subjects = triggerDef(trigger)?.subjects ?? [];
  const targets = DRAFT_TARGETS.filter((t) => t.needs.some((s) => subjects.includes(s)));
  const cfg = action.config;

  return (
    <div className="rounded-md border border-line bg-paper p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <select className="select" value={action.type} onChange={(e) => onChange({ type: e.target.value as ActionType, config: {} })} aria-label="Action">
            {available.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
          </select>
          {def ? <p className="mt-1 text-[12px] text-ink-faint">{def.description}</p> : null}
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRemove} aria-label="Remove action">
          <X size={14} />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        {action.type === "ai_draft" ? (
          <>
            <Field label="Write to" htmlFor={`target-${action.type}`}>
              <select id={`target-${action.type}`} className="select" value={cfg.target ?? targets[0]?.key ?? "event_client"} onChange={(e) => set("target", e.target.value)}>
                {targets.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Channel">
              <select className="select" value={cfg.channel ?? "preferred"} onChange={(e) => set("channel", e.target.value)} aria-label="Channel">
                {CHANNEL_CHOICES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Instruction for the AI" className="md:col-span-2" hint="Optional. What the message should achieve, e.g. offer a viewing on Saturday. Leave blank for a sensible default.">
              <textarea className="textarea min-h-16" value={cfg.instruction ?? ""} onChange={(e) => set("instruction", e.target.value)} aria-label="Instruction" />
            </Field>
            {(cfg.target ?? targets[0]?.key) !== "event_client" ? (
              <Field label="Maximum clients" hint="Best matches first.">
                <input className="input w-28" inputMode="numeric" value={cfg.max_clients ?? "10"} onChange={(e) => set("max_clients", e.target.value)} aria-label="Maximum clients" />
              </Field>
            ) : null}
          </>
        ) : null}

        {action.type === "send_template" ? (
          <>
            <Field label="Template">
              <select className="select" value={cfg.template_id ?? ""} onChange={(e) => set("template_id", e.target.value)} aria-label="Template">
                <option value="">Choose a template</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.channel})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Channel">
              <select className="select" value={cfg.channel ?? "preferred"} onChange={(e) => set("channel", e.target.value)} aria-label="Channel">
                {CHANNEL_CHOICES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Email subject" className="md:col-span-2" hint="Used when the template has no subject and the message is not a reply.">
              <input className="input" value={cfg.subject ?? ""} onChange={(e) => set("subject", e.target.value)} aria-label="Subject" />
            </Field>
          </>
        ) : null}

        {action.type === "notify" ? (
          <>
            <Field label="Title" className="md:col-span-2">
              <input className="input" value={cfg.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="{{workflow.name}}: {{client.full_name}}" aria-label="Title" />
            </Field>
            <Field label="Details" className="md:col-span-2">
              <textarea className="textarea min-h-16" value={cfg.body ?? ""} onChange={(e) => set("body", e.target.value)} aria-label="Details" />
            </Field>
          </>
        ) : null}

        {action.type === "log_activity" ? (
          <>
            <Field label="Type">
              <select className="select" value={cfg.activity_type ?? "note"} onChange={(e) => set("activity_type", e.target.value)} aria-label="Activity type">
                {ACTIVITY_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Text" className="md:col-span-2">
              <textarea className="textarea min-h-16" value={cfg.body ?? ""} onChange={(e) => set("body", e.target.value)} aria-label="Text" />
            </Field>
          </>
        ) : null}

        {action.type === "set_follow_up" ? (
          <>
            <Field label="Days from now">
              <input className="input w-28" inputMode="numeric" value={cfg.days ?? "1"} onChange={(e) => set("days", e.target.value)} aria-label="Days" />
            </Field>
            <Field label="At">
              <input className="input w-36" type="time" value={cfg.time ?? "09:00"} onChange={(e) => set("time", e.target.value)} aria-label="Time" />
            </Field>
            <label className="flex cursor-pointer items-center gap-2 text-[13px] md:col-span-2">
              <input type="checkbox" className="checkbox" checked={cfg.only_if_empty === "true"} onChange={(e) => set("only_if_empty", e.target.checked ? "true" : "false")} />
              Only if no follow-up is already scheduled
            </label>
          </>
        ) : null}

        {action.type === "change_stage" ? (
          <Field label="Move to">
            <select className="select" value={cfg.stage ?? ""} onChange={(e) => set("stage", e.target.value)} aria-label="Stage">
              <option value="">Choose a stage</option>
              {sets.stages.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        {action.type === "link_property" ? (
          <>
            <Field label="Link to">
              <select className="select" value={cfg.target ?? "matching_clients"} onChange={(e) => set("target", e.target.value)} aria-label="Link to">
                <option value="matching_clients">Clients who match the property</option>
              </select>
            </Field>
            <Field label="Mark as">
              <select className="select" value={cfg.status ?? "suggested"} onChange={(e) => set("status", e.target.value)} aria-label="Interest status">
                {CLIENT_PROPERTY_STATUSES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Maximum clients">
              <input className="input w-28" inputMode="numeric" value={cfg.max_clients ?? "10"} onChange={(e) => set("max_clients", e.target.value)} aria-label="Maximum clients" />
            </Field>
          </>
        ) : null}

        {action.type === "set_property_status" ? (
          <Field label="New status">
            <select className="select" value={cfg.status ?? ""} onChange={(e) => set("status", e.target.value)} aria-label="Status">
              <option value="">Choose a status</option>
              {PROPERTY_STATUSES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        {action.type === "webhook" ? (
          <>
            <Field label="URL" className="md:col-span-2">
              <input className="input" value={cfg.url ?? ""} onChange={(e) => set("url", e.target.value)} placeholder="https://example.com/hooks/foyer" aria-label="URL" />
            </Field>
            <Field label="Signing secret" className="md:col-span-2" hint="Optional. Sent as an HMAC-SHA256 signature in the X-Foyer-Signature header.">
              <input className="input" value={cfg.secret ?? ""} onChange={(e) => set("secret", e.target.value)} aria-label="Secret" />
            </Field>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

function WorkflowForm({ initial, templates, onClose }: { initial: Draft; templates: Template[]; onClose: () => void }) {
  const sets = useOptionSets();
  const [draft, setDraft] = useState<Draft>(initial);
  const [state, action] = useActionState<ActionResult<{ saved: boolean }>, FormData>(
    async (previous, formData) => {
      const result = await saveWorkflowAction(previous, formData);
      if (result.ok && result.data?.saved) onClose();
      return result;
    },
    { ok: true },
  );
  const errors = (!state.ok && state.fieldErrors) || {};
  const fields = fieldsForTrigger(draft.trigger);
  const available = actionsForTrigger(draft.trigger);
  const trigger = triggerDef(draft.trigger);

  const setTrigger = (key: string) => {
    const nextFields = new Set(fieldsForTrigger(key).map((f) => f.key));
    const nextActions = new Set(actionsForTrigger(key).map((a) => a.key));
    setDraft((d) => ({
      ...d,
      trigger: key,
      conditions: d.conditions.filter((c) => nextFields.has(c.field)),
      actions: d.actions.filter((a) => nextActions.has(a.type)),
    }));
  };
  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <form action={action} className="space-y-5 rounded-md border border-sage-200 bg-sage-50/60 p-4">
      {draft.id ? <input type="hidden" name="id" value={draft.id} /> : null}
      <input type="hidden" name="conditions" value={JSON.stringify(draft.conditions)} />
      <input type="hidden" name="actions" value={JSON.stringify(draft.actions)} />
      <input type="hidden" name="matchMode" value={draft.matchMode} />
      <input type="hidden" name="trigger" value={draft.trigger} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Workflow name" htmlFor="wf-name" error={errors.name}>
          <input id="wf-name" name="name" value={draft.name} onChange={(e) => update({ name: e.target.value })} className={cx("input", errors.name && "input-error")} autoFocus placeholder="New listing: introduce to matching clients" />
        </Field>
        <Field label="Description" htmlFor="wf-description" hint="Optional, for your own reference.">
          <input id="wf-description" name="description" value={draft.description} onChange={(e) => update({ description: e.target.value })} className="input" />
        </Field>
      </div>

      <section className="space-y-2">
        <h3 className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase">When</h3>
        <Field label="Trigger" htmlFor="wf-trigger" hint={trigger?.description}>
          <select id="wf-trigger" className="select" value={draft.trigger} onChange={(e) => setTrigger(e.target.value)}>
            {(["Clients", "Properties", "Messages", "Time-based"] as const).map((group) => (
              <optgroup key={group} label={group}>
                {TRIGGERS.filter((t) => t.group === group).map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase">Only if</h3>
          {draft.conditions.length > 1 ? (
            <select className="select h-8 w-44 text-[12px]" value={draft.matchMode} onChange={(e) => update({ matchMode: e.target.value as MatchMode })} aria-label="Match mode">
              <option value="all">All conditions must match</option>
              <option value="any">Any condition may match</option>
            </select>
          ) : null}
        </div>
        {draft.conditions.length === 0 ? <p className="text-[13px] text-ink-muted">No conditions: the workflow runs every time the trigger fires.</p> : null}
        <div className="space-y-2">
          {draft.conditions.map((condition, index) => (
            <ConditionRow
              key={index}
              condition={condition}
              fields={fields}
              sets={sets}
              onChange={(next) => update({ conditions: draft.conditions.map((c, i) => (i === index ? next : c)) })}
              onRemove={() => update({ conditions: draft.conditions.filter((_, i) => i !== index) })}
            />
          ))}
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={fields.length === 0}
          onClick={() => update({ conditions: [...draft.conditions, { field: fields[0].key, op: OPERATORS.find((o) => o.kinds.includes(fields[0].kind))?.key ?? "eq", value: "" }] })}
        >
          <Plus size={14} /> Add condition
        </button>
      </section>

      <section className="space-y-2">
        <h3 className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase">Then</h3>
        {draft.actions.length === 0 ? <p className="text-[13px] text-ink-muted">Add at least one action. They run in order.</p> : null}
        <div className="space-y-2">
          {draft.actions.map((item, index) => (
            <ActionRow
              key={index}
              action={item}
              available={available}
              trigger={draft.trigger}
              templates={templates}
              sets={sets}
              onChange={(next) => update({ actions: draft.actions.map((a, i) => (i === index ? next : a)) })}
              onRemove={() => update({ actions: draft.actions.filter((_, i) => i !== index) })}
            />
          ))}
        </div>
        <button type="button" className="btn btn-secondary btn-sm" disabled={available.length === 0} onClick={() => update({ actions: [...draft.actions, { type: available[0].key, config: {} }] })}>
          <Plus size={14} /> Add action
        </button>
        <details className="text-[12px] text-ink-faint">
          <summary className="cursor-pointer">Placeholders you can use in titles, notes and subjects</summary>
          <ul className="mt-1 grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            {WORKFLOW_PLACEHOLDERS.map((p) => (
              <li key={p.token}>
                <code className="text-ink">{p.token}</code> {p.description}
              </li>
            ))}
          </ul>
        </details>
      </section>

      <label className="flex cursor-pointer items-center gap-2 text-[13px]">
        <input type="checkbox" name="enabled" className="checkbox" checked={draft.enabled} onChange={(e) => update({ enabled: e.target.checked })} />
        Workflow enabled
      </label>
      {!state.ok && state.error ? <p className="form-error">{state.error}</p> : null}
      <div className="flex items-center gap-2">
        <SubmitButton>{draft.id ? "Save workflow" : "Create workflow"}</SubmitButton>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Run now (property workflows)
// ---------------------------------------------------------------------------

function RunNow({ workflowId, properties }: { workflowId: string; properties: PropertyOption[] }) {
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  if (properties.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
      <span className="text-ink-faint">Try it:</span>
      <select className="select h-8 w-56 text-[12px]" value={propertyId} onChange={(e) => setPropertyId(e.target.value)} aria-label="Property to run against">
        {properties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await runWorkflowForPropertyAction(workflowId, propertyId);
            setMessage(result.ok ? "Ran. Check Drafts and the run log below." : (result.error ?? "Could not run"));
          })
        }
      >
        {pending ? "Running…" : "Run now"}
      </button>
      {message ? <span className="text-ink-muted">{message}</span> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

function summarize(workflow: Workflow, sets: OptionSets): { when: string; then: string } {
  const fields = fieldsForTrigger(workflow.trigger);
  const when = workflow.conditions
    .map((c) => {
      const field = fields.find((f) => f.key === c.field);
      const op = OPERATORS.find((o) => o.key === c.op);
      return `${field?.label ?? c.field} ${op?.label ?? c.op}${op?.needsValue ? ` ${optionLabel(sets, field, c.value)}` : ""}`;
    })
    .join(workflow.matchMode === "any" ? " or " : " and ");
  const then = workflow.actions.map((a) => actionDef(a.type)?.label ?? a.type).join(" → ");
  return { when, then };
}

export function WorkflowEditor({ workflows, runs, templates, properties, timezone }: { workflows: Workflow[]; runs: WorkflowRunItem[]; templates: Template[]; properties: PropertyOption[]; timezone: string }) {
  const sets = useOptionSets();
  const [editing, setEditing] = useState<{ id: string | "new"; draft: Draft } | null>(null);
  const [showRecipes, setShowRecipes] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[13px] text-ink-muted">
          A workflow watches for something happening in Foyer and then does things for you: draft messages with AI, send a template, notify you, update the client or property, or call another system.
          AI drafts always wait for your approval on the Drafts page.
        </p>
        {!editing ? (
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setShowRecipes((v) => !v)}>
              {showRecipes ? "Hide recipes" : "Start from a recipe"}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setEditing({ id: "new", draft: emptyDraft() })}>
              New workflow
            </button>
          </div>
        ) : null}
      </div>

      {showRecipes && !editing ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {RECIPES.map((recipe) => (
            <button
              key={recipe.name}
              type="button"
              className="rounded-md border border-line bg-paper p-4 text-left transition-colors hover:border-sage-300 hover:bg-sage-50/60"
              onClick={() => {
                setEditing({ id: "new", draft: { id: null, ...recipe.build() } });
                setShowRecipes(false);
              }}
            >
              <span className="block text-[13px] font-semibold text-ink">{recipe.name}</span>
              <span className="mt-1 block text-[12px] text-ink-muted">{recipe.description}</span>
            </button>
          ))}
        </div>
      ) : null}

      {editing?.id === "new" ? <WorkflowForm initial={editing.draft} templates={templates} onClose={() => setEditing(null)} /> : null}

      <div className="panel">
        {workflows.length === 0 && editing?.id !== "new" ? (
          <EmptyState title="No workflows yet" description="Start from a recipe, or build your own from any trigger." />
        ) : (
          <ol className="divide-y divide-line">
            {workflows.map((workflow, index) => {
              const { when, then } = summarize(workflow, sets);
              const trigger = triggerDef(workflow.trigger);
              const isProperty = trigger?.subjects.includes("property") && !trigger.subjects.includes("link");
              return (
                <li key={workflow.id} className="px-5 py-4">
                  {editing?.id === workflow.id ? (
                    <WorkflowForm initial={editing.draft} templates={templates} onClose={() => setEditing(null)} />
                  ) : (
                    <div className="flex items-start gap-4">
                      <div className="flex flex-col gap-1 pt-0.5">
                        <form action={moveWorkflowAction.bind(null, workflow.id, "up")}>
                          <button type="submit" className="text-ink-faint hover:text-ink disabled:opacity-30" disabled={index === 0} aria-label="Move up">
                            <ArrowUp size={14} />
                          </button>
                        </form>
                        <form action={moveWorkflowAction.bind(null, workflow.id, "down")}>
                          <button type="submit" className="text-ink-faint hover:text-ink disabled:opacity-30" disabled={index === workflows.length - 1} aria-label="Move down">
                            <ArrowDown size={14} />
                          </button>
                        </form>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className={cx("text-[14px] font-semibold", workflow.enabled ? "text-ink" : "text-ink-muted line-through")}>{workflow.name}</h3>
                          {!workflow.enabled ? <span className="badge badge-neutral">Paused</span> : null}
                          {trigger?.scheduled ? <span className="badge badge-neutral">Checked on sync</span> : null}
                        </div>
                        <p className="mt-1 text-[13px] text-ink-muted">
                          <span className="font-medium text-ink">When</span> {trigger?.label ?? workflow.trigger}
                          {when ? (
                            <>
                              {" "}
                              <span className="font-medium text-ink">only if</span> {when}
                            </>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-[13px] text-ink-muted">
                          <span className="font-medium text-ink">Then</span> {then || "nothing"}
                        </p>
                        <p className="mt-0.5 text-[12px] text-ink-faint">
                          Ran {workflow.timesTriggered} time{workflow.timesTriggered === 1 ? "" : "s"}
                          {workflow.lastTriggeredAt ? `, last ${formatDateTime(workflow.lastTriggeredAt, timezone)}` : ""}
                          {workflow.description ? ` · ${workflow.description}` : ""}
                        </p>
                        {isProperty ? <RunNow workflowId={workflow.id} properties={properties} /> : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <form action={toggleWorkflowAction.bind(null, workflow.id, !workflow.enabled)}>
                          <button type="submit" className="btn btn-secondary btn-sm">
                            {workflow.enabled ? "Pause" : "Resume"}
                          </button>
                        </form>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing({ id: workflow.id, draft: draftFrom(workflow) })}>
                          Edit
                        </button>
                        <ConfirmButton className="btn-ghost btn-sm" confirmText={`Delete the workflow "${workflow.name}"?`} action={() => deleteWorkflowAction(workflow.id)}>
                          Delete
                        </ConfirmButton>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Recent runs</h2>
        </div>
        {runs.length === 0 ? (
          <EmptyState title="Nothing has run yet" description="Runs appear here with what each step did." />
        ) : (
          <ul className="divide-y divide-line">
            {runs.map((run) => (
              <li key={run.id} className="px-5 py-3 text-[13px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cx("badge", run.status === "failed" ? "badge-danger" : "badge-sage")}>{run.status === "failed" ? "Failed" : "Completed"}</span>
                  <span className="font-medium text-ink">{run.workflowName}</span>
                  <span className="text-ink-muted">{run.subject}</span>
                  <span className="ml-auto text-[12px] text-ink-faint">{formatDateTime(run.createdAt, timezone)}</span>
                </div>
                {run.steps.length > 0 ? (
                  <ul className="mt-1.5 space-y-0.5 text-[12px] text-ink-muted">
                    {run.steps.map((step, i) => (
                      <li key={i} className="flex gap-2">
                        <span className={cx("w-14 shrink-0 font-medium", step.status === "failed" ? "text-danger" : step.status === "skipped" ? "text-ink-faint" : "text-sage-800")}>{step.status}</span>
                        <span>
                          <span className="text-ink">{actionDef(step.action)?.label ?? step.action}</span>: {step.detail}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export type { Draft as WorkflowDraft };
export { ACTIONS as WORKFLOW_ACTIONS };
