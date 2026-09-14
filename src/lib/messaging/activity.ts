import { db } from "@/lib/db";
import { activities } from "@/lib/db/schema";

export type ActivityInput = {
  clientId: string;
  type: string;
  title: string;
  body?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function logActivity(input: ActivityInput): Promise<void> {
  await db.insert(activities).values({
    clientId: input.clientId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    metadata: input.metadata ?? null,
  });
}
