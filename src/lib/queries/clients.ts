import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { activities, clientProperties, clients, messages, properties, type Client } from "@/lib/db/schema";
import { STAGE_KEYS } from "@/lib/pipeline";

export type ClientListItem = Client & { unreadCount: number; propertyCount: number };

export type ClientListFilters = {
  search?: string;
  stage?: string;
  attention?: boolean;
  followUps?: boolean;
  includeArchived?: boolean;
  sort?: "recent" | "name" | "stage" | "created";
};

const unreadCountSql = sql<number>`(select count(*)::int from messages m where m.client_id = ${clients.id} and m.direction = 'inbound' and m.read_at is null)`;
const propertyCountSql = sql<number>`(select count(*)::int from client_properties cp where cp.client_id = ${clients.id})`;

export async function listClients(filters: ClientListFilters = {}): Promise<ClientListItem[]> {
  const conditions = [];
  if (!filters.includeArchived) conditions.push(isNull(clients.archivedAt));
  if (filters.stage && STAGE_KEYS.includes(filters.stage)) conditions.push(eq(clients.stage, filters.stage));
  if (filters.search) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        ilike(sql`${clients.firstName} || ' ' || ${clients.lastName}`, term),
        ilike(clients.email, term),
        ilike(clients.phone, term),
        ilike(clients.preferredAreas, term),
      )!,
    );
  }
  if (filters.attention) conditions.push(sql`${unreadCountSql} > 0`);
  if (filters.followUps) conditions.push(sql`${clients.nextFollowUpAt} <= now()`);

  const orderBy =
    filters.sort === "name"
      ? [asc(clients.firstName), asc(clients.lastName)]
      : filters.sort === "stage"
        ? [sql`array_position(array[${sql.join(STAGE_KEYS.map((k) => sql`${k}`), sql`, `)}]::text[], ${clients.stage})`, desc(clients.updatedAt)]
        : filters.sort === "created"
          ? [desc(clients.createdAt)]
          : [desc(sql`coalesce(${clients.lastContactAt}, ${clients.updatedAt})`)];

  const rows = await db
    .select({ client: clients, unreadCount: unreadCountSql, propertyCount: propertyCountSql })
    .from(clients)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(...orderBy)
    .limit(500);

  return rows.map((row) => ({ ...row.client, unreadCount: row.unreadCount, propertyCount: row.propertyCount }));
}

export async function getClient(id: string): Promise<Client | null> {
  const row = await db.query.clients.findFirst({ where: eq(clients.id, id) });
  return row ?? null;
}

export type ClientPropertyItem = {
  property: typeof properties.$inferSelect;
  link: typeof clientProperties.$inferSelect;
};

export async function getClientProperties(clientId: string): Promise<ClientPropertyItem[]> {
  const rows = await db
    .select({ property: properties, link: clientProperties })
    .from(clientProperties)
    .innerJoin(properties, eq(clientProperties.propertyId, properties.id))
    .where(eq(clientProperties.clientId, clientId))
    .orderBy(desc(clientProperties.updatedAt));
  return rows;
}

export async function getClientActivities(clientId: string, limit = 100) {
  return db.query.activities.findMany({
    where: eq(activities.clientId, clientId),
    orderBy: [desc(activities.createdAt)],
    limit,
  });
}

export async function getClientMessages(clientId: string, limit = 300) {
  return db.query.messages.findMany({
    where: eq(messages.clientId, clientId),
    orderBy: [asc(messages.sentAt)],
    limit,
  });
}

export async function getClientUnreadCount(clientId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .where(and(eq(messages.clientId, clientId), eq(messages.direction, "inbound"), isNull(messages.readAt)));
  return row?.count ?? 0;
}

export type PipelineClient = Client & { unreadCount: number; propertyCount: number };

export async function getPipelineClients(): Promise<PipelineClient[]> {
  const rows = await db
    .select({ client: clients, unreadCount: unreadCountSql, propertyCount: propertyCountSql })
    .from(clients)
    .where(isNull(clients.archivedAt))
    .orderBy(desc(sql`coalesce(${clients.lastContactAt}, ${clients.updatedAt})`));
  return rows.map((row) => ({ ...row.client, unreadCount: row.unreadCount, propertyCount: row.propertyCount }));
}

export async function countClientsByStage(): Promise<Record<string, number>> {
  const rows = await db
    .select({ stage: clients.stage, count: sql<number>`count(*)::int` })
    .from(clients)
    .where(isNull(clients.archivedAt))
    .groupBy(clients.stage);
  const result: Record<string, number> = {};
  for (const row of rows) result[row.stage] = row.count;
  return result;
}

export async function searchClientsForPicker(term: string, excludeIds: string[] = []): Promise<Client[]> {
  const conditions = [isNull(clients.archivedAt)];
  if (term.trim()) {
    const like = `%${term.trim()}%`;
    conditions.push(or(ilike(sql`${clients.firstName} || ' ' || ${clients.lastName}`, like), ilike(clients.email, like))!);
  }
  if (excludeIds.length > 0) conditions.push(sql`${clients.id} not in ${excludeIds}`);
  return db.query.clients.findMany({ where: and(...conditions), orderBy: [asc(clients.firstName)], limit: 50 });
}

export async function listClientsBrief(): Promise<Pick<Client, "id" | "firstName" | "lastName" | "email" | "stage">[]> {
  return db
    .select({ id: clients.id, firstName: clients.firstName, lastName: clients.lastName, email: clients.email, stage: clients.stage })
    .from(clients)
    .where(isNull(clients.archivedAt))
    .orderBy(asc(clients.firstName), asc(clients.lastName));
}

export async function clientsByIds(ids: string[]): Promise<Client[]> {
  if (ids.length === 0) return [];
  return db.query.clients.findMany({ where: inArray(clients.id, ids) });
}
