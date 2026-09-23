import { countClientsByStage } from "@/lib/queries/clients";
import { getStages } from "@/lib/queries/settings";
import { PipelineEditor } from "@/components/settings/pipeline-editor";
import { PageBody } from "@/components/ui/primitives";

export const metadata = { title: "Pipeline" };

export default async function PipelineSettingsPage() {
  const [stages, counts] = await Promise.all([getStages(), countClientsByStage()]);
  return (
    <PageBody>
      <div className="max-w-4xl">
        <PipelineEditor key={stages.map((s) => s.key).join("|")} stages={stages} counts={counts} />
      </div>
    </PageBody>
  );
}
