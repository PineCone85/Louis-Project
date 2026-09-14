import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Pencil } from "lucide-react";
import { deletePropertyAction } from "@/lib/actions/properties";
import { CLIENT_PROPERTY_STATUSES, LISTING_TYPES, PROPERTY_STATUSES, PROPERTY_TYPES, labelFor } from "@/lib/constants";
import { formatCurrency, formatDate, formatDateTime, formatNumber, fullName } from "@/lib/format";
import { listClientsBrief } from "@/lib/queries/clients";
import { getProperty, getPropertyClients } from "@/lib/queries/properties";
import { getSettings } from "@/lib/queries/settings";
import { LinkClientForm } from "@/components/properties/link-client-form";
import { ConfirmButton } from "@/components/ui/form-controls";
import { Avatar, BackLink, DescriptionList, PageBody, PageHeader, Panel, StageChip, cx } from "@/components/ui/primitives";

export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = await getProperty(id);
  if (!property) notFound();
  const [linked, allClients, settings] = await Promise.all([getPropertyClients(id), listClientsBrief(), getSettings()]);
  const linkable = allClients.filter((client) => !linked.some((item) => item.client.id === client.id));
  const location = [property.address, property.suburb, property.city, property.province, property.postalCode].filter(Boolean).join(", ");
  const features = (property.features ?? "")
    .split(/[\n,]/)
    .map((f) => f.trim())
    .filter(Boolean);
  const deleteAction = deletePropertyAction.bind(null, property.id);

  return (
    <>
      <PageHeader
        eyebrow={<BackLink href="/properties">Properties</BackLink>}
        title={property.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className={cx("badge", property.status === "available" ? "badge-sage" : property.status === "sold" || property.status === "rented" ? "badge-ink" : "badge-neutral")}>
              {labelFor(PROPERTY_STATUSES, property.status)}
            </span>
            <span>
              {labelFor(PROPERTY_TYPES, property.propertyType)} · {labelFor(LISTING_TYPES, property.listingType)}
              {property.reference ? ` · Ref ${property.reference}` : ""}
            </span>
          </span>
        }
        actions={
          <>
            {property.listingUrl ? (
              <a href={property.listingUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                <ExternalLink size={14} /> Listing
              </a>
            ) : null}
            <Link href={`/properties/${property.id}/edit`} className="btn btn-secondary">
              <Pencil size={14} /> Edit
            </Link>
            <ConfirmButton className="btn-danger" confirmText="Delete this property? Links to clients will be removed." action={deleteAction}>
              Delete
            </ConfirmButton>
          </>
        }
      />
      <PageBody>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <Panel title="Overview">
              <div className="mb-5 flex flex-wrap items-baseline gap-x-6 gap-y-2">
                <div>
                  <div className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">Price</div>
                  <div className="font-serif text-[28px] leading-none text-ink">
                    {property.price ? formatCurrency(property.price, settings.currency) : "On request"}
                    {property.price && property.listingType === "rental" ? <span className="font-sans text-[13px] text-ink-muted"> per month</span> : null}
                  </div>
                </div>
                {[
                  { label: "Bedrooms", value: property.bedrooms },
                  { label: "Bathrooms", value: property.bathrooms },
                  { label: "Parking", value: property.parking },
                  { label: "Floor size", value: property.floorSize ? `${formatNumber(property.floorSize)} m²` : null },
                  { label: "Erf size", value: property.erfSize ? `${formatNumber(property.erfSize)} m²` : null },
                ]
                  .filter((item) => item.value !== null && item.value !== undefined)
                  .map((item) => (
                    <div key={item.label}>
                      <div className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">{item.label}</div>
                      <div className="text-[18px] leading-tight text-ink">{item.value}</div>
                    </div>
                  ))}
              </div>
              <DescriptionList
                items={[
                  { label: "Address", value: location },
                  { label: "Added", value: formatDate(property.createdAt, settings.timezone) },
                ]}
              />
              {features.length > 0 ? (
                <div className="mt-5">
                  <div className="mb-2 text-[11px] font-medium tracking-wide text-ink-muted uppercase">Features</div>
                  <ul className="flex flex-wrap gap-1.5">
                    {features.map((feature) => (
                      <li key={feature} className="badge badge-neutral">
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {property.description ? (
                <div className="mt-5">
                  <div className="mb-2 text-[11px] font-medium tracking-wide text-ink-muted uppercase">Description</div>
                  <p className="text-[13px] leading-relaxed whitespace-pre-line text-ink">{property.description}</p>
                </div>
              ) : null}
              {property.notes ? (
                <div className="mt-5 rounded-sm border border-line bg-canvas p-3">
                  <div className="mb-1 text-[11px] font-medium tracking-wide text-ink-muted uppercase">Private notes</div>
                  <p className="text-[13px] whitespace-pre-line text-ink">{property.notes}</p>
                </div>
              ) : null}
            </Panel>
          </div>

          <div className="space-y-6">
            <Panel title={`Interested clients (${linked.length})`} padded={false}>
              {linked.length === 0 ? (
                <p className="px-5 py-4 text-[13px] text-ink-faint">No clients are linked to this property yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {linked.map(({ client, link }) => (
                    <li key={client.id} className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={fullName(client)} size="sm" />
                        <div className="min-w-0 flex-1">
                          <Link href={`/clients/${client.id}`} className="block truncate text-[13px] font-medium text-ink hover:underline">
                            {fullName(client)}
                          </Link>
                          <div className="mt-0.5 flex items-center gap-2">
                            <StageChip stage={client.stage} />
                            <span className="text-[12px] text-ink-muted">{labelFor(CLIENT_PROPERTY_STATUSES, link.status)}</span>
                          </div>
                        </div>
                      </div>
                      {link.viewingAt ? <p className="mt-1.5 text-[12px] text-ink-muted">Viewing {formatDateTime(link.viewingAt, settings.timezone)}</p> : null}
                      {link.notes ? <p className="mt-1 text-[12px] whitespace-pre-line text-ink-muted">{link.notes}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
              <div className="border-t border-line px-5 py-3">
                <LinkClientForm propertyId={property.id} clients={linkable} />
              </div>
            </Panel>
          </div>
        </div>
      </PageBody>
    </>
  );
}
