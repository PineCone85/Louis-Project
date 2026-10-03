import { disconnectEmailAccountAction, enablePushAction, syncNowAction } from "@/lib/actions/settings";
import { configuredProviders, listEmailAccounts } from "@/lib/email/accounts";
import { EMAIL_PROVIDERS, providerLabel } from "@/lib/email/types";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { googleRedirectUri } from "@/lib/gmail/oauth";
import { microsoftRedirectUri } from "@/lib/outlook/oauth";
import { getSettings } from "@/lib/queries/settings";
import { ActionButton, ConfirmButton } from "@/components/ui/form-controls";
import { DescriptionList, EmptyState, PageBody, Panel, cx } from "@/components/ui/primitives";

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
};

export default async function EmailSettingsPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string; provider?: string }> }) {
  const [params, accounts, settings] = await Promise.all([searchParams, listEmailAccounts(), getSettings()]);
  const providers = configuredProviders();
  const providerName = params.provider ? providerLabel(params.provider) : "The mailbox";
  const gmailPushUrl = `${env.appUrl}/api/webhooks/gmail?token=${env.google.pushToken ?? "{GMAIL_PUSH_TOKEN}"}`;
  const outlookPushUrl = `${env.appUrl}/api/webhooks/outlook`;
  const cronUrl = `${env.appUrl}/api/cron/sync`;

  return (
    <PageBody>
      <div className="max-w-3xl space-y-6">
        {params.connected ? <p className="form-success">{providerName} connected. Recent mail is being imported in the background.</p> : null}
        {params.error ? <p className="form-error">{ERRORS[params.error] ?? "Something went wrong while connecting the mailbox."}</p> : null}

        <Panel title="Connected mailboxes" padded={false} actions={accounts.length > 0 ? <ActionButton className="btn-secondary btn-sm" action={syncNowAction} pendingText="Syncing…" successText="Sync complete">Sync now</ActionButton> : null}>
          {accounts.length === 0 ? (
            <EmptyState
              title="No mailbox connected"
              description="Connect the Gmail or Outlook account you use with clients. Incoming mail is matched to clients by address, shown on their timeline, and replies are sent through the same account."
            />
          ) : (
            <ul className="divide-y divide-line">
              {accounts.map((account) => {
                const pushConfigured = account.provider === "gmail" ? Boolean(env.google.pubsubTopic) : Boolean(env.microsoft.webhookSecret);
                const subscriptionError = account.provider === "outlook" ? account.syncState.outlook?.subscriptionError : null;
                const disconnect = disconnectEmailAccountAction.bind(null, account.id);
                const enablePush = enablePushAction.bind(null, account.id);
                return (
                  <li key={account.id} className="px-5 py-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={cx("badge", account.provider === "gmail" ? "badge-sage" : "badge-ink")}>{providerLabel(account.provider)}</span>
                        <span className="text-[14px] font-semibold text-ink">{account.emailAddress}</span>
                        {account.displayName ? <span className="text-[12px] text-ink-muted">{account.displayName}</span> : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {pushConfigured ? (
                          <ActionButton className="btn-secondary btn-sm" action={enablePush} pendingText="Registering…" successText="Push notifications registered">
                            {account.watchExpiresAt ? "Renew push" : "Enable push"}
                          </ActionButton>
                        ) : null}
                        <a href={account.provider === "gmail" ? "/api/auth/google" : "/api/auth/microsoft"} className="btn btn-secondary btn-sm">
                          Reconnect
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
                        { label: "Last sync", value: account.lastSyncAt ? formatDateTime(account.lastSyncAt, settings.timezone) : "Not yet" },
                        {
                          label: "Initial import",
                          value: account.backfillCompletedAt ? `Completed ${formatDateTime(account.backfillCompletedAt, settings.timezone)}` : "In progress (last 30 days of mail)",
                        },
                        {
                          label: "Push notifications",
                          value: account.watchExpiresAt
                            ? `Active until ${formatDateTime(account.watchExpiresAt, settings.timezone)} (renewed automatically)`
                            : pushConfigured
                              ? "Not registered yet"
                              : "Not configured (polling only)",
                        },
                      ]}
                    />
                    {account.lastSyncError ? (
                      <p className="form-error mt-3">
                        Last sync failed{account.lastSyncErrorAt ? ` at ${formatDateTime(account.lastSyncErrorAt, settings.timezone)}` : ""}: {account.lastSyncError}
                      </p>
                    ) : null}
                    {subscriptionError ? <p className="mt-3 text-[12px] text-danger">Push notifications could not be registered: {subscriptionError}</p> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Add a mailbox">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {EMAIL_PROVIDERS.map((provider) => {
              const available = providers.includes(provider.key);
              return (
                <div key={provider.key} className="rounded-md border border-line p-4">
                  <h3 className="text-[14px] font-semibold text-ink">{provider.label}</h3>
                  <p className="mt-1 text-[13px] text-ink-muted">{provider.description}</p>
                  {available ? (
                    <a href={provider.key === "gmail" ? "/api/auth/google" : "/api/auth/microsoft"} className="btn btn-primary mt-4">
                      Connect {provider.label}
                    </a>
                  ) : (
                    <p className="mt-4 text-[12px] text-ink-faint">
                      Not configured. Set {provider.key === "gmail" ? "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET" : "MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET"} in the
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

        <Panel title="How synchronisation works">
          <div className="space-y-3 text-[13px] text-ink-muted">
            <p>
              New mail is fetched whenever the CRM is open (every 45 seconds), whenever the scheduled sync runs, and instantly when push notifications are configured. Mail you send
              from the mailbox itself to known clients is imported too, so the timeline stays complete.
            </p>
            <DescriptionList
              items={[
                { label: "Google OAuth redirect URI", value: <code className="text-[12px]">{googleRedirectUri()}</code> },
                { label: "Microsoft redirect URI", value: <code className="text-[12px]">{microsoftRedirectUri()}</code> },
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
