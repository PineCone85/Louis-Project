import type { EmailAccount, MailServerConfig } from "@/lib/db/schema";
import { saveEmailAccount } from "@/lib/email/accounts";
import { closeImap, connectImap, describeMailServerError, smtpTransport, type MailServerCredentials } from "./client";

export type MailServerSecurity = "ssl" | "starttls";

export type MailServerInput = {
  emailAddress: string;
  password: string;
  username?: string;
  imapHost?: string;
  imapPort?: number | null;
  imapSecurity: MailServerSecurity;
  smtpHost?: string;
  smtpPort?: number | null;
  smtpSecurity: MailServerSecurity;
};

/**
 * Fills in what was left blank with the settings most hosts use: mail.<domain> for both servers,
 * IMAP on 993 and SMTP on 465 with SSL, or 143 and 587 with STARTTLS.
 */
export function resolveMailServerConfig(input: MailServerInput): MailServerConfig {
  const emailAddress = input.emailAddress.trim().toLowerCase();
  const domain = emailAddress.split("@")[1] ?? "";
  const imapHost = input.imapHost?.trim().toLowerCase() || `mail.${domain}`;
  const smtpHost = input.smtpHost?.trim().toLowerCase() || imapHost;
  return {
    username: input.username?.trim() || emailAddress,
    imap: { host: imapHost, port: input.imapPort || (input.imapSecurity === "ssl" ? 993 : 143), secure: input.imapSecurity === "ssl" },
    smtp: { host: smtpHost, port: input.smtpPort || (input.smtpSecurity === "ssl" ? 465 : 587), secure: input.smtpSecurity === "ssl" },
  };
}

/** Signs in to both servers so that wrong settings are reported now, not at the first sync or send. */
export async function verifyMailServer(credentials: MailServerCredentials): Promise<void> {
  const client = await connectImap(credentials);
  try {
    const inbox = await client.status("INBOX", { messages: true });
    if (!inbox) throw new Error("The mail server has no inbox for this account.");
  } catch (error) {
    throw describeMailServerError(error, "IMAP", credentials.imap.host);
  } finally {
    await closeImap(client);
  }

  const transport = smtpTransport(credentials);
  try {
    await transport.verify();
  } catch (error) {
    throw describeMailServerError(error, "SMTP", credentials.smtp.host);
  } finally {
    transport.close();
  }
}

/** Verifies the settings and stores the mailbox; connecting the same address again updates its settings. */
export async function connectMailServer(input: MailServerInput): Promise<EmailAccount> {
  const config = resolveMailServerConfig(input);
  await verifyMailServer({ ...config, password: input.password });
  return saveEmailAccount({
    provider: "imap",
    emailAddress: input.emailAddress.trim().toLowerCase(),
    displayName: null,
    refreshToken: input.password,
    accessToken: null,
    expiresIn: 0,
    scopes: "",
    syncState: { imap: {} },
    serverConfig: config,
  });
}
