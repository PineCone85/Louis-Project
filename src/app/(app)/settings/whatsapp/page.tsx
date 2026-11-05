import { CheckCircle2, Circle, MessageCircle } from "lucide-react";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { disconnectWhatsAppAction, registerWhatsAppNumberAction, resubscribeWhatsAppAction } from "@/lib/actions/whatsapp";
import { getSettings } from "@/lib/queries/settings";
import { environmentCredentials, listWhatsAppAccounts, listWhatsAppSenders, type WhatsAppCredentials } from "@/lib/whatsapp/accounts";
import { getPhoneNumberInfo, listApprovedTemplates, type PhoneNumberInfo } from "@/lib/whatsapp/client";
import { ConnectWhatsApp } from "@/components/settings/connect-whatsapp";
import { RegisterPinForm } from "@/components/settings/register-pin-form";
import { CopyField } from "@/components/ui/copy-field";
import { ActionButton, ConfirmButton } from "@/components/ui/form-controls";
import { DescriptionList, PageBody, Panel, cx } from "@/components/ui/primitives";

export const metadata = { title: "WhatsApp" };

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

function StatusPill({ tone, children }: { tone: "ok" | "warn" | "danger" | "off"; children: React.ReactNode }) {
  return (
    <span className={cx("badge gap-1.5", tone === "ok" ? "badge-success" : tone === "warn" ? "badge-warning" : tone === "danger" ? "badge-danger" : "badge-neutral")}>
      <span className={cx("status-dot h-1.5 w-1.5", tone === "ok" ? "bg-sage-500" : tone === "warn" ? "bg-warning" : tone === "danger" ? "bg-danger" : "bg-ink-faint")} />
      {children}
    </span>
  );
}

