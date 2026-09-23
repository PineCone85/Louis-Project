import Link from "next/link";
import { dismissAllDraftsAction } from "@/lib/actions/drafts";
import { withSignature } from "@/lib/auto-reply/render";
import { listPendingDrafts } from "@/lib/queries/drafts";
import { getSettings } from "@/lib/queries/settings";
import { DraftCard } from "@/components/drafts/draft-card";
import { EmptyState, PageBody, PageHeader } from "@/components/ui/primitives";

export const metadata = { title: "Drafts" };

export default async function DraftsPage() {
  const [settings, drafts] = await Promise.all([getSettings(), listPendingDrafts()]);
  return (
    <>
      <PageHeader
        title="Drafts"
        description={
          drafts.length > 0
            ? `${drafts.length} message${drafts.length === 1 ? "" : "s"} written by your workflows, waiting for you to review and send.`
            : "Messages your workflows draft with AI appear here for review. Nothing is sent without you."
        }
        actions={
          drafts.length > 1 ? (
            <form action={dismissAllDraftsAction}>
              <button type="submit" className="btn btn-secondary">
                Dismiss all
              </button>
            </form>
          ) : null
        }
      />
      <PageBody>
        {drafts.length === 0 ? (
          <div className="panel">
            <EmptyState
              title="No drafts waiting"
              description={
                <>
                  Set up a workflow with an <span className="font-medium text-ink">AI: draft a message</span> action under{" "}
                  <Link href="/settings/workflows" className="font-medium text-ink hover:underline">
                    Settings › Workflows
                  </Link>
                  , for example one that introduces every new listing to the clients it fits.
                </>
              }
            />
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4">
            {drafts.map((draft) => (
              <DraftCard key={draft.id} draft={draft} initialBody={draft.channel === "email" ? withSignature(draft.body, settings.emailSignature) : draft.body} timezone={settings.timezone} />
            ))}
          </div>
        )}
      </PageBody>
    </>
  );
}
