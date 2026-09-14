import { getSettings } from "@/lib/queries/settings";
import { PropertyForm } from "@/components/properties/property-form";
import { BackLink, PageBody, PageHeader } from "@/components/ui/primitives";

export const metadata = { title: "New property" };

export default async function NewPropertyPage() {
  const settings = await getSettings();
  return (
    <>
      <PageHeader eyebrow={<BackLink href="/properties">Properties</BackLink>} title="New property" />
      <PageBody>
        <div className="max-w-3xl">
          <PropertyForm cancelHref="/properties" currency={settings.currency} />
        </div>
      </PageBody>
    </>
  );
}
