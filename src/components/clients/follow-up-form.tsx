"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setFollowUpAction } from "@/lib/actions/clients";
import { toDateTimeLocal } from "@/lib/format";

export function FollowUpForm({ clientId, current, timezone }: { clientId: string; current: Date | null; timezone: string }) {
  const router = useRouter();
  const [value, setValue] = useState(toDateTimeLocal(current, timezone));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const save = (next: string | null) => {
    setError(null);
    startTransition(async () => {
      const result = await setFollowUpAction(clientId, next);
      if (!result.ok) setError(result.error ?? "Unable to save");
      else {
        if (next === null) setValue("");
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input type="datetime-local" className="input" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Follow-up date" />
        <button type="button" className="btn btn-secondary" disabled={pending || !value} onClick={() => save(value)}>
          Save
        </button>
      </div>
      {current ? (
        <button type="button" className="text-[12px] text-ink-muted hover:text-ink" disabled={pending} onClick={() => save(null)}>
          Clear follow-up
        </button>
      ) : null}
      {error ? <p className="field-error">{error}</p> : null}
    </div>
  );
}
