import { listTemplates } from "@/lib/queries/templates";
import { TemplateEditor } from "@/components/settings/template-editor";
import { PageBody } from "@/components/ui/primitives";

export default async function TemplatesSettingsPage() {
  const templates = await listTemplates();
  return (
    <PageBody>
      <div className="max-w-3xl">
        <TemplateEditor templates={templates} />
      </div>
    </PageBody>
  );
}
