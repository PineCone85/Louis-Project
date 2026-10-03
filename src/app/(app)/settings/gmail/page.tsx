import { redirect } from "next/navigation";

/** The Gmail page became the shared email accounts page. */
export default function GmailSettingsRedirect() {
  redirect("/settings/email");
}
