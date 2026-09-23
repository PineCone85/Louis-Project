"use client";

import Link from "next/link";
import { useActionState } from "react";
import { linkConversationToClientAction } from "@/lib/actions/messages";
import type { Client } from "@/lib/db/schema";
import type { ActionResult } from "@/lib/validation";
import { SubmitButton } from "@/components/ui/form-controls";

type BriefClient = Pick<Client, "id" | "firstName" | "lastName" | "email" | "stage">;

export function LinkConversationForm({
  channel,
  contactAddress,
  contactName,
  clients,
}: {
  channel: string;
  contactAddress: string;
  contactName: string | null;
  clients: BriefClient[];
}) {
  const [state, action] = useActionState<ActionResult, FormData>(linkConversationToClientAction, { ok: true });
  const createHref = `/clients/new?${new URLSearchParams({
    ...(contactName ? { name: contactName } : {}),
    ...(channel === "email" ? { email: contactAddress } : { phone: contactAddress }),
  }).toString()}`;

  return (
    <div className="rounded-md border border-sage-200 bg-sage-50 p-4">
      <p className="text-[13px] font-medium text-ink">This contact is not linked to a client yet.</p>
      <p className="mt-1 text-[12px] text-ink-muted">Link the conversation to an existing client, or create a new client from these details.</p>
      <form action={action} className="mt-3 flex flex-wrap items-center gap-2">
        <input type="hidden" name="channel" value={channel} />
        <input type="hidden" name="contactAddress" value={contactAddress} />
        <select name="clientId" className="select w-64" defaultValue="" required aria-label="Client">
          <option value="" disabled>
            Choose an existing client
          </option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {`${client.firstName} ${client.lastName}`.trim()}
              {client.email ? ` · ${client.email}` : ""}
            </option>
          ))}
        </select>
        <SubmitButton variant="btn-secondary" pendingText="Linking…">
          Link to client
        </SubmitButton>
        <Link href={createHref} className="btn btn-primary">
          Create client
        </Link>
      </form>
      {!state.ok && state.error ? <p className="mt-2 text-[12px] text-danger">{state.error}</p> : null}
    </div>
  );
}
