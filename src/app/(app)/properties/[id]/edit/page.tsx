import { notFound } from "next/navigation";
import { getProperty } from "@/lib/queries/properties";
import { getSettings } from "@/lib/queries/settings";
import { PropertyForm } from "@/components/properties/property-form";
import { BackLink, PageBody, PageHeader } from "@/components/ui/primitives";

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [property, settings] = await Promise.all([getProperty(id), getSettings()]);
  if (!property) notFound();
  return (
    <>
      <PageHeader eyebrow={<BackLink href={`/properties/${property.id}`}>{property.title}</BackLink>} title="Edit property" />
      <PageBody>
        <div className="max-w-3xl">
          <PropertyForm id={property.id} initial={property} cancelHref={`/properties/${property.id}`} currency={settings.currency} />
        </div>
      </PageBody>
    </>
  );
}
