import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { disconnectWhatsAppAction, registerWhatsAppNumberAction, resubscribeWhatsAppAction } from "@/lib/actions/whatsapp";
import { getSettings } from "@/lib/queries/settings";
import { environmentCredentials, listWhatsAppAccounts, listWhatsAppSenders, type WhatsAppCredentials } from "@/lib/whatsapp/accounts";
import { getPhoneNumberInfo, listApprovedTemplates, type PhoneNumberInfo } from "@/lib/whatsapp/client";
import { ConnectWhatsApp } from "@/components/settings/connect-whatsapp";
import { RegisterPinForm } from "@/components/settings/register-pin-form";
import { ActionButton, ConfirmButton } from "@/components/ui/form-controls";
import { DescriptionList, EmptyState, PageBody, Panel } from "@/components/ui/primitives";

type Status = { info: PhoneNumberInfo | null; templates: number | null; error: string | null };

/** Live details of a number from Meta; failures are shown on the number instead of breaking the page. */
async function numberStatus(credentials: WhatsAppCredentials): Promise<Status> {
  const [info, templates] = await Promise.allSettled([
    getPhoneNumberInfo(credentials),
    credentials.wabaId ? listApprovedTemplates(credentials) : Promise.resolve(null),
  ]);
  return {
    info: info.status === "fulfilled" ? info.value : null,
    templates: templates.status === "fulfilled" && templates.value ? templates.value.length : null,
    error: info.status === "rejected" ? (info.reason instanceof Error ? info.reason.message : "Unable to reach the WhatsApp API") : null,
  };
}

