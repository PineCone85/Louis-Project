import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, type Client } from "@/lib/db/schema";

export async function findClientByEmail(address: string): Promise<Client | null> {
  const value = address.toLowerCase();
  const row = await db.query.clients.findFirst({
    where: and(or(eq(clients.email, value), eq(clients.alternateEmail, value)), isNull(clients.archivedAt)),
    orderBy: (c, { desc }) => [desc(c.updatedAt)],
  });
  return row ?? null;
}

export async function findClientByPhone(e164: string): Promise<Client | null> {
  const row = await db.query.clients.findFirst({
    where: and(or(eq(clients.phone, e164), eq(clients.alternatePhone, e164)), isNull(clients.archivedAt)),
    orderBy: (c, { desc }) => [desc(c.updatedAt)],
  });
  return row ?? null;
}
