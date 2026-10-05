import { createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Delegated Microsoft Graph permissions. offline_access yields a refresh token.
 * Mail.Read is requested alongside Mail.ReadWrite because change-notification
 * subscriptions are only granted to apps holding a read permission.
 */
export const MICROSOFT_SCOPES = ["offline_access", "User.Read", "Mail.Read", "Mail.ReadWrite", "Mail.Send"];

function authority(): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(env.microsoft.tenant)}/oauth2/v2.0`;
}

export function microsoftRedirectUri(): string {
  return `${env.appUrl}/api/auth/microsoft/callback`;
}

export function createMicrosoftPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildMicrosoftAuthorizationUrl(params: { state: string; codeChallenge: string; loginHint?: string }): string {
  const clientId = env.microsoft.clientId;
  if (!clientId) throw new Error("MICROSOFT_CLIENT_ID is not configured");
  const url = new URL(`${authority()}/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", microsoftRedirectUri());
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", MICROSOFT_SCOPES.join(" "));
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  if (params.loginHint) url.searchParams.set("login_hint", params.loginHint);
  return url.toString();
}

export type MicrosoftTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
  id_token?: string;
};

export class MicrosoftAuthError extends Error {
  code: string;
  description: string;
  constructor(code: string, description: string) {
    super(description);
    this.name = "MicrosoftAuthError";
    this.code = code;
    this.description = description;
  }
  /** True when the refresh token is expired or revoked and the mailbox must be reconnected. */
  get requiresReconnect(): boolean {
    return ["invalid_grant", "interaction_required", "login_required", "consent_required"].includes(this.code);
  }
}

async function tokenRequest(body: Record<string, string>): Promise<MicrosoftTokenResponse> {
  const response = await fetch(`${authority()}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
    cache: "no-store",
  });
  const json = (await response.json().catch(() => ({}))) as Partial<MicrosoftTokenResponse> & { error?: string; error_description?: string };
  if (!response.ok || !json.access_token) {
    throw new MicrosoftAuthError(json.error ?? "token_error", json.error_description ?? `Microsoft token request failed (${response.status})`);
  }
  return json as MicrosoftTokenResponse;
}

function clientCredentials(): { client_id: string; client_secret: string } {
  const clientId = env.microsoft.clientId;
  const clientSecret = env.microsoft.clientSecret;
  if (!clientId || !clientSecret) throw new Error("Microsoft OAuth is not configured");
  return { client_id: clientId, client_secret: clientSecret };
}

export async function exchangeMicrosoftCode(code: string, codeVerifier: string): Promise<MicrosoftTokenResponse> {
  return tokenRequest({
    ...clientCredentials(),
    grant_type: "authorization_code",
    code,
    redirect_uri: microsoftRedirectUri(),
    code_verifier: codeVerifier,
    scope: MICROSOFT_SCOPES.join(" "),
  });
}

export async function refreshMicrosoftToken(refreshToken: string): Promise<MicrosoftTokenResponse> {
  return tokenRequest({
    ...clientCredentials(),
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: MICROSOFT_SCOPES.join(" "),
  });
}

export type MicrosoftProfile = { emailAddress: string; displayName: string | null };

/** Resolves the signed-in mailbox address. Personal accounts may leave `mail` empty, so fall back to the UPN. */
export async function fetchMicrosoftProfile(accessToken: string): Promise<MicrosoftProfile> {
  const response = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) throw new MicrosoftAuthError("profile", `Unable to read the Microsoft account profile (${response.status})`);
  const json = (await response.json()) as { mail?: string | null; userPrincipalName?: string | null; displayName?: string | null };
  const address = (json.mail ?? json.userPrincipalName ?? "").trim().toLowerCase();
  if (!address.includes("@")) throw new MicrosoftAuthError("profile", "The Microsoft account has no mailbox address.");
  return { emailAddress: address, displayName: json.displayName ?? null };
}