export default async function WhatsAppSettingsPage() {
  const [accounts, senders, settings] = await Promise.all([listWhatsAppAccounts(), listWhatsAppSenders(), getSettings()]);
  const statuses = new Map(await Promise.all(senders.map(async (s) => [s.phoneNumberId, await numberStatus(s)] as const)));
  const environment = environmentCredentials();
  const environmentOnly = environment && !accounts.some((a) => a.phoneNumberId === environment.phoneNumberId) ? environment : null;
  const webhookUrl = `${env.appUrl}/api/webhooks/whatsapp`;
  const missingForSignup = [
    ["WHATSAPP_APP_ID", env.whatsapp.appId],
    ["WHATSAPP_APP_SECRET", env.whatsapp.appSecret],
    ["WHATSAPP_CONFIG_ID", env.whatsapp.signupConfigId],
    ["WHATSAPP_VERIFY_TOKEN", env.whatsapp.verifyToken],
  ].filter(([, value]) => !value);

  return (
    <PageBody>
      <div className="max-w-3xl space-y-6">
        <Panel title="Connected numbers" padded={false}>
          {accounts.length === 0 && !environmentOnly ? (
            <EmptyState
              title="No WhatsApp number connected"
              description="Connect the WhatsApp Business number you use with clients. Incoming messages are matched to clients by mobile number, and replies go out from the number the client wrote to."
            />
          ) : (
            <ul className="divide-y divide-line">
              {accounts.map((account) => {
                const status = statuses.get(account.phoneNumberId);
                const disconnect = disconnectWhatsAppAction.bind(null, account.id);
                const resubscribe = resubscribeWhatsAppAction.bind(null, account.id);
                const register = registerWhatsAppNumberAction.bind(null, account.id);
                const needsRegistration = !account.coexistence && !account.registeredAt;
                return (
                  <li key={account.id} className="px-5 py-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="badge badge-sage">WhatsApp</span>
                        <span className="text-[14px] font-semibold text-ink">{status?.info?.display_phone_number ?? account.displayPhoneNumber ?? account.phoneNumberId}</span>
                        {status?.info?.verified_name ?? account.verifiedName ? (
                          <span className="text-[12px] text-ink-muted">{status?.info?.verified_name ?? account.verifiedName}</span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <ActionButton className="btn-secondary btn-sm" action={resubscribe} pendingText="Checking…" successText="Webhook subscription renewed">
                          Repair incoming messages
                        </ActionButton>
                        <ConfirmButton
                          className="btn-danger btn-sm"
                          confirmText={`Disconnect ${account.displayPhoneNumber ?? "this number"}? Its conversations stay in the CRM, but new messages will no longer arrive and you will not be able to reply from it here.`}
                          action={disconnect}
                        >
                          Disconnect
                        </ConfirmButton>
                      </div>
                    </div>
                    <DescriptionList
                      items={[
                        { label: "Connected", value: formatDateTime(account.connectedAt, settings.timezone) },
                        {
                          label: "Mode",
                          value: account.coexistence ? "Also in use in the WhatsApp Business app" : "WhatsApp Business Platform (CRM only)",
                        },
                        {
                          label: "Sending",
                          value: account.coexistence || account.registeredAt ? "Ready" : "Not registered yet (enter the number's PIN below)",
                        },
                        { label: "Quality rating", value: status?.info?.quality_rating ?? "Unknown" },
                        { label: "Approved templates", value: status?.templates === null || status?.templates === undefined ? "Unknown" : String(status.templates) },
                      ]}
                    />
                    {status?.error ? <p className="form-error mt-3">Meta returned an error for this number: {status.error}</p> : null}
                    {account.lastError ? <p className="mt-3 text-[12px] text-danger">{account.lastError}</p> : null}
                    {needsRegistration ? <RegisterPinForm action={register} /> : null}
                  </li>
                );
              })}
              {environmentOnly ? (
                <li className="px-5 py-4">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="badge badge-neutral">Environment</span>
                    <span className="text-[14px] font-semibold text-ink">
                      {statuses.get(environmentOnly.phoneNumberId)?.info?.display_phone_number ?? environmentOnly.phoneNumberId}
                    </span>
                  </div>
                  <p className="text-[12px] text-ink-muted">
                    Configured through the WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN environment variables. Remove them once this number is connected above.
                  </p>
                  {statuses.get(environmentOnly.phoneNumberId)?.error ? (
                    <p className="form-error mt-3">Meta returned an error for this number: {statuses.get(environmentOnly.phoneNumberId)?.error}</p>
                  ) : null}
                </li>
              ) : null}
            </ul>
          )}
        </Panel>

        <Panel title="Connect a number">
          {env.whatsapp.signupConfigured ? (
            <ConnectWhatsApp appId={env.whatsapp.appId!} configId={env.whatsapp.signupConfigId!} apiVersion={env.whatsapp.apiVersion} />
          ) : (
            <div className="space-y-3 text-[13px] text-ink-muted">
              <p>Connecting numbers from the CRM uses Meta&rsquo;s Embedded Signup. Set these environment variables, then reload this page:</p>
              <ul className="list-disc space-y-1 pl-5">
                {missingForSignup.map(([name]) => (
                  <li key={name}>
                    <code className="text-[12px] text-ink">{name}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        <Panel title="Webhook">
          <div className="space-y-3 text-[13px] text-ink-muted">
            <p>
              One webhook on the Meta app serves every connected number. In the Meta developer console, open your app, go to WhatsApp, then Configuration, register this callback URL and subscribe to the{" "}
              <code className="text-[12px]">messages</code> field (and <code className="text-[12px]">smb_message_echoes</code> for numbers that stay in the WhatsApp Business app).
            </p>
            <DescriptionList
              items={[
                { label: "Callback URL", value: <code className="text-[12px]">{webhookUrl}</code> },
                { label: "Verify token", value: env.whatsapp.verifyToken ? "Use the value of WHATSAPP_VERIFY_TOKEN" : "Set WHATSAPP_VERIFY_TOKEN first" },
                { label: "Webhook signature check", value: env.whatsapp.appSecret ? "Enabled" : "Disabled (set WHATSAPP_APP_SECRET)" },
              ]}
            />
            <p>
              Free-form replies are possible for 24 hours after a client&rsquo;s last message; outside that window WhatsApp requires an approved template, which you can send from any conversation.
            </p>
          </div>
        </Panel>
      </div>
    </PageBody>
  );
}
