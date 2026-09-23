/**
 * Central, typed access to environment variables.
 *
 * Nothing here throws at import time so that builds and tooling work without
 * a fully configured environment. Callers that require a value use the
 * `required()` helper, which throws a descriptive error at call time.
 */

function read(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function required(name: string): string {
  const value = read(name);
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export const env = {
  get appUrl(): string {
    const configured = read("APP_URL");
    if (configured) return configured.replace(/\/+$/, "");
    const vercel = read("VERCEL_PROJECT_PRODUCTION_URL") ?? read("VERCEL_URL");
    if (vercel) return `https://${vercel}`;
    return "http://localhost:3000";
  },
  get databaseUrl(): string {
    return required("DATABASE_URL");
  },
  get authSecret(): string {
    return required("AUTH_SECRET");
  },
  get adminEmail(): string {
    return required("ADMIN_EMAIL").toLowerCase();
  },
  get adminPasswordHash(): string {
    return required("ADMIN_PASSWORD_HASH");
  },
  /**
   * Everyone who may sign in: the admin plus any entries in ADDITIONAL_USERS,
   * a comma-separated list of `email:scrypt:...` pairs (see `npm run auth:user`).
   * All users share the same CRM data.
   */
  get users(): Array<{ email: string; passwordHash: string }> {
    const list = [{ email: required("ADMIN_EMAIL").toLowerCase(), passwordHash: required("ADMIN_PASSWORD_HASH") }];
    const extra = read("ADDITIONAL_USERS") ?? "";
    for (const entry of extra.split(/[,\n]+/)) {
      const trimmed = entry.trim();
      if (!trimmed) continue;
      const at = trimmed.indexOf(":");
      if (at <= 0) continue;
      const email = trimmed.slice(0, at).trim().toLowerCase();
      const passwordHash = trimmed.slice(at + 1).trim();
      if (email && passwordHash && !list.some((u) => u.email === email)) list.push({ email, passwordHash });
    }
    return list;
  },
  /** Finds a sign-in user by email (case-insensitive). */
  userByEmail(email: string): { email: string; passwordHash: string } | null {
    const wanted = email.trim().toLowerCase();
    return this.users.find((u) => u.email === wanted) ?? null;
  },
  get cronSecret(): string | undefined {
    return read("CRON_SECRET");
  },
  google: {
    get clientId(): string | undefined {
      return read("GOOGLE_CLIENT_ID");
    },
    get clientSecret(): string | undefined {
      return read("GOOGLE_CLIENT_SECRET");
    },
    get configured(): boolean {
      return Boolean(read("GOOGLE_CLIENT_ID") && read("GOOGLE_CLIENT_SECRET"));
    },
    get pubsubTopic(): string | undefined {
      return read("GMAIL_PUBSUB_TOPIC");
    },
    get pushToken(): string | undefined {
      return read("GMAIL_PUSH_TOKEN");
    },
  },
  anthropic: {
    get apiKey(): string | undefined {
      return read("ANTHROPIC_API_KEY");
    },
    /** Demo mode: serve pre-written drafts instead of calling the API. */
    get demo(): boolean {
      return read("AI_DRAFT_DEMO") === "true";
    },
    /** True when AI reply drafting is available (live key or demo mode). */
    get configured(): boolean {
      return Boolean(read("ANTHROPIC_API_KEY")) || read("AI_DRAFT_DEMO") === "true";
    },
  },
  whatsapp: {
    get phoneNumberId(): string | undefined {
      return read("WHATSAPP_PHONE_NUMBER_ID");
    },
    get businessAccountId(): string | undefined {
      return read("WHATSAPP_BUSINESS_ACCOUNT_ID");
    },
    get accessToken(): string | undefined {
      return read("WHATSAPP_ACCESS_TOKEN");
    },
    get appSecret(): string | undefined {
      return read("WHATSAPP_APP_SECRET");
    },
    get verifyToken(): string | undefined {
      return read("WHATSAPP_VERIFY_TOKEN");
    },
    get apiVersion(): string {
      return read("WHATSAPP_API_VERSION") ?? "v21.0";
    },
    /** True when the values needed to send and receive messages are present. */
    get configured(): boolean {
      return Boolean(
        read("WHATSAPP_PHONE_NUMBER_ID") && read("WHATSAPP_ACCESS_TOKEN") && read("WHATSAPP_VERIFY_TOKEN"),
      );
    },
  },
  /**
   * Demo mode (FOYER_DEMO=true): the reply composers are shown without Gmail
   * or WhatsApp connected, and sending records the message without calling
   * the external APIs. Used by `npm run demo`.
   */
  get demo(): boolean {
    return read("FOYER_DEMO") === "true";
  },
  get isProduction(): boolean {
    return process.env.NODE_ENV === "production";
  },
};
