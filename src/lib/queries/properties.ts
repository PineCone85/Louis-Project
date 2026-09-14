import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientProperties, clients, properties, type Property } from "@/lib/db/schema";

export type PropertyListItem = Property & { clientCount: number };

export type PropertyFilters = { search?: string; status?: string; listingType?: string };

const clientCountSql = sql<number>`(select count(*)::int from client_properties cp where cp.property_id = ${properties.id})`;

export async function listProperties(filters: PropertyFilters = {}): Promise<PropertyListItem[]> {
  const conditions = [];
  if (filters.status) conditions.push(eq(properties.status, filters.status));
  if (filters.listingType) conditions.push(eq(properties.listingType, filters.listingType));
  if (filters.search) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        ilike(properties.title, term),
        ilike(properties.reference, term),
        ilike(properties.address, term),
        ilike(properties.suburb, term),
        ilike(properties.city, term),
      )!,
    );
  }
  const rows = await db
    .select({ property: properties, clientCount: clientCountSql })
    .from(properties)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(properties.updatedAt))
    .limit(500);
  return rows.map((row) => ({ ...row.property, clientCount: row.clientCount }));
}

export async function getProperty(id: string): Promise<Property | null> {
  const row = await db.query.properties.findFirst({ where: eq(properties.id, id) });
  return row ?? null;
}

export type PropertyClientItem = {
  client: typeof clients.$inferSelect;
  link: typeof clientProperties.$inferSelect;
};

export async function getPropertyClients(propertyId: string): Promise<PropertyClientItem[]> {
  return db
    .select({ client: clients, link: clientProperties })
    .from(clientProperties)
    .innerJoin(clients, eq(clientProperties.clientId, clients.id))
    .where(eq(clientProperties.propertyId, propertyId))
    .orderBy(desc(clientProperties.updatedAt));
}

export async function listPropertiesBrief(): Promise<Pick<Property, "id" | "title" | "suburb" | "city" | "price" | "status">[]> {
  return db
    .select({
      id: properties.id,
      title: properties.title,
      suburb: properties.suburb,
      city: properties.city,
      price: properties.price,
      status: properties.status,
    })
    .from(properties)
    .orderBy(asc(properties.title));
}

export async function countProperties(): Promise<{ total: number; available: number }> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      available: sql<number>`count(*) filter (where ${properties.status} = 'available')::int`,
    })
    .from(properties);
  return { total: row?.total ?? 0, available: row?.available ?? 0 };
}
