"use client";

import { useState, useTransition, type FormEvent } from "react";
import { connectMailServerAction } from "@/lib/actions/settings";
import type { MailServerConfig } from "@/lib/db/schema";
import type { ActionResult } from "@/lib/validation";
import { Field, cx } from "@/components/ui/primitives";

/**
 * Connects a mailbox by its IMAP and SMTP settings. Opened with an existing mailbox's settings, it
 * updates them (for example after a password change) and keeps everything already imported.
 * Submitted by hand rather than through a form action, which would clear every field after a failed
 * attempt and make the agent type the server settings again.
 */
export function ConnectMailServerForm({ existing }: { existing?: { emailAddress: string; config: MailServerConfig | null } | null }) {
  const [state, setState] = useState<ActionResult<{ emailAddress: string }>>({ ok: true });
  const [pending, startTransition] = useTransition();
  const errors = (!state.ok && state.fieldErrors) || {};
  const input = (name: string) => cx("input", errors[name] && "input-error");
  const config = existing?.config;
  const security = (secure: boolean | undefined) => (secure === false ? "starttls" : "ssl");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    startTransition(async () => {
      const result = await connectMailServerAction(state, data);
      setState(result);
      if (result.ok && !existing) form.reset();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" id="mail-server">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Email address" htmlFor="ms-email" error={errors.emailAddress}>
          <input
            id="ms-email"
            name="emailAddress"
            type="email"
            autoComplete="off"
            defaultValue={existing?.emailAddress ?? ""}
            readOnly={Boolean(existing)}
            className={input("emailAddress")}
            placeholder="you@yourdomain.com"
          />
        </Field>
        <Field label="Email password" htmlFor="ms-password" error={errors.password} hint="The password your mail program uses for this address.">
          <input id="ms-password" name="password" type="password" autoComplete="new-password" className={input("password")} />
        </Field>
        <Field label="Incoming mail server (IMAP)" htmlFor="ms-imap-host" error={errors.imapHost} hint="Leave blank to use mail.yourdomain.">
          <input id="ms-imap-host" name="imapHost" defaultValue={config?.imap.host ?? ""} className={input("imapHost")} placeholder="mail.yourdomain.com" />
        </Field>
        <Field label="Outgoing mail server (SMTP)" htmlFor="ms-smtp-host" error={errors.smtpHost} hint="Leave blank to use the incoming server.">
          <input id="ms-smtp-host" name="smtpHost" defaultValue={config?.smtp.host ?? ""} className={input("smtpHost")} placeholder="Same as incoming" />
        </Field>
      </div>

      <details className="rounded-md border border-line px-4 py-3">
        <summary className="cursor-pointer text-[13px] font-medium text-ink">Ports, security and username</summary>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="IMAP security" htmlFor="ms-imap-security">
            <select id="ms-imap-security" name="imapSecurity" className="select" defaultValue={security(config?.imap.secure)}>
              <option value="ssl">SSL/TLS</option>
              <option value="starttls">STARTTLS</option>
            </select>
          </Field>
          <Field label="IMAP port" htmlFor="ms-imap-port" error={errors.imapPort} hint="993 for SSL/TLS, 143 for STARTTLS">
            <input id="ms-imap-port" name="imapPort" inputMode="numeric" defaultValue={config?.imap.port ?? ""} className={input("imapPort")} placeholder="993" />
          </Field>
          <div className="hidden md:block" />
          <Field label="SMTP security" htmlFor="ms-smtp-security">
            <select id="ms-smtp-security" name="smtpSecurity" className="select" defaultValue={security(config?.smtp.secure)}>
              <option value="ssl">SSL/TLS</option>
              <option value="starttls">STARTTLS</option>
            </select>
          </Field>
          <Field label="SMTP port" htmlFor="ms-smtp-port" error={errors.smtpPort} hint="465 for SSL/TLS, 587 for STARTTLS">
            <input id="ms-smtp-port" name="smtpPort" inputMode="numeric" defaultValue={config?.smtp.port ?? ""} className={input("smtpPort")} placeholder="465" />
          </Field>
          <Field label="Username" htmlFor="ms-username" error={errors.username} hint="Usually the full email address.">
            <input id="ms-username" name="username" autoComplete="off" defaultValue={config?.username ?? ""} className={input("username")} placeholder="Same as email address" />
          </Field>
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending} aria-busy={pending}>
          {pending ? "Checking the mail server…" : existing ? "Save and reconnect" : "Connect mailbox"}
        </button>
        <span className="text-[12px] text-ink-faint">The CRM signs in to both servers before saving. Folders are read only: nothing is marked as read or deleted.</span>
      </div>
      {!state.ok && state.error ? <p className="form-error">{state.error}</p> : null}
      {state.ok && state.data ? <p className="form-success">{state.data.emailAddress} connected. Recent mail is being imported in the background.</p> : null}
    </form>
  );
}
