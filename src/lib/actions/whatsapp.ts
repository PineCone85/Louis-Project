"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { decryptSecret } from "@/lib/crypto";
import { deleteWhatsAppAccount, getWhatsAppAccount, updateWhatsAppAccount } from "@/lib/whatsapp/accounts";
import { completeEmbeddedSignup, subscribeApp, tryRegister } from "@/lib/whatsapp/signup";
import { formString, type ActionResult } from "@/lib/validation";

function revalidate() {
  revalidatePath("/settings/whatsapp");
  revalidatePath("/", "layout");
}

/** Finishes Embedded Signup with the code and ids the Meta popup returned. */
export async function completeWhatsAppSignupAction(input: {
  code: string;
  phoneNumberId: string;
  wabaId: string;
  coexistence: boolean;
}): Promise<ActionResult<{ warning: string | null }>> {
  await requireSession();
  if (!input.code || !input.phoneNumberId || !input.wabaId) return { ok: false, error: "Meta did not finish the signup. Please try again." };
  try {
    const { warning } = await completeEmbeddedSignup(input);
    revalidate();
    return { ok: true, data: { warning } };
  } catch (error) {
    console.error("[whatsapp] embedded signup failed:", error);
    return { ok: false, error: error instanceof Error ? error.message : "Unable to connect the WhatsApp number" };
  }
}

/** Registers a connected number with the two-step verification PIN the agent already uses. */
export async function registerWhatsAppNumberAction(accountId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireSession();
  const pin = formString(formData, "pin");
  if (!/^\d{6}$/.test(pin)) return { ok: false, fieldErrors: { pin: "Enter the six-digit PIN" } };
  const account = await getWhatsAppAccount(accountId);
  if (!account) return { ok: false, error: "This number is no longer connected." };
  const warning = await tryRegister(account, pin);
  revalidate();
  return warning ? { ok: false, error: warning } : { ok: true };
}

/** Subscribes the app to the number's WhatsApp Business Account again, for when messages stop arriving. */
export async function resubscribeWhatsAppAction(accountId: string): Promise<ActionResult> {
  await requireSession();
  const account = await getWhatsAppAccount(accountId);
  if (!account) return { ok: false, error: "This number is no longer connected." };
  try {
    await subscribeApp({ accessToken: decryptSecret(account.accessTokenEnc) }, account.wabaId);
    await updateWhatsAppAccount(account.id, { lastError: account.registeredAt || account.coexistence ? null : account.lastError, lastErrorAt: null });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to subscribe to the account's messages" };
  }
  revalidate();
  return { ok: true };
}

/** Removes the number from the CRM. Its conversations stay; the number keeps working in Meta. */
export async function disconnectWhatsAppAction(accountId: string): Promise<void> {
  await requireSession();
  await deleteWhatsAppAccount(accountId);
  revalidate();
}
