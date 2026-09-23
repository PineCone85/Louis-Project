"use client";

import { useActionState, useRef } from "react";
import { addActivityAction } from "@/lib/actions/clients";
import { ACTIVITY_TYPES } from "@/lib/constants";
import type { ActionResult } from "@/lib/validation";
import { SubmitButton } from "@/components/ui/form-controls";

export function ActivityForm({ clientId }: { clientId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState<ActionResult, FormData>(
    async (previous, formData) => {
      const result = await addActivityAction(previous, formData);
      if (result.ok) formRef.current?.reset();
      return result;
    },
    { ok: true },
  );
  const errors = (!state.ok && state.fieldErrors) || {};

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <input type="hidden" name="clientId" value={clientId} />
      <div className="flex items-center gap-2">
        <select name="type" className="select w-36" defaultValue="note" aria-label="Activity type">
          {ACTIVITY_TYPES.map((type) => (
            <option key={type.key} value={type.key}>
              {type.label}
            </option>
          ))}
        </select>
      </div>
      <textarea name="body" className="textarea" rows={3} placeholder="Add a note or log a call, meeting or viewing" />
      {errors.body ? <p className="field-error">{errors.body}</p> : null}
      {!state.ok && state.error ? <p className="form-error">{state.error}</p> : null}
      <SubmitButton variant="btn-secondary" pendingText="Adding…">
        Add to timeline
      </SubmitButton>
    </form>
  );
}
