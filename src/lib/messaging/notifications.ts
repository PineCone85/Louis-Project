import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";

export async function createNotification(input: {
  type: string;
  clientId?: string | null;
  messageId?: string | null;
  title: string;
  body?: string | null;
}): Promise<void> {
  await db.insert(notifications).values({
    type: input.type,
    clientId: input.clientId ?? null,
    messageId: input.messageId ?? null,
    title: input.title,
    body: input.body ?? null,
  });
}
