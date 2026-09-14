import { env } from "@/lib/env";
import { getPhoneNumberInfo, listApprovedTemplates, type MessageTemplate, type PhoneNumberInfo } from "@/lib/whatsapp/client";
import { DescriptionList, PageBody, Panel } from "@/components/ui/primitives";

export default async function WhatsAppSettingsPage() {
  const configured = env.whatsapp.configured;
  let info: PhoneNumberInfo | null = null;
  let templates: MessageTemplate[] = [];
  let error: string | null = null;
  if (configured) {
    try {
      info = await getPhoneNumberInfo();
    } catch (e) {
      error = e instanceof Error ? e.message : "Unable to reach the WhatsApp API";
    }
    if (env.whatsapp.businessAccountId) {
      try {
        templates = await listApprovedTemplates();
      } catch {
        templates = [];
      }
    }
  }
  const webhookUrl = `${env.appUrl}/api/webhooks/whatsapp`;
  const missing = [
    ["WHATSAPP_PHONE_NUMBER_ID", env.whatsapp.phoneNumberId],
    ["WHATSAPP_BUSINESS_ACCOUNT_ID", env.whatsapp.businessAccountId],
    ["WHATSAPP_ACCESS_TOKEN", env.whatsapp.accessToken],
    ["WHATSAPP_APP_SECRET", env.whatsapp.appSecret],
    ["WHATSAPP_VERIFY_TOKEN", env.whatsapp.verifyToken],
  ].filter(([, value]) => !value);

  return (
    <PageBody>
      <div className="max-w-3xl space-y-6">
        <Panel title="Connection">
          {configured ? (
            <div className="space-y-4">
              {error ? <p className="form-error">WhatsApp credentials are set but the API returned an error: {error}</p> : null}
              {info ? (
                <DescriptionList
                  items={[
                    { label: "Business number", value: info.display_phone_number },
                    { label: "Verified name", value: info.verified_name },
                    { label: "Quality rating", value: info.quality_rating ?? "Unknown" },
                    { label: "Number status", value: info.code_verification_status ?? "Unknown" },
                    { label: "Approved templates", value: env.whatsapp.businessAccountId ? String(templates.length) : "Set WHATSAPP_BUSINESS_ACCOUNT_ID to list templates" },
                    { label: "Webhook signature check", value: env.whatsapp.appSecret ? "Enabled" : "Disabled (set WHATSAPP_APP_SECRET)" },
                  ]}
                />
              ) : null}
              {templates.length > 0 ? (
                <div>
                  <div className="mb-1.5 text-[11px] font-medium tracking-wide text-ink-muted uppercase">Approved templates</div>
                  <ul className="flex flex-wrap gap-1.5">
                    {templates.map((t) => (
                      <li key={t.id} className="badge badge-neutral">
                        {t.name} · {t.language}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3 text-[13px] text-ink-muted">
              <p>WhatsApp uses the official WhatsApp Business Platform (Cloud API) from Meta. Add the following environment variables to connect a business number:</p>
              <ul className="list-disc space-y-1 pl-5">
                {missing.map(([name]) => (
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
            <p>In the Meta developer console, open your app, go to WhatsApp, then Configuration, and register this callback URL. Subscribe to the <code className="text-[12px]">messages</code> webhook field.</p>
            <DescriptionList
              items={[
                { label: "Callback URL", value: <code className="text-[12px]">{webhookUrl}</code> },
                { label: "Verify token", value: env.whatsapp.verifyToken ? "Use the value of WHATSAPP_VERIFY_TOKEN" : "Set WHATSAPP_VERIFY_TOKEN first" },
              ]}
            />
            <p>Incoming messages are matched to clients by mobile number. Free-form replies are possible for 24 hours after a client&rsquo;s last message; outside that window WhatsApp requires an approved template, which you can send from any conversation.</p>
          </div>
        </Panel>
      </div>
    </PageBody>
  );
}
