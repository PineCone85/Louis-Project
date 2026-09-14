import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications, type Notification } from "@/lib/db/schema";

export async function countUnreadNotifications(): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(notifications).where(isNull(notifications.readAt));
  return row?.count ?? 0;
}

export async function listNotifications(limit = 30): Promise<Notification[]> {
  return db.query.notifications.findMany({ orderBy: [desc(notifications.createdAt)], limit });
}

export async function listUnreadNotifications(limit = 30): Promise<Notification[]> {
  return db.query.notifications.findMany({ where: isNull(notifications.readAt), orderBy: [desc(notifications.createdAt)], limit });
}

export async function markNotificationsReadForClient(clientId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.clientId, clientId), isNull(notifications.readAt)));
}

export async function markNotificationsReadForMessages(messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) return;
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(isNull(notifications.readAt), sql`${notifications.messageId} in ${messageIds}`));
}

export async function markAllNotificationsRead(): Promise<void> {
  await db.update(notifications).set({ readAt: new Date() }).where(isNull(notifications.readAt));
}

export async function markNotificationRead(id: string): Promise<void> {
  await db.update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, id));
}
