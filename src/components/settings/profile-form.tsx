"use client";

import { useActionState } from "react";
import { saveProfileAction } from "@/lib/actions/settings";
import type { Settings } from "@/lib/db/schema";
import type { ActionResult } from "@/lib/validation";
import { SubmitButton } from "@/components/ui/form-controls";
import { Field, cx } from "@/components/ui/primitives";

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

export function ProfileForm({ settings }: { settings: Settings }) {
  const [state, action] = useActionState<ActionResult<{ saved: boolean }>, FormData>(saveProfileAction, { ok: true });
  const errors = (!state.ok && state.fieldErrors) || {};
  const input = (name: string) => cx("input", errors[name] && "input-error");

  return (
    <form action={action} className="space-y-6">
      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Your details</h2>
          <span className="text-[12px] text-ink-muted">Used in outgoing messages and template placeholders.</span>
        </div>
        <div className="panel-body grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Your name" htmlFor="agentName" error={errors.agentName}>
            <input id="agentName" name="agentName" defaultValue={settings.agentName} className={input("agentName")} />
          </Field>
          <Field label="Agency name" htmlFor="agencyName" error={errors.agencyName}>
            <input id="agencyName" name="agencyName" defaultValue={settings.agencyName} className={input("agencyName")} />
          </Field>
          <Field label="Your phone number" htmlFor="agentPhone" error={errors.agentPhone}>
            <input id="agentPhone" name="agentPhone" type="tel" defaultValue={settings.agentPhone} className={input("agentPhone")} />
          </Field>
          <Field label="Email signature" htmlFor="emailSignature" className="md:col-span-2" hint="Appended to emails you send from the CRM, including automatic replies.">
            <textarea id="emailSignature" name="emailSignature" defaultValue={settings.emailSignature} className="textarea" rows={4} />
          </Field>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Region and business hours</h2>
        </div>
        <div className="panel-body grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Time zone" htmlFor="timezone" error={errors.timezone} hint="IANA name, for example Africa/Johannesburg">
            <input id="timezone" name="timezone" defaultValue={settings.timezone} className={input("timezone")} />
          </Field>
          <Field label="Default country" htmlFor="defaultCountry" error={errors.defaultCountry} hint="Two-letter code used to interpret local phone numbers">
            <input id="defaultCountry" name="defaultCountry" defaultValue={settings.defaultCountry} maxLength={2} className={cx(input("defaultCountry"), "uppercase")} />
          </Field>
          <Field label="Currency" htmlFor="currency" error={errors.currency}>
            <input id="currency" name="currency" defaultValue={settings.currency} maxLength={3} className={cx(input("currency"), "uppercase")} />
          </Field>
          <div className="md:col-span-3">
            <span className="label">Business days</span>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((day) => (
                <label key={day.value} className="flex h-9 cursor-pointer items-center gap-2 rounded-sm border border-line-strong bg-paper px-3 text-[13px]">
                  <input type="checkbox" name="businessDays" value={day.value} defaultChecked={settings.businessHours.days.includes(day.value)} className="checkbox" />
                  {day.label}
                </label>
              ))}
            </div>
          </div>
          <Field label="Opens" htmlFor="businessStart" error={errors.businessStart}>
            <input id="businessStart" name="businessStart" type="time" defaultValue={settings.businessHours.start} className={input("businessStart")} />
          </Field>
          <Field label="Closes" htmlFor="businessEnd" error={errors.businessEnd}>
            <input id="businessEnd" name="businessEnd" type="time" defaultValue={settings.businessHours.end} className={input("businessEnd")} />
          </Field>
          <p className="self-end pb-2 text-[12px] text-ink-faint md:col-span-1">Used by the &ldquo;outside business hours&rdquo; automatic reply trigger.</p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Mail tracking</h2>
        </div>
        <div className="panel-body space-y-3">
          <label className="flex cursor-pointer items-start gap-3 text-[13px]">
            <input type="checkbox" name="trackUnknownSenders" defaultChecked={settings.trackUnknownSenders} className="checkbox mt-0.5" />
            <span>
              <span className="font-medium text-ink">Keep emails from senders who are not clients yet</span>
              <span className="block text-ink-muted">New enquiries appear in the inbox so you can turn them into clients. Newsletters and promotions are always skipped.</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 text-[13px]">
            <input type="checkbox" name="syncSentMail" defaultChecked={settings.syncSentMail} className="checkbox mt-0.5" />
            <span>
              <span className="font-medium text-ink">Include emails you send to clients from Gmail directly</span>
              <span className="block text-ink-muted">Keeps the timeline complete even when you reply from your phone or the Gmail website.</span>
            </span>
          </label>
        </div>
      </section>

      {!state.ok && state.error ? <p className="form-error">{state.error}</p> : null}
      <div className="flex items-center gap-3">
        <SubmitButton>Save settings</SubmitButton>
        {state.ok && state.data?.saved ? <span className="text-[12px] text-sage-800">Saved</span> : null}
      </div>
    </form>
  );
}
