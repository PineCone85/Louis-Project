"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MailSearch } from "lucide-react";
import { fillClientFromEmailsAction } from "@/lib/actions/clients";

/** Reads the client's emails and fills in the phone, budget, areas and requirements that are still empty. */
export function FillFromEmailButton({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="btn btn-secondary"
        disabled={pending}
        title="Fill in empty details (phone, budget, areas, requirements) from this client's emails"
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            const result = await fillClientFromEmailsAction(clientId);
            setMessage(result.ok ? (result.data?.summary ?? null) : (result.error ?? "Could not read the emails."));
            router.refresh();
          })
        }
      >
        <MailSearch size={14} /> {pending ? "Reading emails…" : "Fill in from emails"}
      </button>
      {message ? (
        <span className="max-w-xs text-xs text-ink-muted" role="status">
          {message}
        </span>
      ) : null}
    </div>
  );
}
