import { disconnectEmailAccountAction, enablePushAction, syncNowAction } from "@/lib/actions/settings";
import { configuredProviders, listEmailAccounts } from "@/lib/email/accounts";
import { EMAIL_PROVIDERS, providerLabel } from "@/lib/email/types";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { googleRedirectUri } from "@/lib/gmail/oauth";
import { microsoftRedirectUri } from "@/lib/outlook/oauth";
import { outlookPushPossible } from "@/lib/outlook/sync";
import { getSettings } from "@/lib/queries/settings";
import { ConnectMailServerForm } from "@/components/settings/connect-mail-server";
import { CopyField } from "@/components/ui/copy-field";
import { ActionButton, ConfirmButton } from "@/components/ui/form-controls";
import { Mail, Server } from "lucide-react";
import { DescriptionList, EmptyState, PageBody, Panel, cx } from "@/components/ui/primitives";

export const metadata = { title: "Email" };

const PROVIDER_STYLE: Record<string, { chip: string; letter: string }> = {
  gmail: { chip: "bg-[#fdecea] text-[#c5221f]", letter: "G" },
  outlook: { chip: "bg-[#e6f0fb] text-[#0f6cbd]", letter: "O" },
  imap: { chip: "bg-canvas text-ink-muted", letter: "@" },
};

function ProviderMark({ provider, size = "md" }: { provider: string; size?: "md" | "lg" }) {
  const style = PROVIDER_STYLE[provider] ?? PROVIDER_STYLE.imap;
  return (
    <span className={cx("flex shrink-0 items-center justify-center rounded-sm font-semibold", style.chip, size === "lg" ? "h-10 w-10 text-[17px]" : "h-8 w-8 text-[14px]")}>
      {provider === "imap" ? <Server size={size === "lg" ? 18 : 15} strokeWidth={1.75} /> : style.letter}
    </span>
  );
}

const ERRORS: Record<string, string> = {
  not_configured: "This provider is not configured yet. Add its client ID and secret to the environment, then reload this page.",
  denied: "Access was declined. Try again and approve access to the mailbox.",
  consent: "An administrator must consent before this organisation account can be used. Ask your Microsoft 365 administrator to grant the app access, or use a personal account.",
  state: "The sign-in attempt expired or was tampered with. Please try again.",
  no_refresh_token:
    "No refresh token was returned. For Google, remove the app at myaccount.google.com/permissions and connect again. For Microsoft, make sure the offline_access permission was granted.",
  scope: "The mailbox permissions were not granted. Connect again and approve every requested permission.",
  profile: "The mailbox address could not be read from the Microsoft account. Make sure the account has a mailbox.",
  exchange: "The provider rejected the sign-in. Check the client ID, secret and redirect URI, then try again.",
  oauth: "The provider returned an error during sign-in. Please try again.",
  mismatch: "You signed in with a different mailbox than the one you were reconnecting. The original mailbox is unchanged; connect the other one from the Add a mailbox section if you meant to.",
};

