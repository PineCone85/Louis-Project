import { randomInt } from "node:crypto";
import type { WhatsAppAccount } from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { getWhatsAppAccount, saveWhatsAppAccount, updateWhatsAppAccount, type WhatsAppCredentials } from "./accounts";
import { getPhoneNumberInfo, graphRequest, graphUrl, parseGraphResponse, WhatsAppApiError } from "./client";

/**
 * Meta's Embedded Signup: the agent signs in with Facebook in a popup, picks or creates a WhatsApp
 * Business Account and number, and the popup hands back a short-lived code plus the ids of the
 * account and number. The code is exchanged here for a business integration token that does not
 * expire, after which the app is subscribed to the account's webhooks and the number registered
 * for the Cloud API.
 */
export type SignupResult = { account: WhatsAppAccount; warning: string | null };

async function exchangeCode(code: string): Promise<string> {
  const appId = env.whatsapp.appId;
  const appSecret = env.whatsapp.appSecret;
  if (!appId || !appSecret) throw new WhatsAppApiError("WHATSAPP_APP_ID and WHATSAPP_APP_SECRET must be set to connect numbers.");
  const url = new URL(graphUrl("oauth/access_token"));
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("code", code);
  const json = await parseGraphResponse<{ access_token?: string }>(await fetch(url, { cache: "no-store" }));
  if (!json.access_token) throw new WhatsAppApiError("Meta did not return an access token.");
  return json.access_token;
}

/** Without this subscription Meta never delivers the account's messages to the webhook. */
export async function subscribeApp(credentials: Pick<WhatsAppCredentials, "accessToken">, wabaId: string): Promise<void> {
  await graphRequest(credentials, `${encodeURIComponent(wabaId)}/subscribed_apps`, { method: "POST" });
}

/** Registers the number for the Cloud API, setting its two-step verification PIN. */
export async function registerNumber(credentials: Pick<WhatsAppCredentials, "accessToken" | "phoneNumberId">, pin: string): Promise<void> {
  await graphRequest(credentials, `${encodeURIComponent(credentials.phoneNumberId)}/register`, {
    method: "POST",
    body: JSON.stringify({ messaging_product: "whatsapp", pin }),
  });
}

export function generatePin(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function completeEmbeddedSignup(input: { code: string; phoneNumberId: string; wabaId: string; coexistence: boolean }): Promise<SignupResult> {
  if (!/^\d+$/.test(input.phoneNumberId) || !/^\d+$/.test(input.wabaId)) throw new WhatsAppApiError("Meta returned an invalid number or account id.");
  const accessToken = await exchangeCode(input.code);
  const credentials = { accessToken, phoneNumberId: input.phoneNumberId };

  // The ids come from the browser: only accept a number that belongs to an account this token can manage.
  const numbers = await graphRequest<{ data?: Array<{ id: string }> }>(credentials, `${input.wabaId}/phone_numbers?fields=id&limit=100`);
  if (!(numbers.data ?? []).some((n) => n.id === input.phoneNumberId)) {
    throw new WhatsAppApiError("That number does not belong to the WhatsApp Business Account that was shared.");
  }
  const info = await getPhoneNumberInfo(credentials);
  await subscribeApp(credentials, input.wabaId);

  const account = await saveWhatsAppAccount({
    phoneNumberId: input.phoneNumberId,
    wabaId: input.wabaId,
    displayPhoneNumber: info.display_phone_number ?? null,
    verifiedName: info.verified_name ?? null,
    accessToken,
    coexistence: input.coexistence,
  });

  // Numbers that stay in the WhatsApp Business app are already registered by Meta during onboarding.
  if (input.coexistence || account.registeredAt) return { account, warning: null };
  const warning = await tryRegister(account, generatePin());
  return { account: (await getWhatsAppAccount(account.id)) ?? account, warning };
}

/**
 * Registers a connected number, recording the outcome on the account. A number that already has a
 * two-step verification PIN rejects a new one: the agent then enters their PIN in Settings.
 */
export async function tryRegister(account: WhatsAppAccount, pin: string): Promise<string | null> {
  try {
    await registerNumber({ accessToken: decryptSecret(account.accessTokenEnc), phoneNumberId: account.phoneNumberId }, pin);
    await updateWhatsAppAccount(account.id, { pinEnc: encryptSecret(pin), registeredAt: new Date(), lastError: null, lastErrorAt: null });
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Registration failed";
    const warning = `The number is connected but could not be registered for sending: ${message}. If it already has a two-step verification PIN, enter it below.`;
    await updateWhatsAppAccount(account.id, { lastError: warning, lastErrorAt: new Date() });
    return warning;
  }
}
