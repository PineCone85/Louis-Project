import { getSettings } from "@/lib/queries/settings";
import { listRules, listTemplates } from "@/lib/queries/templates";
import { AutomationToggles, RuleEditor } from "@/components/settings/rule-editor";
import { PageBody } from "@/components/ui/primitives";

export default async function AutoRepliesSettingsPage() {
  const [settings, rules, templates] = await Promise.all([getSettings(), listRules(), listTemplates()]);
  return (
    <PageBody>
      <div className="max-w-3xl space-y-6">
        <AutomationToggles settings={settings} />
        <RuleEditor rules={rules} templates={templates} timezone={settings.timezone} />
      </div>
    </PageBody>
  );
}
