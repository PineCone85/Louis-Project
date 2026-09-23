import { listPropertiesBrief } from "@/lib/queries/properties";
import { getSettings } from "@/lib/queries/settings";
import { listTemplates } from "@/lib/queries/templates";
import { listWorkflowRuns, listWorkflows } from "@/lib/queries/workflows";
import { WorkflowEditor } from "@/components/settings/workflow-editor";
import { PageBody } from "@/components/ui/primitives";

export const metadata = { title: "Workflows" };

export default async function WorkflowsSettingsPage() {
  const [settings, workflows, runs, templates, properties] = await Promise.all([getSettings(), listWorkflows(), listWorkflowRuns(25), listTemplates(), listPropertiesBrief()]);
  return (
    <PageBody>
      <div className="max-w-4xl">
        <WorkflowEditor workflows={workflows} runs={runs} templates={templates} properties={properties.map((p) => ({ id: p.id, title: p.title }))} timezone={settings.timezone} />
      </div>
    </PageBody>
  );
}
