"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/lib/actions/auth";
import { SubmitButton } from "@/components/ui/form-controls";
import { Field } from "@/components/ui/primitives";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Email address" htmlFor="email">
        <input id="email" name="email" type="email" autoComplete="username" required className="input" autoFocus defaultValue={state.email ?? ""} />
      </Field>
      <Field label="Password" htmlFor="password">
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </Field>
      {state.error ? <p className="form-error">{state.error}</p> : null}
      <SubmitButton className="w-full" pendingText="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
