import { and, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, workflows } from "@/lib/db/schema";
import { activeStageKeys } from "@/lib/pipeline";
import { getStages } from "@/lib/queries/settings";
import { runWorkflowsForEvent } from "./engine";

/**
 * Evaluates the time-based triggers. Called whenever messages are synced
 * (manually, by the poll in the app shell, or by the cron job). Each client
 * and follow-up date fires at most once thanks to the run's dedupe key.
 */
export async function runScheduledWorkflows(): Promise<{ followUps: number; inactive: number }> {
  const scheduled = await db.query.workflows.findMany({
    where: and(eq(workflows.enabled, true), or(eq(workflows.trigger, "client.follow_up_due"), eq(workflows.trigger, "client.inactive"))),
    columns: { trigger: true },
  });
  const wantsFollowUps = scheduled.some((w) => w.trigger === "client.follow_up_due");
  const wantsInactive = scheduled.some((w) => w.trigger === "client.inactive");
  const result = { followUps: 0, inactive: 0 };
  if (!wantsFollowUps && !wantsInactive) return result;

  const now = new Date();
  if (wantsFollowUps) {
    const due = await db.query.clients.findMany({ where: and(isNull(clients.archivedAt), lte(clients.nextFollowUpAt, now)), limit: 200 });
    for (const client of due) {
      if (!client.nextFollowUpAt) continue;
      await runWorkflowsForEvent({ trigger: "client.follow_up_due", client, dedupeKey: `follow_up:${client.id}:${client.nextFollowUpAt.toISOString()}` });
      result.followUps += 1;
    }
  }
  if (wantsInactive) {
    const stages = activeStageKeys(await getStages());
    if (stages.length > 0) {
      const active = await db.query.clients.findMany({ where: and(isNull(clients.archivedAt), inArray(clients.stage, stages)), limit: 500 });
      for (const client of active) {
        const since = client.lastContactAt ?? client.createdAt;
        await runWorkflowsForEvent({ trigger: "client.inactive", client, dedupeKey: `inactive:${client.id}:${since.toISOString()}` });
        result.inactive += 1;
      }
    }
  }
  return result;
}
