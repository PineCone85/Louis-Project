import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { getSession } from "@/lib/auth/session";
import { saveEmailAccount } from "@/lib/email/accounts";
import { syncEmailAccounts } from "@/lib/email/sync";
import { env } from "@/lib/env";
import { MICROSOFT_SCOPES, MicrosoftAuthError, exchangeMicrosoftCode, fetchMicrosoftProfile } from "@/lib/outlook/oauth";

const OAUTH_COOKIE = "foyer_ms_oauth";

export const maxDuration = 60;

function settingsRedirect(params: Record<string, string>) {
  const url = new URL("/settings/email", env.appUrl);
  url.searchParams.set("provider", "outlook");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = NextResponse.redirect(url);
  response.cookies.set(OAUTH_COOKIE, "", { path: "/api/auth/microsoft", maxAge: 0 });
  return response;
}

export async function GET(request: NextRequest) {
  if (!(await getSession())) return NextResponse.redirect(new URL("/login", env.appUrl));

  const params = request.nextUrl.searchParams;
  const oauthError = params.get("error");
  if (oauthError) {
    const description = params.get("error_description") ?? "";
    console.error("[microsoft] authorization error:", oauthError, description);
    // Organisations that block user consent return access_denied with an admin-approval message.
    const needsAdmin = oauthError === "consent_required" || /AADSTS(65004|90094)|admin/i.test(description);
    return settingsRedirect({ error: needsAdmin ? "consent" : oauthError === "access_denied" ? "denied" : "oauth" });
  }

  const code = params.get("code");
  const state = params.get("state");
  const raw = request.cookies.get(OAUTH_COOKIE)?.value;
  let stored: { state?: string; verifier?: string } = {};
  try {
    stored = raw ? (JSON.parse(raw) as { state?: string; verifier?: string }) : {};
  } catch {
    stored = {};
  }
  if (!code || !state || !stored.state || !stored.verifier || stored.state !== state) {
    return settingsRedirect({ error: "state" });
  }

  try {
    const tokens = await exchangeMicrosoftCode(code, stored.verifier);
    if (!tokens.refresh_token) return settingsRedirect({ error: "no_refresh_token" });
    const granted = (tokens.scope ?? "").toLowerCase().split(" ");
    const required = MICROSOFT_SCOPES.filter((s) => s !== "offline_access").map((s) => s.toLowerCase());
    if (!required.every((scope) => granted.some((g) => g === scope || g.endsWith(`/${scope}`)))) {
      return settingsRedirect({ error: "scope" });
    }

    const profile = await fetchMicrosoftProfile(tokens.access_token);
    const account = await saveEmailAccount({
      provider: "outlook",
      emailAddress: profile.emailAddress,
      displayName: profile.displayName,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      expiresIn: tokens.expires_in,
      scopes: tokens.scope ?? MICROSOFT_SCOPES.join(" "),
      syncState: { outlook: {} },
    });

    after(async () => {
      await syncEmailAccounts({ reason: "connect", budgetMs: 45_000, accountIds: [account.id] });
    });

    return settingsRedirect({ connected: "1" });
  } catch (error) {
    console.error("[microsoft] OAuth callback failed:", error);
    return settingsRedirect({ error: error instanceof MicrosoftAuthError && error.code === "profile" ? "profile" : "exchange" });
  }
}
