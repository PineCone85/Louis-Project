import { getSettings } from "@/lib/queries/settings";
import { ProfileForm } from "@/components/settings/profile-form";
import { PageBody } from "@/components/ui/primitives";

export default async function SettingsPage() {
  const settings = await getSettings();
  return (
    <PageBody>
      <div className="max-w-3xl">
        <ProfileForm settings={settings} />
      </div>
    </PageBody>
  );
}
