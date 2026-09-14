import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings, type Settings } from "@/lib/db/schema";

/** Returns the single settings row, creating it with defaults on first use. */
export async function getSettings(): Promise<Settings> {
  const existing = await db.query.settings.findFirst({ where: eq(settings.id, 1) });
  if (existing) return existing;
  const [created] = await db.insert(settings).values({ id: 1 }).onConflictDoNothing().returning();
  if (created) return created;
  const again = await db.query.settings.findFirst({ where: eq(settings.id, 1) });
  if (!again) throw new Error("Unable to initialise settings");
  return again;
}
