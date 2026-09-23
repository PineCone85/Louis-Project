import { SettingsNav } from "@/components/settings/settings-nav";
import { PageHeader } from "@/components/ui/primitives";

export const metadata = { title: "Settings" };

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Settings" description="Your profile, connected accounts, message templates and automatic replies." />
      <SettingsNav />
      {children}
    </>
  );
}
