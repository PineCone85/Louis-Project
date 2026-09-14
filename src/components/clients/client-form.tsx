"use client";

import Link from "next/link";
import { useActionState } from "react";
import { saveClientAction } from "@/lib/actions/clients";
import { CLIENT_SOURCES, CLIENT_TYPES } from "@/lib/constants";
import type { Client } from "@/lib/db/schema";
import { toDateTimeLocal } from "@/lib/format";
import { STAGES } from "@/lib/pipeline";
import type { ActionResult } from "@/lib/validation";
import { SubmitButton } from "@/components/ui/form-controls";
import { Field, cx } from "@/components/ui/primitives";

export type ClientFormInitial = Partial<Pick<Client, "firstName" | "lastName" | "email" | "alternateEmail" | "phone" | "alternatePhone" | "clientType" | "stage" | "source" | "budgetMin" | "budgetMax" | "preferredAreas" | "requirements" | "notes" | "nextFollowUpAt">>;

export function ClientForm({ id, initial, cancelHref, currency, timezone }: { id?: string; initial?: ClientFormInitial; cancelHref: string; currency: string; timezone: string }) {
  const [state, action] = useActionState<ActionResult, FormData>(saveClientAction, { ok: true });
  const errors = (!state.ok && state.fieldErrors) || {};
  const input = (name: string) => cx("input", errors[name] && "input-error");

  return (
    <form action={action} className="space-y-6">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      {!state.ok && state.error ? <p className="form-error">{state.error}</p> : null}

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Details</h2>
        </div>
        <div className="panel-body grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="First name" htmlFor="firstName" error={errors.firstName}>
            <input id="firstName" name="firstName" defaultValue={initial?.firstName ?? ""} required className={input("firstName")} autoFocus={!id} />
          </Field>
          <Field label="Last name" htmlFor="lastName" error={errors.lastName}>
            <input id="lastName" name="lastName" defaultValue={initial?.lastName ?? ""} className={input("lastName")} />
          </Field>
          <Field label="Client type" htmlFor="clientType">
            <select id="clientType" name="clientType" defaultValue={initial?.clientType ?? "buyer"} className="select">
              {CLIENT_TYPES.map((type) => (
                <option key={type.key} value={type.key}>
                  {type.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Pipeline stage" htmlFor="stage">
            <select id="stage" name="stage" defaultValue={initial?.stage ?? "prospect"} className="select">
              {STAGES.map((stage) => (
                <option key={stage.key} value={stage.key}>
                  {stage.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Source" htmlFor="source">
            <input id="source" name="source" list="client-sources" defaultValue={initial?.source ?? ""} className="input" placeholder="How did they find you?" />
            <datalist id="client-sources">
              {CLIENT_SOURCES.map((source) => (
                <option key={source} value={source} />
              ))}
            </datalist>
          </Field>
          <Field label="Next follow-up" htmlFor="nextFollowUpAt" error={errors.nextFollowUpAt}>
            <input id="nextFollowUpAt" name="nextFollowUpAt" type="datetime-local" defaultValue={toDateTimeLocal(initial?.nextFollowUpAt ?? null, timezone)} className={input("nextFollowUpAt")} />
          </Field>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Contact</h2>
          <span className="text-[12px] text-ink-muted">Messages from these addresses are matched to this client automatically.</span>
        </div>
        <div className="panel-body grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Email" htmlFor="email" error={errors.email}>
            <input id="email" name="email" type="email" defaultValue={initial?.email ?? ""} className={input("email")} />
          </Field>
          <Field label="Alternate email" htmlFor="alternateEmail" error={errors.alternateEmail}>
            <input id="alternateEmail" name="alternateEmail" type="email" defaultValue={initial?.alternateEmail ?? ""} className={input("alternateEmail")} />
          </Field>
          <Field label="Mobile (WhatsApp)" htmlFor="phone" error={errors.phone} hint="Include the area code, for example 082 123 4567 or +27 82 123 4567.">
            <input id="phone" name="phone" type="tel" defaultValue={initial?.phone ?? ""} className={input("phone")} />
          </Field>
          <Field label="Alternate phone" htmlFor="alternatePhone" error={errors.alternatePhone}>
            <input id="alternatePhone" name="alternatePhone" type="tel" defaultValue={initial?.alternatePhone ?? ""} className={input("alternatePhone")} />
          </Field>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Requirements</h2>
        </div>
        <div className="panel-body grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label={`Minimum budget (${currency})`} htmlFor="budgetMin" error={errors.budgetMin}>
            <input id="budgetMin" name="budgetMin" inputMode="numeric" defaultValue={initial?.budgetMin ?? ""} className={input("budgetMin")} placeholder="0" />
          </Field>
          <Field label={`Maximum budget (${currency})`} htmlFor="budgetMax" error={errors.budgetMax}>
            <input id="budgetMax" name="budgetMax" inputMode="numeric" defaultValue={initial?.budgetMax ?? ""} className={input("budgetMax")} placeholder="0" />
          </Field>
          <Field label="Preferred areas" htmlFor="preferredAreas" className="md:col-span-2">
            <input id="preferredAreas" name="preferredAreas" defaultValue={initial?.preferredAreas ?? ""} className="input" placeholder="Suburbs, neighbourhoods or towns" />
          </Field>
          <Field label="Requirements" htmlFor="requirements" className="md:col-span-2" hint="Bedrooms, must-haves, timeline, financing position.">
            <textarea id="requirements" name="requirements" defaultValue={initial?.requirements ?? ""} className="textarea" rows={3} />
          </Field>
          <Field label="Notes" htmlFor="notes" className="md:col-span-2">
            <textarea id="notes" name="notes" defaultValue={initial?.notes ?? ""} className="textarea" rows={4} />
          </Field>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <SubmitButton>{id ? "Save changes" : "Add client"}</SubmitButton>
        <Link href={cancelHref} className="btn btn-ghost">
          Cancel
        </Link>
      </div>
    </form>
  );
}