export default async function WhatsAppSettingsPage() {
  const [accounts, senders, settings] = await Promise.all([listWhatsAppAccounts(), listWhatsAppSenders(), getSettings()]);
  const statuses = new Map(await Promise.all(senders.map(async (s) => [s.phoneNumberId, await numberStatus(s)] as const)));
  const environment = environmentCredentials();
  const environmentOnly = environment && !accounts.some((a) => a.phoneNumberId === environment.phoneNumberId) ? environment : null;
  const webhookUrl = `${env.appUrl}/api/webhooks/whatsapp`;
  const appDomain = new URL(env.appUrl).hostname;
  const setupChecks: Array<{ name: string; ok: boolean; help: string }> = [
    { name: "WHATSAPP_APP_ID", ok: Boolean(env.whatsapp.appId), help: "App ID of your Meta app (App settings > Basic)." },
    { name: "WHATSAPP_APP_SECRET", ok: Boolean(env.whatsapp.appSecret), help: "App secret from the same page. Also used to verify webhook signatures." },
    {
      name: "WHATSAPP_CONFIG_ID",
      ok: Boolean(env.whatsapp.signupConfigId),
      help: "Facebook Login for Business > Configurations > create one from the WhatsApp Embedded Signup template.",
    },
    { name: "WHATSAPP_VERIFY_TOKEN", ok: Boolean(env.whatsapp.verifyToken), help: "Any random string; enter the same value when registering the webhook below." },
  ];
  const totalNumbers = accounts.length + (environmentOnly ? 1 : 0);

  return (
    <PageBody>
      <div className="max-w-4xl space-y-6">
        <section className="panel overflow-hidden">
          <div className="flex flex-col gap-4 bg-gradient-to-br from-whatsapp-soft to-paper px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-md bg-whatsapp text-paper shadow-card">
                <MessageCircle size={22} strokeWidth={2} />
              </span>
              <div>
                <h2 className="text-[17px] font-semibold text-ink">WhatsApp</h2>
                <p className="text-[13px] text-ink-muted">Receive and reply to client WhatsApp messages from the CRM.</p>
              </div>
            </div>
            {totalNumbers > 0 ? (
              <StatusPill tone="ok">
                {totalNumbers} number{totalNumbers === 1 ? "" : "s"} connected
              </StatusPill>
            ) : env.whatsapp.signupConfigured ? (
              <StatusPill tone="off">Not connected</StatusPill>
            ) : (
              <StatusPill tone="warn">Setup needed</StatusPill>
            )}
          </div>

          {totalNumbers > 0 ? (
            <ul className="divide-y divide-line border-t border-line">
              {accounts.map((account) => {
                const status = statuses.get(account.phoneNumberId);
                const disconnect = disconnectWhatsAppAction.bind(null, account.id);
                const resubscribe = resubscribeWhatsAppAction.bind(null, account.id);
                const register = registerWhatsAppNumberAction.bind(null, account.id);
                const needsRegistration = !account.coexistence && !account.registeredAt;
                const problem = status?.error ?? account.lastError;
                const display = status?.info?.display_phone_number ?? account.displayPhoneNumber ?? account.phoneNumberId;
                const name = status?.info?.verified_name ?? account.verifiedName;
                return (
                  <li key={account.id} className="px-5 py-5">
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[16px] font-semibold text-ink">{display}</span>
                          {needsRegistration ? (
                            <StatusPill tone="warn">Enter PIN to start sending</StatusPill>
                          ) : problem ? (
                            <StatusPill tone="danger">Needs attention</StatusPill>
                          ) : (
                            <StatusPill tone="ok">Active</StatusPill>
                          )}
                        </div>
                        {name ? <p className="mt-0.5 text-[13px] text-ink-muted">{name}</p> : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <ActionButton className="btn-secondary btn-sm" action={resubscribe} pendingText="Checking…" successText="Incoming messages re-enabled">
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
                        { label: "Mode", value: account.coexistence ? "Shared with the WhatsApp Business app" : "WhatsApp Business Platform (CRM only)" },
                        { label: "Sending", value: account.coexistence || account.registeredAt ? "Ready" : "Not registered yet" },
                        { label: "Quality rating", value: status?.info?.quality_rating ?? "Unknown" },
                        { label: "Approved templates", value: status?.templates === null || status?.templates === undefined ? "Unknown" : String(status.templates) },
                      ]}
                    />
                    {status?.error ? <p className="form-error mt-4">Meta returned an error for this number: {status.error}</p> : null}
                    {account.lastError && !needsRegistration ? <p className="form-warning mt-4">{account.lastError}</p> : null}
                    {needsRegistration ? (
                      <div className="mt-4 rounded-md border border-warning/25 bg-warning-soft/60 p-4">
                        <p className="text-[13px] font-medium text-ink">Finish registering this number</p>
                        <p className="mt-1 text-[13px] text-ink-muted">
                          The number already has a two-step verification PIN. Enter it to register the number for sending. You can also reset the PIN in WhatsApp Manager.
                        </p>
                        <RegisterPinForm action={register} />
                      </div>
                    ) : null}
                  </li>
                );
              })}
              {environmentOnly ? (
                <li className="px-5 py-5">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-[16px] font-semibold text-ink">
                      {statuses.get(environmentOnly.phoneNumberId)?.info?.display_phone_number ?? environmentOnly.phoneNumberId}
                    </span>
                    <span className="badge badge-neutral">Set in environment</span>
                  </div>
                  <p className="text-[13px] text-ink-muted">
                    Configured through the WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN environment variables. Once you connect it below, those variables can be removed.
                  </p>
                  {statuses.get(environmentOnly.phoneNumberId)?.error ? (
                    <p className="form-error mt-3">Meta returned an error for this number: {statuses.get(environmentOnly.phoneNumberId)?.error}</p>
                  ) : null}
                </li>
              ) : null}
            </ul>
          ) : null}
        </section>

        <Panel title={totalNumbers > 0 ? "Connect another number" : "Connect your WhatsApp"}>
          {env.whatsapp.signupConfigured ? (
            <ConnectWhatsApp appId={env.whatsapp.appId!} configId={env.whatsapp.signupConfigId!} apiVersion={env.whatsapp.apiVersion} />
          ) : (
            <div className="space-y-4">
              <p className="text-[13px] text-ink-muted">
                Agents connect their own WhatsApp numbers here with a Facebook popup. Before that works, the administrator needs to link the CRM to a Meta app once by setting these
                environment variables (in Vercel: Settings &gt; Environment Variables) and redeploying:
              </p>
              <ul className="divide-y divide-line rounded-md border border-line">
                {setupChecks.map((check) => (
                  <li key={check.name} className="flex items-start gap-3 px-4 py-3">
                    {check.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-sage-600" /> : <Circle size={16} className="mt-0.5 shrink-0 text-ink-faint" />}
                    <div className="min-w-0">
                      <code className="text-[12px] font-semibold text-ink">{check.name}</code>
                      <span className={cx("ml-2 text-[11px]", check.ok ? "text-sage-700" : "text-warning")}>{check.ok ? "Set" : "Missing"}</span>
                      <p className="mt-0.5 text-[12px] text-ink-muted">{check.help}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-[12px] text-ink-faint">
                Also add <code className="text-ink">{appDomain}</code> under Facebook Login for Business &gt; Settings &gt; Allowed domains for the JavaScript SDK, and under App
                settings &gt; Basic &gt; App domains. The README has the full walkthrough.
              </p>
            </div>
          )}
        </Panel>

        <Panel title="Webhook (one-time admin setup)">
          <div className="space-y-4 text-[13px] text-ink-muted">
            <p>
              One webhook on the Meta app serves every connected number. In the Meta developer console open your app, go to WhatsApp &gt; Configuration, paste this callback URL and
              subscribe to the <code className="text-[12px] text-ink">messages</code> field, plus <code className="text-[12px] text-ink">smb_message_echoes</code> for numbers shared with the
              WhatsApp Business app.
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="min-w-0">
                <p className="label">Callback URL</p>
                <CopyField value={webhookUrl} label="callback URL" />
              </div>
              <div className="min-w-0">
                <p className="label">Verify token</p>
                <p className="flex h-[34px] items-center text-[13px] text-ink">{env.whatsapp.verifyToken ? "The value of WHATSAPP_VERIFY_TOKEN" : "Set WHATSAPP_VERIFY_TOKEN first"}</p>
              </div>
            </div>
            <DescriptionList
              items={[
                { label: "Webhook signature check", value: env.whatsapp.appSecret ? "Enabled" : "Disabled (set WHATSAPP_APP_SECRET)" },
                { label: "Graph API version", value: env.whatsapp.apiVersion },
              ]}
            />
            <p>
              Free-form replies are possible for 24 hours after a client&rsquo;s last message; outside that window WhatsApp requires an approved template, which you can send from any
              conversation.
            </p>
          </div>
        </Panel>
      </div>
    </PageBody>
  );
}
