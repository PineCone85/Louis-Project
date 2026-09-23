import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { LISTING_TYPES, PROPERTY_STATUSES, PROPERTY_TYPES, labelFor } from "@/lib/constants";
import { formatCurrency, formatNumber } from "@/lib/format";
import { listProperties } from "@/lib/queries/properties";
import { getSettings } from "@/lib/queries/settings";
import { LinkRow } from "@/components/ui/link-row";
import { EmptyState, PageBody, PageHeader, cx } from "@/components/ui/primitives";

export const metadata = { title: "Properties" };

export default async function PropertiesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; type?: string }> }) {
  const params = await searchParams;
  const [properties, settings] = await Promise.all([
    listProperties({ search: params.q, status: params.status, listingType: params.type }),
    getSettings(),
  ]);

  return (
    <>
      <PageHeader
        title="Properties"
        description={`${properties.length} propert${properties.length === 1 ? "y" : "ies"} on your books.`}
        actions={
          <Link href="/properties/new" className="btn btn-primary">
            <Plus size={14} /> Add property
          </Link>
        }
      />
      <PageBody>
        <form className="mb-4 flex flex-wrap items-center gap-2" method="get">
          <div className="relative min-w-56 flex-1 sm:max-w-xs">
            <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint" />
            <input type="search" name="q" defaultValue={params.q ?? ""} placeholder="Search title, reference or address" className="input pl-8" />
          </div>
          <select name="status" defaultValue={params.status ?? ""} className="select w-40">
            <option value="">Any status</option>
            {PROPERTY_STATUSES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <select name="type" defaultValue={params.type ?? ""} className="select w-36">
            <option value="">Sale and rental</option>
            {LISTING_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-secondary">
            Apply
          </button>
          {params.q || params.status || params.type ? (
            <Link href="/properties" className="btn btn-ghost">
              Clear
            </Link>
          ) : null}
        </form>

        <div className="panel overflow-x-auto">
          {properties.length === 0 ? (
            <EmptyState
              title={params.q || params.status || params.type ? "No properties match these filters" : "No properties yet"}
              description="Add the properties you are marketing or showing so you can link them to interested clients."
              action={
                <Link href="/properties/new" className="btn btn-primary">
                  <Plus size={14} /> Add a property
                </Link>
              }
            />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Location</th>
                  <th>Price</th>
                  <th>Specs</th>
                  <th>Status</th>
                  <th className="text-right">Clients</th>
                </tr>
              </thead>
              <tbody>
                {properties.map((property) => (
                  <LinkRow key={property.id} href={`/properties/${property.id}`}>
                    <td>
                      <Link href={`/properties/${property.id}`} className="block font-medium text-ink hover:underline">
                        {property.title}
                      </Link>
                      <div className="text-[12px] text-ink-muted">
                        {labelFor(PROPERTY_TYPES, property.propertyType)}
                        {property.reference ? ` · ${property.reference}` : ""}
                        {property.listingType === "rental" ? " · To rent" : ""}
                      </div>
                    </td>
                    <td className="text-ink-muted">{[property.suburb, property.city].filter(Boolean).join(", ") || "—"}</td>
                    <td className="whitespace-nowrap">
                      {property.price ? formatCurrency(property.price, settings.currency) : <span className="text-ink-faint">—</span>}
                      {property.price && property.listingType === "rental" ? <span className="text-[12px] text-ink-muted"> / month</span> : null}
                    </td>
                    <td className="whitespace-nowrap text-ink-muted">
                      {[
                        property.bedrooms !== null ? `${property.bedrooms} bed` : null,
                        property.bathrooms !== null ? `${formatNumber(property.bathrooms)} bath` : null,
                        property.floorSize ? `${formatNumber(property.floorSize)} m²` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </td>
                    <td>
                      <span className={cx("badge", property.status === "available" ? "badge-sage" : property.status === "sold" || property.status === "rented" ? "badge-ink" : "badge-neutral")}>
                        {labelFor(PROPERTY_STATUSES, property.status)}
                      </span>
                    </td>
                    <td className="text-right tabular-nums text-ink-muted">{property.clientCount}</td>
                  </LinkRow>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </PageBody>
    </>
  );
}
