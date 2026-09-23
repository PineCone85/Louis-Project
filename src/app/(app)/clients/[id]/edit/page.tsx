import { notFound } from "next/navigation";
import { getClient } from "@/lib/queries/clients";
import { getSettings } from "@/lib/queries/settings";
import { fullName } from "@/lib/format";
import { ClientForm } from "@/components/clients/client-form";
import { BackLink, PageBody, PageHeader } from "@/components/ui/primitives";

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [client, settings] = await Promise.all([getClient(id), getSettings()]);
  if (!client) notFound();
  return (
    <>
      <PageHeader eyebrow={<BackLink href={`/clients/${client.id}`}>{fullName(client)}</BackLink>} title="Edit client" />
      <PageBody>
        <div className="max-w-3xl">
          <ClientForm id={client.id} initial={client} cancelHref={`/clients/${client.id}`} currency={settings.currency} timezone={settings.timezone} />
        </div>
      </PageBody>
    </>
  );
}
