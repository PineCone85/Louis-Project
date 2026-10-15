import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages, whatsappAccounts, type WhatsAppAccount } from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";

/** Everything needed to call the Cloud API for one business number. */
export type WhatsAppCredentials = {
  phoneNumberId: string;
  wabaId: string | null;
  accessToken: string;
  /** The whatsapp_accounts row, or null for the number configured through the environment. */
  accountId: string | null;
  displayPhoneNumber: string | null;
};

export async function listWhatsAppAccounts(): Promise<WhatsAppAccount[]> {
  return db.query.whatsappAccounts.findMany({ orderBy: [asc(whatsappAccounts.connectedAt)] });
}

export async function getWhatsAppAccount(id: string): Promise<WhatsAppAccount | null> {
  return (await db.query.whatsappAccounts.findFirst({ where: eq(whatsappAccounts.id, id) })) ?? null;
}

function fromAccount(account: WhatsAppAccount): WhatsAppCredentials {
  return {
    phoneNumberId: account.phoneNumberId,
    wabaId: account.wabaId,
    accessToken: decryptSecret(account.accessTokenEnc),
    accountId: account.id,
    displayPhoneNumber: account.displayPhoneNumber,
  };
}

/** The single number configured through WHATSAPP_* environment variables, if any. */
export function environmentCredentials(): WhatsAppCredentials | null {
  const phoneNumberId = env.whatsapp.phoneNumberId;
  const accessToken = env.whatsapp.accessToken;
  if (!phoneNumberId || !accessToken) return null;
  return { phoneNumberId, wabaId: env.whatsapp.businessAccountId ?? null, accessToken, accountId: null, displayPhoneNumber: null };
}

/** Credentials for a business number, whether it was connected in the app or through the environment. */
export async function credentialsForNumber(phoneNumberId: string): Promise<WhatsAppCredentials | null> {
  const account = await db.query.whatsappAccounts.findFirst({ where: eq(whatsappAccounts.phoneNumberId, phoneNumberId) });
  if (account) return fromAccount(account);
  const fallback = environmentCredentials();
  return fallback && fallback.phoneNumberId === phoneNumberId ? fallback : null;
}

/** Every number messages can be sent from: connected numbers first, then the environment number. */
export async function listWhatsAppSenders(): Promise<WhatsAppCredentials[]> {
  const senders = (await listWhatsAppAccounts()).map(fromAccount);
  const fallback = environmentCredentials();
  if (fallback && !senders.some((s) => s.phoneNumberId === fallback.phoneNumberId)) senders.push(fallback);
  return senders;
}

/** True when at least one business number can send and receive messages. */
export async function whatsAppAvailable(): Promise<boolean> {
  if (environmentCredentials()) return true;
  const [row] = await db.select({ id: whatsappAccounts.id }).from(whatsappAccounts).limit(1);
  return Boolean(row);
}

/**
 * Picks the number to message a contact from: the number they last wrote to, else the number last
 * used with them, else the first connected number. Replies therefore continue on the same number,
 * which is also the one whose 24-hour window applies.
 */
export async function credentialsForContact(phone: string): Promise<WhatsAppCredentials | null> {
  for (const direction of ["inbound", null] as const) {
    const last = await db.query.messages.findFirst({
      where: and(
        eq(messages.channel, "whatsapp"),
        eq(messages.contactAddress, phone),
        isNotNull(messages.waPhoneNumberId),
        ...(direction ? [eq(messages.direction, direction)] : []),
      ),
      orderBy: [desc(messages.sentAt)],
      columns: { waPhoneNumberId: true },
    });
    if (last?.waPhoneNumberId) {
      const credentials = await credentialsForNumber(last.waPhoneNumberId);
      if (credentials) return credentials;
    }
  }
  const [first] = await listWhatsAppSenders();
  return first ?? null;
}

export async function requireCredentialsForContact(phone: string, phoneNumberId?: string | null): Promise<WhatsAppCredentials> {
  const credentials = phoneNumberId ? await credentialsForNumber(phoneNumberId) : await credentialsForContact(phone);
  if (!credentials) {
    const { WhatsAppApiError } = await import("./client");
    throw new WhatsAppApiError("No WhatsApp number is connected. Connect one in Settings > WhatsApp.");
  }
  return credentials;
}

export type SaveWhatsAppAccountInput = {
  phoneNumberId: string;
  wabaId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  accessToken: string;
  coexistence: boolean;
};

/** Creates the connection, or refreshes the token of a number that was connected before. */
export async function saveWhatsAppAccount(input: SaveWhatsAppAccountInput): Promise<WhatsAppAccount> {
  const values = {
    wabaId: input.wabaId,
    displayPhoneNumber: input.displayPhoneNumber,
    verifiedName: input.verifiedName,
    accessTokenEnc: encryptSecret(input.accessToken),
    coexistence: input.coexistence,
    lastError: null,
    lastErrorAt: null,
    updatedAt: new Date(),
  };
  const [row] = await db
    .insert(whatsappAccounts)
    .values({ ...values, phoneNumberId: input.phoneNumberId })
    .onConflictDoUpdate({ target: whatsappAccounts.phoneNumberId, set: values })
    .returning();
  return row;
}

export async function updateWhatsAppAccount(id: string, values: Partial<typeof whatsappAccounts.$inferInsert>): Promise<void> {
  await db
    .update(whatsappAccounts)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(whatsappAccounts.id, id));
}

export async function deleteWhatsAppAccount(id: string): Promise<void> {
  await db.delete(whatsappAccounts).where(eq(whatsappAccounts.id, id));
}

export type WhatsAppSenderOption = { phoneNumberId: string; label: string };

/** Numbers offered in the composer, and the one a reply to this contact goes out from by default. */
export async function whatsAppSenderOptions(contactPhone: string | null): Promise<{ senders: WhatsAppSenderOption[]; defaultSender: string | null }> {
  const accounts = await listWhatsAppAccounts();
  const senders: WhatsAppSenderOption[] = accounts.map((a) => ({
    phoneNumberId: a.phoneNumberId,
    label: [a.displayPhoneNumber, a.verifiedName].filter(Boolean).join(" · ") || a.phoneNumberId,
  }));
  const fallback = environmentCredentials();
  if (fallback && !senders.some((s) => s.phoneNumberId === fallback.phoneNumberId)) {
    senders.push({ phoneNumberId: fallback.phoneNumberId, label: "Business number (configured in the environment)" });
  }
  const preferred = contactPhone ? await credentialsForContact(contactPhone) : null;
  return { senders, defaultSender: preferred?.phoneNumberId ?? senders[0]?.phoneNumberId ?? null };
}
