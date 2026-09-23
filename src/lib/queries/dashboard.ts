import { and, asc, desc, eq, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { activities, clients } from "@/lib/db/schema";
import { activeStageKeys, transactionStageKeys } from "@/lib/pipeline";
import { listClients, type ClientListItem } from "./clients";
import { getStages } from "./settings";

export type DashboardData = {
  activeClients: number;
  attentionCount: number;
  followUpCount: number;
  needsAttention: ClientListItem[];
  followUpsDue: ClientListItem[];
  newThisWeek: number;
  inTransaction: number;
  recentActivity: Array<{
    id: string;
    clientId: string;
    clientName: string;
    type: string;
    title: string;
    body: string | null;
    createdAt: Date;
  }>;
  stale: ClientListItem[];
};

export async function getDashboardData(): Promise<DashboardData> {
  const stages = await getStages();
  const active = activeStageKeys(stages);
  const transaction = transactionStageKeys(stages);
  const inList = (keys: string[]) => (keys.length > 0 ? sql`${clients.stage} in ${keys}` : sql`false`);
  const [counts] = await db
    .select({
      active: sql<number>`count(*) filter (where ${inList(active)})::int`,
      newThisWeek: sql<number>`count(*) filter (where ${clients.createdAt} > now() - interval '7 days')::int`,
      inTransaction: sql<number>`count(*) filter (where ${inList(transaction)})::int`,
    })
    .from(clients)
    .where(isNull(clients.archivedAt));

  const attention = await listClients({ attention: true, sort: "recent" });
  const followUps = await listClients({ followUps: true, sort: "recent" });
  const needsAttention = attention.slice(0, 8);
  const followUpsDue = followUps.slice(0, 8);

  const activityRows = await db
    .select({
      id: activities.id,
      clientId: activities.clientId,
      firstName: clients.firstName,
      lastName: clients.lastName,
      type: activities.type,
      title: activities.title,
      body: activities.body,
      createdAt: activities.createdAt,
    })
    .from(activities)
    .innerJoin(clients, eq(activities.clientId, clients.id))
    .orderBy(desc(activities.createdAt))
    .limit(10);

  const staleRows = await db
    .select({ client: clients })
    .from(clients)
    .where(
      and(
        isNull(clients.archivedAt),
        inList(active),
        lte(sql`coalesce(${clients.lastContactAt}, ${clients.createdAt})`, sql`now() - interval '14 days'`),
      ),
    )
    .orderBy(asc(sql`coalesce(${clients.lastContactAt}, ${clients.createdAt})`))
    .limit(6);

  return {
    activeClients: counts?.active ?? 0,
    attentionCount: attention.length,
    followUpCount: followUps.length,
    newThisWeek: counts?.newThisWeek ?? 0,
    inTransaction: counts?.inTransaction ?? 0,
    needsAttention,
    followUpsDue,
    recentActivity: activityRows.map((row) => ({
      id: row.id,
      clientId: row.clientId,
      clientName: `${row.firstName} ${row.lastName}`.trim(),
      type: row.type,
      title: row.title,
      body: row.body,
      createdAt: row.createdAt,
    })),
    stale: staleRows.map((row) => ({ ...row.client, unreadCount: 0, propertyCount: 0 })),
  };
}
