import { getSettings } from "@/lib/queries/settings";
import { splitName } from "@/lib/email-address";
import { ClientForm } from "@/components/clients/client-form";
import { BackLink, PageBody, PageHeader } from "@/components/ui/primitives";

export const metadata = { title: "New client" };

export default async function NewClientPage({ searchParams }: { searchParams: Promise<{ name?: string; email?: string; phone?: string }> }) {
  const [params, settings] = await Promise.all([searchParams, getSettings()]);
  const { firstName, lastName } = splitName(params.name);
  return (
    <>
      <PageHeader eyebrow={<BackLink href="/clients">Clients</BackLink>} title="New client" description="Contact details are used to match incoming email and WhatsApp messages to this client." />
      <PageBody>
        <div className="max-w-3xl">
          <ClientForm cancelHref="/clients" currency={settings.currency} timezone={settings.timezone} initial={{ firstName, lastName, email: params.email ?? null, phone: params.phone ?? null }} />
        </div>
      </PageBody>
    </>
  );
}
