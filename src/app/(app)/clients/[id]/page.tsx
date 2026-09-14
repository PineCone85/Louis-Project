import Link from "next/link";
import { notFound } from "next/navigation";
import { isPast } from "date-fns";
import { Pencil } from "lucide-react";
import { archiveClientAction, deleteClientAction } from "@/lib/actions/clients";
import { CLIENT_TYPES, labelFor } from "@/lib/constants";
import { env } from "@/lib/env";
import { formatCurrency, formatDate, formatDateTime, fullName } from "@/lib/format";
import { getGmailAccount } from "@/lib/gmail/account";
import { formatPhone } from "@/lib/phone";
import { getClient, getClientActivities, getClientMessages, getClientProperties } from "@/lib/queries/clients";
import { markClientMessagesRead } from "@/lib/queries/messages";
import { markNotificationsReadForClient } from "@/lib/queries/notifications";
import { listPropertiesBrief } from "@/lib/queries/properties";
import { getSettings } from "@/lib/queries/settings";
import { listTemplates } from "@/lib/queries/templates";
import { getWhatsAppWindow } from "@/lib/whatsapp/send";
import { ActivityForm } from "@/components/clients/activity-form";
import { FollowUpForm } from "@/components/clients/follow-up-form";
import { PropertyLinks } from "@/components/clients/property-links";
import { RefreshCounts } from "@/components/clients/refresh-counts";
import { StageSelect } from "@/components/clients/stage-select";
import { Timeline } from "@/components/conversation/timeline";
import { ConfirmButton } from "@/components/ui/form-controls";
import { BackLink, DescriptionList, PageBody, PageHeader, Panel, StageChip, cx } from "@/components/ui/primitives";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();

  await Promise.all([markClientMessagesRead(client.id), markNotificationsReadForClient(client.id)]);

  const [linkedProperties, messages, activities, settings, gmail, templates, propertyOptions] = await Promise.all([
    getClientProperties(client.id),
    getClientMessages(client.id),
    getClientActivities(client.id),
    getSettings(),
    getGmailAccount(),
    listTemplates(),
    listPropertiesBrief(),
  ]);
  const phones = [client.phone, client.alternatePhone].filter((v): v is string => Boolean(v));
  const emails = [client.email, client.alternateEmail].filter((v): v is string => Boolean(v));
  const whatsappWindow = phones.length > 0 ? await getWhatsAppWindow(phones[0]) : null;
  const followUpOverdue = client.nextFollowUpAt ? isPast(client.nextFollowUpAt) : false;
  const archiveAction = archiveClientAction.bind(null, client.id, !client.archivedAt);
  const deleteAction = deleteClientAction.bind(null, client.id);

  return (
    <>
      <RefreshCounts />
      <PageHeader
        eyebrow={<BackLink href="/clients">Clients</BackLink>}
        title={fullName(client)}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StageChip stage={client.stage} />
            <span>
              {labelFor(CLIENT_TYPES, client.clientType)}
              {client.source ? ` · ${client.source}` : ""} · Client since {formatDate(client.createdAt, settings.timezone)}
              {client.archivedAt ? " · Archived" : ""}
            </span>
          </span>
        }
        actions={
          <>
            <StageSelect clientId={client.id} stage={client.stage} />
            <Link href={`/clients/${client.id}/edit`} className="btn btn-secondary">
              <Pencil size={14} /> Edit
            </Link>
          </>
        }
      />
      <PageBody>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <Timeline
              contact={{
                clientId: client.id,
                firstName: client.firstName,
                lastName: client.lastName,
                displayName: fullName(client),
                emails,
                phones,
              }}
              messages={messages}
              activities={activities}
              timezone={settings.timezone}
              emailSignature={settings.emailSignature}
              renderContext={{ agentName: settings.agentName, agencyName: settings.agencyName, agentPhone: settings.agentPhone }}
              gmail={{ connected: Boolean(gmail) }}
              whatsapp={{ configured: env.whatsapp.configured, window: whatsappWindow }}
              templates={templates}
            />
          </div>

          <div className="space-y-6">
            <Panel title="Follow-up">
              {client.nextFollowUpAt ? (
                <p className={cx("mb-3 text-[13px]", followUpOverdue ? "font-medium text-danger" : "text-ink")}>
                  {followUpOverdue ? "Overdue: " : "Due "}
                  {formatDateTime(client.nextFollowUpAt, settings.timezone)}
                </p>
              ) : (
                <p className="mb-3 text-[13px] text-ink-faint">No follow-up scheduled.</p>
              )}
              <FollowUpForm clientId={client.id} current={client.nextFollowUpAt} timezone={settings.timezone} />
            </Panel>

            <Panel title="Details">
              <DescriptionList
                items={[
                  { label: "Email", value: client.email ? <a href={`mailto:${client.email}`} className="hover:underline">{client.email}</a> : null },
                  { label: "Alternate email", value: client.alternateEmail },
                  { label: "Mobile", value: client.phone ? <a href={`tel:${client.phone}`} className="hover:underline">{formatPhone(client.phone)}</a> : null },
                  { label: "Alternate phone", value: client.alternatePhone ? formatPhone(client.alternatePhone) : null },
                  {
                    label: "Budget",
                    value:
                      client.budgetMin || client.budgetMax
                        ? `${client.budgetMin ? formatCurrency(client.budgetMin, settings.currency) : "Up to"}${client.budgetMax ? ` – ${formatCurrency(client.budgetMax, settings.currency)}` : "+"}`
                        : null,
                  },
                  { label: "Preferred areas", value: client.preferredAreas },
                  { label: "Last contact", value: client.lastContactAt ? formatDateTime(client.lastContactAt, settings.timezone) : null },
                  { label: "In stage since", value: formatDate(client.stageChangedAt, settings.timezone) },
                ]}
              />
              {client.requirements ? (
                <div className="mt-4">
                  <div className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">Requirements</div>
                  <p className="mt-0.5 text-[13px] whitespace-pre-line text-ink">{client.requirements}</p>
                </div>
              ) : null}
              {client.notes ? (
                <div className="mt-4">
                  <div className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">Notes</div>
                  <p className="mt-0.5 text-[13px] whitespace-pre-line text-ink">{client.notes}</p>
                </div>
              ) : null}
            </Panel>

            <Panel title={`Properties (${linkedProperties.length})`} padded={false}>
              <PropertyLinks clientId={client.id} items={linkedProperties} options={propertyOptions} currency={settings.currency} timezone={settings.timezone} />
            </Panel>

            <Panel title="Log activity">
              <ActivityForm clientId={client.id} />
            </Panel>

            <Panel title="Manage">
              <div className="flex flex-wrap items-center gap-2">
                <ConfirmButton
                  className="btn-secondary btn-sm"
                  confirmText={client.archivedAt ? "Restore this client to the active list?" : "Archive this client? They will be hidden from lists and the pipeline but nothing is deleted."}
                  action={archiveAction}
                >
                  {client.archivedAt ? "Restore client" : "Archive client"}
                </ConfirmButton>
                <ConfirmButton className="btn-danger btn-sm" confirmText="Permanently delete this client and their notes and messages? This cannot be undone." action={deleteAction}>
                  Delete client
                </ConfirmButton>
              </div>
            </Panel>
          </div>
        </div>
      </PageBody>
    </>
  );
}
