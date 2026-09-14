"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { linkPropertyAction, unlinkPropertyAction, updateClientPropertyAction } from "@/lib/actions/clients";
import { CLIENT_PROPERTY_STATUSES, labelFor } from "@/lib/constants";
import type { Property } from "@/lib/db/schema";
import { formatCurrency, formatDateTime, toDateTimeLocal } from "@/lib/format";
import type { ClientPropertyItem } from "@/lib/queries/clients";
import type { ActionResult } from "@/lib/validation";
import { ConfirmButton, SubmitButton } from "@/components/ui/form-controls";
import { Field, cx } from "@/components/ui/primitives";

type BriefProperty = Pick<Property, "id" | "title" | "suburb" | "city" | "price" | "status">;

function PropertyLinkRow({ clientId, item, currency, timezone }: { clientId: string; item: ClientPropertyItem; currency: string; timezone: string }) {
  const [state, action] = useActionState<ActionResult, FormData>(updateClientPropertyAction, { ok: true });
  const [editing, setEditing] = useState(false);
  const { property, link } = item;
  const location = [property.suburb, property.city].filter(Boolean).join(", ");

  return (
    <li className="px-5 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/properties/${property.id}`} className="block truncate text-[13px] font-medium text-ink hover:underline">
            {property.title}
          </Link>
          <p className="text-[12px] text-ink-muted">
            {[location, property.price ? formatCurrency(property.price, currency) : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span className={cx("badge", link.status === "purchased" ? "badge-ink" : link.status === "not_interested" ? "badge-neutral" : "badge-sage")}>
          {labelFor(CLIENT_PROPERTY_STATUSES, link.status)}
        </span>
      </div>
      {link.viewingAt ? <p className="mt-1 text-[12px] text-ink-muted">Viewing {formatDateTime(link.viewingAt, timezone)}</p> : null}
      {link.notes && !editing ? <p className="mt-1 text-[12px] whitespace-pre-line text-ink-muted">{link.notes}</p> : null}

      {editing ? (
        <form action={action} className="mt-3 space-y-2 rounded-sm border border-line bg-canvas p-3">
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="propertyId" value={property.id} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select name="status" defaultValue={link.status} className="select" aria-label="Status">
              {CLIENT_PROPERTY_STATUSES.map((status) => (
                <option key={status.key} value={status.key}>
                  {status.label}
                </option>
              ))}
            </select>
            <input type="datetime-local" name="viewingAt" defaultValue={toDateTimeLocal(link.viewingAt, timezone)} className="input" aria-label="Viewing date" />
          </div>
          <textarea name="notes" defaultValue={link.notes ?? ""} className="textarea min-h-16" rows={2} placeholder="Feedback or notes" />
          {!state.ok && state.error ? <p className="field-error">{state.error}</p> : null}
          <div className="flex items-center gap-2">
            <SubmitButton variant="btn-primary" className="btn-sm">
              Save
            </SubmitButton>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-2 flex items-center gap-3">
          <button type="button" className="text-[12px] font-medium text-ink-muted hover:text-ink" onClick={() => setEditing(true)}>
            Update status
          </button>
          <ConfirmButton
            className="btn-ghost btn-xs h-auto p-0 text-[12px] font-medium text-ink-muted hover:bg-transparent hover:text-danger"
            confirmText={`Remove ${property.title} from this client?`}
            action={() => unlinkPropertyAction(clientId, property.id)}
          >
            Remove
          </ConfirmButton>
        </div>
      )}
    </li>
  );
}

export function PropertyLinks({
  clientId,
  items,
  options,
  currency,
  timezone,
}: {
  clientId: string;
  items: ClientPropertyItem[];
  options: BriefProperty[];
  currency: string;
  timezone: string;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(linkPropertyAction, { ok: true });
  const [open, setOpen] = useState(false);
  const errors = (!state.ok && state.fieldErrors) || {};
  const available = options.filter((option) => !items.some((item) => item.property.id === option.id));

  return (
    <div>
      {items.length === 0 ? (
        <p className="px-5 py-4 text-[13px] text-ink-faint">No properties linked yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((item) => (
            <PropertyLinkRow key={item.property.id} clientId={clientId} item={item} currency={currency} timezone={timezone} />
          ))}
        </ul>
      )}
      <div className="border-t border-line px-5 py-3">
        {open ? (
          <form action={action} className="space-y-3">
            <input type="hidden" name="clientId" value={clientId} />
            <Field label="Property" htmlFor="link-property" error={errors.propertyId}>
              <select id="link-property" name="propertyId" className="select" defaultValue="" required>
                <option value="" disabled>
                  Choose a property
                </option>
                {available.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title}
                    {option.suburb ? ` · ${option.suburb}` : ""}
                    {option.price ? ` · ${formatCurrency(option.price, currency)}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field label="Status" htmlFor="link-status">
                <select id="link-status" name="status" className="select" defaultValue="suggested">
                  {CLIENT_PROPERTY_STATUSES.map((status) => (
                    <option key={status.key} value={status.key}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Viewing date" htmlFor="link-viewing">
                <input id="link-viewing" type="datetime-local" name="viewingAt" className="input" />
              </Field>
            </div>
            <textarea name="notes" className="textarea min-h-16" rows={2} placeholder="Why this property suits the client" />
            {!state.ok && state.error ? <p className="field-error">{state.error}</p> : null}
            <div className="flex items-center gap-2">
              <SubmitButton className="btn-sm" pendingText="Linking…">
                Link property
              </SubmitButton>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : available.length === 0 && options.length > 0 ? (
          <p className="text-[12px] text-ink-faint">Every property is already linked.</p>
        ) : options.length === 0 ? (
          <p className="text-[12px] text-ink-faint">
            <Link href="/properties/new" className="font-medium text-ink hover:underline">
              Add a property
            </Link>{" "}
            to start linking.
          </p>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>
            Link a property
          </button>
        )}
      </div>
    </div>
  );
}
