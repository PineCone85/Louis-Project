"use server";

import { requireSession } from "@/lib/auth/session";
import { DraftError, draftReply, type Draft } from "@/lib/ai/draft";
import type { ActionResult } from "@/lib/validation";

export type DraftReplyInput = {
  channel: "email" | "whatsapp";
  contactAddress: string;
  clientId: string | null;
  instruction?: string;
};

export async function draftReplyAction(input: DraftReplyInput): Promise<ActionResult<Draft>> {
  await requireSession();
  if (input.channel !== "email" && input.channel !== "whatsapp") return { ok: false, error: "Unknown channel" };
  if (!input.contactAddress) return { ok: false, error: "No contact address for this conversation" };
  try {
    const data = await draftReply({
      channel: input.channel,
      contactAddress: input.contactAddress,
      clientId: input.clientId,
      instruction: input.instruction?.slice(0, 1000),
    });
    return { ok: true, data };
  } catch (error) {
    if (error instanceof DraftError) return { ok: false, error: error.message };
    console.error("[ai] draft failed", error);
    return { ok: false, error: "Could not generate a draft. Please try again." };
  }
}
