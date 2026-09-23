import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, messageDrafts, properties, workflows, type MessageDraft } from "@/lib/db/schema";

export type DraftItem = MessageDraft & {
  clientName: string | null;
  clientStage: string | null;
  propertyTitle: string | null;
  workflowName: string | null;
};

export async function listPendingDrafts(limit = 100): Promise<DraftItem[]> {
  const rows = await db
    .select({
      draft: messageDrafts,
      firstName: clients.firstName,
      lastName: clients.lastName,
      stage: clients.stage,
      propertyTitle: properties.title,
      workflowName: workflows.name,
    })
    .from(messageDrafts)
    .leftJoin(clients, eq(messageDrafts.clientId, clients.id))
    .leftJoin(properties, eq(messageDrafts.propertyId, properties.id))
    .leftJoin(workflows, eq(messageDrafts.workflowId, workflows.id))
    .where(eq(messageDrafts.status, "pending"))
    .orderBy(desc(messageDrafts.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    ...row.draft,
    clientName: row.firstName ? `${row.firstName} ${row.lastName ?? ""}`.trim() : null,
    clientStage: row.stage,
    propertyTitle: row.propertyTitle,
    workflowName: row.workflowName,
  }));
}

export async function countPendingDrafts(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messageDrafts)
    .where(eq(messageDrafts.status, "pending"));
  return row?.count ?? 0;
}

export async function getDraft(id: string): Promise<MessageDraft | null> {
  const row = await db.query.messageDrafts.findFirst({ where: and(eq(messageDrafts.id, id)) });
  return row ?? null;
}

/** Pending drafts addressed to one contact, used to offer them in the composer. */
export async function pendingDraftsForContact(channel: string, contactAddress: string): Promise<MessageDraft[]> {
  return db.query.messageDrafts.findMany({
    where: and(eq(messageDrafts.status, "pending"), eq(messageDrafts.channel, channel), eq(messageDrafts.contactAddress, contactAddress)),
    orderBy: [desc(messageDrafts.createdAt)],
    limit: 5,
  });
}
