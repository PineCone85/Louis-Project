import { createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

export const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.modify"];

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

export function googleRedirectUri(): string {
  return `${env.appUrl}/api/auth/google/callback`;
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildAuthorizationUrl(params: { state: string; codeChallenge: string; loginHint?: string }): string {
  const clientId = env.google.clientId;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not configured");
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", googleRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (params.loginHint) url.searchParams.set("login_hint", params.loginHint);
  return url.toString();
}

export type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
};

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
    cache: "no-store",
  });
  const json = (await response.json().catch(() => ({}))) as Partial<TokenResponse> & {
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !json.access_token) {
    throw new GoogleAuthError(json.error ?? "token_error", json.error_description ?? `Google token request failed (${response.status})`);
  }
  return json as TokenResponse;
}

export async function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<TokenResponse> {
  const clientId = env.google.clientId;
  const clientSecret = env.google.clientSecret;
  if (!clientId || !clientSecret) throw new Error("Google OAuth is not configured");
  return tokenRequest({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: googleRedirectUri(),
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const clientId = env.google.clientId;
  const clientSecret = env.google.clientSecret;
  if (!clientId || !clientSecret) throw new Error("Google OAuth is not configured");
  return tokenRequest({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });
}

export async function revokeToken(token: string): Promise<void> {
  await fetch(`${REVOKE_ENDPOINT}?token=${encodeURIComponent(token)}`, { method: "POST", cache: "no-store" }).catch(() => undefined);
}

export class GoogleAuthError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "GoogleAuthError";
    this.code = code;
  }
  /** True when the refresh token has been revoked or expired and the user must reconnect. */
  get requiresReconnect(): boolean {
    return this.code === "invalid_grant";
  }
}
