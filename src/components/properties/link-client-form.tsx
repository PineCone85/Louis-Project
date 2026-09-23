"use client";

import { useActionState, useState } from "react";
import { linkPropertyAction } from "@/lib/actions/clients";
import { CLIENT_PROPERTY_STATUSES } from "@/lib/constants";
import type { Client } from "@/lib/db/schema";
import type { ActionResult } from "@/lib/validation";
import { SubmitButton } from "@/components/ui/form-controls";
import { Field } from "@/components/ui/primitives";

type BriefClient = Pick<Client, "id" | "firstName" | "lastName" | "email" | "stage">;

export function LinkClientForm({ propertyId, clients }: { propertyId: string; clients: BriefClient[] }) {
  const [state, action] = useActionState<ActionResult, FormData>(linkPropertyAction, { ok: true });
  const [open, setOpen] = useState(false);
  const errors = (!state.ok && state.fieldErrors) || {};

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)} disabled={clients.length === 0}>
        {clients.length === 0 ? "Every client is already linked" : "Link a client"}
      </button>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="propertyId" value={propertyId} />
      <Field label="Client" htmlFor="link-client" error={errors.clientId}>
        <select id="link-client" name="clientId" className="select" defaultValue="" required>
          <option value="" disabled>
            Choose a client
          </option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {`${client.firstName} ${client.lastName}`.trim()}
              {client.email ? ` · ${client.email}` : ""}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label="Status" htmlFor="link-client-status">
          <select id="link-client-status" name="status" className="select" defaultValue="suggested">
            {CLIENT_PROPERTY_STATUSES.map((status) => (
              <option key={status.key} value={status.key}>
                {status.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Viewing date" htmlFor="link-client-viewing">
          <input id="link-client-viewing" type="datetime-local" name="viewingAt" className="input" />
        </Field>
      </div>
      <textarea name="notes" className="textarea min-h-16" rows={2} placeholder="Notes" />
      {!state.ok && state.error ? <p className="field-error">{state.error}</p> : null}
      <div className="flex items-center gap-2">
        <SubmitButton className="btn-sm" pendingText="Linking…">
          Link client
        </SubmitButton>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
