"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/lib/validation";
import { SubmitButton } from "@/components/ui/form-controls";

/** Registers a connected number for sending with the two-step verification PIN it already has. */
export function RegisterPinForm({ action }: { action: (prev: ActionResult, formData: FormData) => Promise<ActionResult> }) {
  const [state, formAction] = useActionState(action, { ok: true });
  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
      <label className="text-[12px] text-ink-muted">
        Two-step verification PIN
        <input name="pin" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="off" className="input mt-1 w-32" placeholder="123456" />
      </label>
      <SubmitButton variant="btn-secondary" className="btn-sm" pendingText="Registering…">
        Register number
      </SubmitButton>
      {!state.ok && (state.error || state.fieldErrors?.pin) ? <p className="form-error w-full">{state.error ?? state.fieldErrors?.pin}</p> : null}
    </form>
  );
}
