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

type GranularScope = { scope?: string; target_ids?: string[] };

/**
 * The WhatsApp Business Accounts the agent shared during signup, read from the token itself. Used
 * when the popup's session info did not reach the page (blocked by an extension, closed early, or
 * an older flow that does not send it).
 */
export async function sharedBusinessAccounts(accessToken: string): Promise<string[]> {
  const appId = env.whatsapp.appId;
  const appSecret = env.whatsapp.appSecret;
  if (!appId || !appSecret) return [];
  const url = new URL(graphUrl("debug_token"));
  url.searchParams.set("input_token", accessToken);
  url.searchParams.set("access_token", `${appId}|${appSecret}`);
  const json = await parseGraphResponse<{ data?: { granular_scopes?: GranularScope[] } }>(await fetch(url, { cache: "no-store" }));
  const ids = new Set<string>();
  for (const scope of json.data?.granular_scopes ?? []) {
    if (scope.scope === "whatsapp_business_management" || scope.scope === "whatsapp_business_messaging") {
      for (const id of scope.target_ids ?? []) if (/^\d+$/.test(id)) ids.add(id);
    }
  }
  return [...ids];
}

async function phoneNumbersOf(credentials: Pick<WhatsAppCredentials, "accessToken">, wabaId: string): Promise<string[]> {
  const numbers = await graphRequest<{ data?: Array<{ id: string }> }>(credentials, `${encodeURIComponent(wabaId)}/phone_numbers?fields=id&limit=100`);
  return (numbers.data ?? []).map((n) => n.id);
}

export type SignupInput = { code: string; phoneNumberId?: string | null; wabaId?: string | null; coexistence: boolean };

/**
 * Works out which account and number to connect. The ids the popup reported are used when present,
 * but only if the token can manage them; otherwise they are discovered from what the agent shared.
 */
export async function resolveSignupTarget(accessToken: string, input: Pick<SignupInput, "phoneNumberId" | "wabaId">): Promise<{ wabaId: string; phoneNumberId: string }> {
  const phoneNumberId = input.phoneNumberId || null;
  const credentials = { accessToken };
  const candidates = input.wabaId ? [input.wabaId] : await sharedBusinessAccounts(accessToken);
  if (candidates.length === 0) {
    throw new WhatsAppApiError("No WhatsApp Business Account was shared during signup. Run it again and choose or create a business account and number.");
  }
  const found: Array<{ wabaId: string; phoneNumberId: string }> = [];
  for (const wabaId of candidates) {
    const numbers = await phoneNumbersOf(credentials, wabaId);
    if (phoneNumberId && numbers.includes(phoneNumberId)) return { wabaId, phoneNumberId };
    for (const id of numbers) found.push({ wabaId, phoneNumberId: id });
  }
  if (phoneNumberId) throw new WhatsAppApiError("That number does not belong to the WhatsApp Business Account that was shared.");
  if (found.length === 0) throw new WhatsAppApiError("The WhatsApp Business Account has no phone number yet. Run signup again and add a number at the last step.");
  if (found.length > 1) {
    throw new WhatsAppApiError("Several numbers were shared, and Meta did not say which one you picked. Run signup again and share only the number you want to connect.");
  }
  return found[0];
}

export async function completeEmbeddedSignup(input: SignupInput): Promise<SignupResult> {
  if ((input.phoneNumberId && !/^\d+$/.test(input.phoneNumberId)) || (input.wabaId && !/^\d+$/.test(input.wabaId))) {
    throw new WhatsAppApiError("Meta returned an invalid number or account id.");
  }
  const accessToken = await exchangeCode(input.code);
  // The ids come from the browser: only accept a number that belongs to an account this token can manage.
  const { wabaId, phoneNumberId } = await resolveSignupTarget(accessToken, input);
  const credentials = { accessToken, phoneNumberId };
  const info = await getPhoneNumberInfo(credentials);
  await subscribeApp(credentials, wabaId);

  const account = await saveWhatsAppAccount({
    phoneNumberId,
    wabaId,
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
