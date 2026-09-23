"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { clients, settings } from "@/lib/db/schema";
import { normalizeStages, stageKeyFromLabel, type Stage } from "@/lib/pipeline";
import { formOptional, type ActionResult } from "@/lib/validation";

function revalidateEverything() {
  revalidatePath("/", "layout");
}

type SubmittedStage = { key?: string; label?: string; description?: string; group?: string; outcome?: string };

/**
 * Saves the pipeline. New stages (no key yet) get a key derived from their
 * label; existing keys are kept so clients stay in their stage when it is
 * renamed. A stage that still has clients in it cannot be removed.
 */
export async function savePipelineAction(_prev: ActionResult<{ saved: boolean }>, formData: FormData): Promise<ActionResult<{ saved: boolean }>> {
  await requireSession();
  let submitted: SubmittedStage[];
  try {
    const raw = JSON.parse(formOptional(formData, "stages") ?? "[]") as unknown;
    if (!Array.isArray(raw)) throw new Error("not a list");
    submitted = raw as SubmittedStage[];
  } catch {
    return { ok: false, error: "The stage list could not be read." };
  }
  if (submitted.length === 0) return { ok: false, error: "Keep at least one stage." };

  const taken: string[] = submitted.map((s) => (typeof s.key === "string" ? s.key.trim() : "")).filter(Boolean);
  const withKeys: Stage[] = [];
  for (const item of submitted) {
    const label = (item.label ?? "").trim();
    if (!label) return { ok: false, error: "Every stage needs a name." };
    let key = (item.key ?? "").trim();
    if (!key) {
      key = stageKeyFromLabel(label, taken);
      taken.push(key);
    }
    withKeys.push({
      key,
      label,
      description: (item.description ?? "").trim(),
      group: item.group as Stage["group"],
      outcome: item.outcome === "lost" ? "lost" : "won",
    });
  }
  const stages = normalizeStages(withKeys);
  if (!stages) return { ok: false, error: "One of the stages is invalid. Check names and groups." };
  if (!stages.some((s) => s.group !== "closed")) return { ok: false, error: "Keep at least one stage that is not in the Closed group." };

  const keys = stages.map((s) => s.key);
  const orphaned = await db
    .select({ stage: clients.stage, count: sql<number>`count(*)::int` })
    .from(clients)
    .where(sql`${clients.stage} not in (${sql.join(keys.map((k) => sql`${k}`), sql`, `)})`)
    .groupBy(clients.stage);
  if (orphaned.length > 0) {
    const list = orphaned.map((o) => `${o.stage} (${o.count})`).join(", ");
    return { ok: false, error: `Move clients out of these stages before removing them: ${list}.` };
  }

  await db.update(settings).set({ pipelineStages: stages, updatedAt: new Date() }).where(eq(settings.id, 1));
  revalidateEverything();
  return { ok: true, data: { saved: true } };
}

export async function resetPipelineAction(): Promise<ActionResult> {
  await requireSession();
  const { DEFAULT_STAGES } = await import("@/lib/pipeline");
  const keys = DEFAULT_STAGES.map((s) => s.key);
  const orphaned = await db
    .select({ stage: clients.stage })
    .from(clients)
    .where(sql`${clients.stage} not in (${sql.join(keys.map((k) => sql`${k}`), sql`, `)})`)
    .groupBy(clients.stage);
  if (orphaned.length > 0) return { ok: false, error: `Some clients are in custom stages (${orphaned.map((o) => o.stage).join(", ")}). Move them first.` };
  await db.update(settings).set({ pipelineStages: null, updatedAt: new Date() }).where(eq(settings.id, 1));
  revalidateEverything();
  return { ok: true };
}