export default async function EmailSettingsPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string; provider?: string; mailbox?: string }> }) {
  const [params, accounts, settings] = await Promise.all([searchParams, listEmailAccounts(), getSettings()]);
  const providers = configuredProviders();
  const outlookPush = outlookPushPossible();
  const providerName = params.provider ? providerLabel(params.provider) : "The mailbox";
  const gmailPushUrl = `${env.appUrl}/api/webhooks/gmail?token=${env.google.pushToken ?? "{GMAIL_PUSH_TOKEN}"}`;
  const outlookPushUrl = `${env.appUrl}/api/webhooks/outlook`;
  const cronUrl = `${env.appUrl}/api/cron/sync`;
  const editing = accounts.find((a) => a.provider === "imap" && a.id === params.mailbox) ?? null;

  return (
    <PageBody>
      <div className="max-w-4xl space-y-6">
        {params.connected ? <p className="form-success">{providerName} connected. Recent mail is being imported in the background.</p> : null}
        {params.error ? <p className="form-error">{ERRORS[params.error] ?? "Something went wrong while connecting the mailbox."}</p> : null}

        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-sage-700 text-paper shadow-card">
            <Mail size={20} strokeWidth={2} />
          </span>
          <div>
            <h2 className="text-[17px] font-semibold text-ink">Email</h2>
            <p className="text-[13px] text-ink-muted">Gmail, Outlook and any other mailbox. Client mail lands on their timeline and in the inbox.</p>
          </div>
        </div>

        <Panel title="Connected mailboxes" padded={false} actions={accounts.length > 0 ? <ActionButton className="btn-secondary btn-sm" action={syncNowAction} pendingText="Syncing…" successText="Sync complete">Sync now</ActionButton> : null}>
          {accounts.length === 0 ? (
            <EmptyState
              title="No mailbox connected"
              description="Connect the mailbox you use with clients: Gmail, Outlook, or any other address through its mail server. Incoming mail is matched to clients by address, shown on their timeline, and replies are sent through the same account."
            />
          ) : (
            <ul className="divide-y divide-line">
              {accounts.map((account) => {
                const pushConfigured = account.provider === "gmail" ? Boolean(env.google.pubsubTopic) : account.provider === "outlook" && outlookPush.ok;
                const reconnectHref =
                  account.provider === "imap"
                    ? `/settings/email?mailbox=${account.id}#mail-server`
                    : `${account.provider === "gmail" ? "/api/auth/google" : "/api/auth/microsoft"}?hint=${encodeURIComponent(account.emailAddress)}`;
                const subscriptionError = account.provider === "outlook" ? account.syncState.outlook?.subscriptionError : null;
                const disconnect = disconnectEmailAccountAction.bind(null, account.id);
                const enablePush = enablePushAction.bind(null, account.id);
                return (
                  <li key={account.id} className="px-5 py-5">
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <ProviderMark provider={account.provider} />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-[15px] font-semibold text-ink">{account.emailAddress}</span>
                            {account.lastSyncError ? (
                              <span className="badge badge-danger">Needs attention</span>
                            ) : !account.backfillCompletedAt ? (
                              <span className="badge badge-warning">Importing</span>
                            ) : (
                              <span className="badge badge-success">Syncing</span>
                            )}
                          </div>
                          <p className="text-[12px] text-ink-muted">
                            {providerLabel(account.provider)}
                            {account.displayName ? ` · ${account.displayName}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {pushConfigured ? (
                          <ActionButton className="btn-secondary btn-sm" action={enablePush} pendingText="Registering…" successText="Push notifications registered">
                            {account.watchExpiresAt ? "Renew push" : "Enable push"}
                          </ActionButton>
                        ) : null}
                        <a href={reconnectHref} className="btn btn-secondary btn-sm">
                          {account.provider === "imap" ? "Edit settings" : "Reconnect"}
                        </a>
                        <ConfirmButton
                          className="btn-danger btn-sm"
                          confirmText={`Disconnect ${account.emailAddress}? Imported messages stay in the CRM, but new mail will no longer be synchronised and you will not be able to send from it.`}
                          action={disconnect}
                        >
                          Disconnect
                        </ConfirmButton>
                      </div>
                    </div>
                    <DescriptionList
                      items={[
                        { label: "Connected", value: formatDateTime(account.connectedAt, settings.timezone) },
                        ...(account.provider === "imap" && account.serverConfig
                          ? [
                              {
                                label: "Servers",
                                value: `${account.serverConfig.imap.host}:${account.serverConfig.imap.port} (IMAP), ${account.serverConfig.smtp.host}:${account.serverConfig.smtp.port} (SMTP)`,
                              },
                            ]
                          : []),
                        { label: "Last sync", value: account.lastSyncAt ? formatDateTime(account.lastSyncAt, settings.timezone) : "Not yet" },
                        {
                          label: "Initial import",
                          value: account.backfillCompletedAt ? `Completed ${formatDateTime(account.backfillCompletedAt, settings.timezone)}` : "In progress (last 30 days of mail)",
                        },
                        {
                          label: "Push notifications",
                          value: account.watchExpiresAt
                            ? `Active until ${formatDateTime(account.watchExpiresAt, settings.timezone)} (renewed automatically)`
                            : account.provider === "imap"
                              ? "Not available for mail servers (checked every 45 seconds while the CRM is open)"
                              : pushConfigured
                              ? "Not registered yet"
                              : account.provider === "outlook" && env.microsoft.webhookSecret && !outlookPush.ok
                                ? outlookPush.reason
                                : "Not configured (polling only)",
                        },
                      ]}
                    />
                    {account.lastSyncError ? (
                      <p className="form-error mt-4">
                        Last sync failed{account.lastSyncErrorAt ? ` at ${formatDateTime(account.lastSyncErrorAt, settings.timezone)}` : ""}: {account.lastSyncError}
                      </p>
                    ) : null}
                    {account.lastSyncError ? (
                      <p className="mt-2 text-[12px] text-ink-muted">
                        {account.provider === "imap" ? "If the password changed, use Edit settings to enter the new one." : "If this keeps happening, use Reconnect to sign in to the mailbox again."}
                      </p>
                    ) : null}
                    {subscriptionError ? <p className="mt-3 text-[12px] text-danger">Push notifications could not be registered: {subscriptionError}</p> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title={accounts.length > 0 ? "Add another mailbox" : "Connect your email"}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {EMAIL_PROVIDERS.map((provider) => {
              const available = provider.key === "imap" || providers.includes(provider.key);
              const href = provider.key === "gmail" ? "/api/auth/google" : provider.key === "outlook" ? "/api/auth/microsoft" : "#mail-server";
              return (
                <div key={provider.key} className="flex flex-col rounded-md border border-line p-4 transition-colors hover:border-sage-200">
                  <div className="flex items-center gap-3">
                    <ProviderMark provider={provider.key} size="lg" />
                    <h3 className="text-[14px] font-semibold text-ink">{provider.key === "imap" ? "Other email" : provider.label}</h3>
                  </div>
                  <p className="mt-2 flex-1 text-[13px] text-ink-muted">{provider.description}</p>
                  {available ? (
                    <a href={href} className={cx("btn mt-4 w-full", provider.key === "imap" ? "btn-secondary" : "btn-primary")}>
                      {provider.key === "imap" ? "Enter server settings" : `Sign in with ${provider.key === "gmail" ? "Google" : "Microsoft"}`}
                    </a>
                  ) : (
                    <p className="mt-4 rounded-sm bg-canvas px-3 py-2 text-[12px] text-ink-muted">
                      Admin setup needed: set {provider.key === "gmail" ? "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET" : "MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET"} in the
                      environment.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-[12px] text-ink-faint">
            You can connect several mailboxes. Replies always go out from the mailbox that received the conversation; new emails use the mailbox you choose in the composer.
          </p>
        </Panel>

        <Panel title={editing ? `Mail-server settings for ${editing.emailAddress}` : "Connect any other email address"}>
          <p className="mb-4 text-[13px] text-ink-muted">
            {editing
              ? "Update the password or servers. Mail already imported stays in the CRM and syncing carries on where it left off."
              : "For addresses not hosted by Google or Microsoft. Use the incoming (IMAP) and outgoing (SMTP) settings your email host gives you; they are the same ones a mail program such as Outlook uses."}
          </p>
          <ConnectMailServerForm key={editing?.id ?? "new"} existing={editing ? { emailAddress: editing.emailAddress, config: editing.serverConfig } : null} />
        </Panel>

        <Panel title="How synchronisation works (admin details)">
          <div className="space-y-3 text-[13px] text-ink-muted">
            <p>
              New mail is fetched whenever the CRM is open (every 45 seconds), whenever the scheduled sync runs, and instantly when push notifications are configured. Mail you send
              from the mailbox itself to known clients is imported too, so the timeline stays complete.
            </p>
            <DescriptionList
              items={[
                { label: "Google OAuth redirect URI", value: <CopyField value={googleRedirectUri()} label="Google redirect URI" /> },
                { label: "Microsoft redirect URI", value: <CopyField value={microsoftRedirectUri()} label="Microsoft redirect URI" /> },
                { label: "Scheduled sync endpoint", value: <code className="text-[12px]">GET {cronUrl}</code> },
                { label: "Gmail Pub/Sub push endpoint", value: <code className="text-[12px]">{gmailPushUrl}</code> },
                { label: "Outlook notification endpoint", value: <code className="text-[12px]">{outlookPushUrl}</code> },
                { label: "Pub/Sub topic", value: env.google.pubsubTopic ? <code className="text-[12px]">{env.google.pubsubTopic}</code> : "Not set (GMAIL_PUBSUB_TOPIC)" },
                { label: "Outlook push secret", value: env.microsoft.webhookSecret ? "Set (MICROSOFT_WEBHOOK_SECRET)" : "Not set (MICROSOFT_WEBHOOK_SECRET)" },
              ]}
            />
            <p>
              The scheduled endpoint expects the header <code className="text-[12px]">Authorization: Bearer CRON_SECRET</code>. Vercel Cron sends it automatically. Outlook push
              notifications are registered automatically during sync once the secret is set and the app runs on a public HTTPS address.
            </p>
          </div>
        </Panel>
      </div>
    </PageBody>
  );
}
