import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { decryptSecret } from "@/lib/crypto";
import type { EmailAccount, MailServerConfig } from "@/lib/db/schema";

/** Credentials for connecting to a mail server; the password is plain text only in memory. */
export type MailServerCredentials = MailServerConfig & { password: string };

/**
 * A mail-server failure explained in words the agent can act on. `passwordRejected` marks a failure
 * that only new credentials in Settings can fix.
 */
export class MailServerError extends Error {
  passwordRejected: boolean;
  constructor(message: string, options: { passwordRejected?: boolean; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "MailServerError";
    this.passwordRejected = options.passwordRejected ?? false;
  }
}

export function credentialsFor(account: EmailAccount): MailServerCredentials {
  if (account.provider !== "imap" || !account.serverConfig) throw new MailServerError("This mailbox has no mail-server settings. Connect it again in Settings.");
  return { ...account.serverConfig, password: decryptSecret(account.refreshTokenEnc) };
}

type ErrorLike = {
  code?: string;
  message?: string;
  authenticationFailed?: boolean;
  responseCode?: number;
  responseStatus?: string;
  responseText?: string;
};

/** Socket, TLS and protocol errors, as opposed to failures of the CRM's own database or code. */
export function isMailServerFailure(error: unknown): boolean {
  if (error instanceof MailServerError) return true;
  const e = (error ?? {}) as ErrorLike;
  const code = typeof e.code === "string" ? e.code : "";
  // Node's socket, DNS and TLS codes, then ImapFlow's own (ImapFlowErrorCode).
  const network = /^(E[A-Z]|ERR_)/.test(code);
  const imap = /^(NoConnection|StateLogout|ClosedAfter|.*_TIMEOUT$|LockTimeout|Parser|UnexpectedTag|MissingTag|InvalidResponse|Download|NotFound)/.test(code);
  return Boolean(e.authenticationFailed || e.responseStatus || e.responseText || network || imap);
}

/**
 * Translates socket, TLS, IMAP and SMTP errors. A certificate issued for another name is common on
 * shared hosting (mail.yourdomain points at a server whose certificate names the server itself), so
 * the name the certificate does cover is suggested.
 */
export function describeMailServerError(error: unknown, protocol: "IMAP" | "SMTP", host: string): MailServerError {
  if (error instanceof MailServerError) return error;
  const e = (error ?? {}) as ErrorLike;
  const message = e.message ?? "";
  if (e.authenticationFailed || e.code === "EAUTH" || e.responseCode === 535 || /AUTHENTICATIONFAILED|invalid credentials|authentication failed/i.test(`${message} ${e.responseText ?? ""}`)) {
    return new MailServerError(`The ${protocol} server ${host} rejected the username or password.`, { passwordRejected: true, cause: error });
  }
  // Nodemailer reports TLS failures as ESOCKET with the original message.
  if (e.code === "ERR_TLS_CERT_ALTNAME_INVALID" || /does not match certificate's altnames/i.test(message)) {
    const altName = /DNS:([^\s,]+)/.exec(message)?.[1];
    return new MailServerError(
      altName
        ? `The security certificate of ${host} is issued for ${altName}. Use ${altName.replace(/^\*\./, "")} as the ${protocol} server instead.`
        : `The security certificate of ${host} does not match its name. Use the server name your email host gives you instead.`,
      { cause: error },
    );
  }
  if (/self[- ]signed certificate|unable to verify the first certificate|certificate has expired/i.test(message)) {
    return new MailServerError(`The security certificate of ${host} is not trusted (${message}). Use the server name your email host gives you instead.`, { cause: error });
  }
  if (e.code === "ENOTFOUND" || e.code === "EAI_AGAIN" || /getaddrinfo ENOTFOUND/.test(message)) return new MailServerError(`The ${protocol} server ${host} does not exist. Check the server name.`, { cause: error });
  if (e.code === "ECONNREFUSED") return new MailServerError(`${host} refused the ${protocol} connection. Check the port and security setting.`, { cause: error });
  if (/^(ClosedAfterConnectTLS|ClosedAfterConnectText)$/.test(e.code ?? "")) {
    return new MailServerError(`${host} closed the ${protocol} connection straight away. Switch the security setting or the port.`, { cause: error });
  }
  if (/^(ETIMEDOUT|ETIMEOUT|ESOCKET|ECONNECTION|CONNECT_TIMEOUT|GREETING_TIMEOUT|UPGRADE_TIMEOUT)$/.test(e.code ?? "") || /timed? ?out/i.test(message)) {
    return new MailServerError(`${host} did not answer on that ${protocol} port. Check the port and security setting.`, { cause: error });
  }
  if (/wrong version number|ssl3_get_record|packet length too long/i.test(message)) {
    return new MailServerError(`${host} does not use SSL on that ${protocol} port. Switch the security setting or the port.`, { cause: error });
  }
  return new MailServerError(`${protocol} error from ${host}: ${message || "unknown error"}`, { cause: error });
}

/** Opens an authenticated IMAP session. The caller must call logout() when done. */
export async function connectImap(credentials: MailServerCredentials): Promise<ImapFlow> {
  const client = new ImapFlow({
    host: credentials.imap.host,
    port: credentials.imap.port,
    secure: credentials.imap.secure,
    auth: { user: credentials.username, pass: credentials.password },
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 25_000,
  });
  // A dropped connection is reported through the pending command; without a listener it would crash the process.
  client.on("error", (error: unknown) => console.error(`[imap] connection error for ${credentials.username}:`, error));
  try {
    await client.connect();
  } catch (error) {
    client.close();
    throw describeMailServerError(error, "IMAP", credentials.imap.host);
  }
  return client;
}

export async function closeImap(client: ImapFlow): Promise<void> {
  try {
    await client.logout();
  } catch {
    client.close();
  }
}

export function smtpTransport(credentials: MailServerCredentials) {
  return nodemailer.createTransport({
    host: credentials.smtp.host,
    port: credentials.smtp.port,
    secure: credentials.smtp.secure,
    requireTLS: !credentials.smtp.secure,
    auth: { user: credentials.username, pass: credentials.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 25_000,
  });
}

/** Finds the folder that holds sent mail: the server's \Sent marker first, then the usual names. */
export async function findSentFolder(client: ImapFlow): Promise<string | null> {
  const folders = await client.list();
  const marked = folders.find((f) => f.specialUse === "\\Sent");
  if (marked) return marked.path;
  const names = ["sent", "sent items", "sent messages", "sent mail"];
  const byName = folders.find((f) => names.includes(f.name.toLowerCase()));
  return byName?.path ?? null;
}
