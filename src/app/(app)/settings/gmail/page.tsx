import { disconnectGmailAction, enableGmailWatchAction, syncNowAction } from "@/lib/actions/settings";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { getGmailAccount } from "@/lib/gmail/account";
import { googleRedirectUri } from "@/lib/gmail/oauth";
import { getSettings } from "@/lib/queries/settings";
import { ActionButton, ConfirmButton } from "@/components/ui/form-controls";
import { DescriptionList, PageBody, Panel } from "@/components/ui/primitives";

const ERRORS: Record<string, string> = {
  not_configured: "Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the environment.",
  denied: "Google access was declined. Try again and approve access to Gmail.",
  state: "The sign-in attempt expired or was tampered with. Please try again.",
  no_refresh_token: "Google did not return a refresh token. Remove the app's access at myaccount.google.com/permissions and connect again.",
  scope: "The Gmail permission was not granted. Connect again and tick the Gmail access box.",
  exchange: "Google rejected the sign-in. Check the client ID, secret and redirect URI, then try again.",
  oauth: "Google returned an error during sign-in. Please try again.",
};

export default async function GmailSettingsPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const [params, account, settings] = await Promise.all([searchParams, getGmailAccount(), getSettings()]);
  const pushUrl = `${env.appUrl}/api/webhooks/gmail?token=${env.google.pushToken ?? "{GMAIL_PUSH_TOKEN}"}`;
  const cronUrl = `${env.appUrl}/api/cron/sync`;

  return (
    <PageBody>
      <div className="max-w-3xl space-y-6">
        {params.connected ? <p className="form-success">Gmail connected. Recent mail is being imported in the background.</p> : null}
        {params.error ? <p className="form-error">{ERRORS[params.error] ?? "Something went wrong while connecting to Google."}</p> : null}

        <Panel title="Connection">
          {account ? (
            <div className="space-y-4">
              <DescriptionList
                items={[
                  { label: "Account", value: account.emailAddress },
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
                      : env.google.pubsubTopic
                        ? "Not registered yet"
                        : "Not configured (polling only)",
                  },
                ]}
              />
              {account.lastSyncError ? (
                <p className="form-error">
                  Last sync failed{account.lastSyncErrorAt ? ` at ${formatDateTime(account.lastSyncErrorAt, settings.timezone)}` : ""}: {account.lastSyncError}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <ActionButton className="btn-secondary" action={syncNowAction} pendingText="Syncing…" successText="Sync complete">
                  Sync now
                </ActionButton>
                {env.google.pubsubTopic ? (
                  <ActionButton className="btn-secondary" action={enableGmailWatchAction} pendingText="Registering…" successText="Push notifications registered">
                    {account.watchExpiresAt ? "Renew push notifications" : "Enable push notifications"}
                  </ActionButton>
                ) : null}
                <a href="/api/auth/google" className="btn btn-secondary">
                  Reconnect
                </a>
                <ConfirmButton className="btn-danger" confirmText="Disconnect Gmail? Imported messages stay in the CRM, but new mail will no longer be synchronised." action={disconnectGmailAction}>
                  Disconnect
                </ConfirmButton>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-[13px] text-ink-muted">
                Connect the Gmail account you use with clients. The CRM reads incoming mail, matches it to clients by email address, and sends replies through the same account.
              </p>
              {env.google.configured ? (
                <a href="/api/auth/google" className="btn btn-primary">
                  Connect Gmail
                </a>
              ) : (
                <p className="form-error">Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the environment, then reload this page.</p>
              )}
            </div>
          )}
        </Panel>

        <Panel title="How synchronisation works">
          <div className="space-y-3 text-[13px] text-ink-muted">
            <p>
              New mail is fetched whenever the CRM is open (every 45 seconds), whenever a scheduled sync runs, and instantly when Gmail push notifications are configured. Sent mail from Gmail
              to known clients is imported too, so the timeline stays complete.
            </p>
            <DescriptionList
              items={[
                { label: "OAuth redirect URI", value: <code className="text-[12px]">{googleRedirectUri()}</code> },
                { label: "Scheduled sync endpoint", value: <code className="text-[12px]">GET {cronUrl}</code> },
                { label: "Pub/Sub push endpoint", value: <code className="text-[12px]">{pushUrl}</code> },
                { label: "Pub/Sub topic", value: env.google.pubsubTopic ? <code className="text-[12px]">{env.google.pubsubTopic}</code> : "Not set (GMAIL_PUBSUB_TOPIC)" },
              ]}
            />
            <p>The scheduled endpoint expects the header <code className="text-[12px]">Authorization: Bearer CRON_SECRET</code>. Vercel Cron sends it automatically.</p>
          </div>
        </Panel>
      </div>
    </PageBody>
  );
}
