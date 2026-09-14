import Link from "next/link";
import { Plus } from "lucide-react";
import { getPipelineClients } from "@/lib/queries/clients";
import { getSettings } from "@/lib/queries/settings";
import { PipelineBoard } from "@/components/pipeline/board";
import { PageBody, PageHeader } from "@/components/ui/primitives";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage() {
  const [clients, settings] = await Promise.all([getPipelineClients(), getSettings()]);
  const active = clients.filter((c) => c.stage !== "completed" && c.stage !== "lost").length;
  return (
    <>
      <PageHeader
        title="Pipeline"
        description={`${active} active client${active === 1 ? "" : "s"} across the buyer journey.`}
        actions={
          <Link href="/clients/new" className="btn btn-primary">
            <Plus size={14} /> Add client
          </Link>
        }
      />
      <PageBody>
        <PipelineBoard clients={clients} currency={settings.currency} />
      </PageBody>
    </>
  );
}
