import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { getSession } from "@/lib/auth/session";
import { saveEmailAccount } from "@/lib/email/accounts";
import { syncEmailAccounts } from "@/lib/email/sync";
import { env } from "@/lib/env";
import { GmailClient } from "@/lib/gmail/client";
import { GMAIL_SCOPES, exchangeCodeForTokens } from "@/lib/gmail/oauth";

const OAUTH_COOKIE = "foyer_oauth";

export const maxDuration = 60;

function settingsRedirect(params: Record<string, string>) {
  const url = new URL("/settings/email", env.appUrl);
  url.searchParams.set("provider", "gmail");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = NextResponse.redirect(url);
  response.cookies.set(OAUTH_COOKIE, "", { path: "/api/auth/google", maxAge: 0 });
  return response;
}

export async function GET(request: NextRequest) {
  if (!(await getSession())) return NextResponse.redirect(new URL("/login", env.appUrl));

  const params = request.nextUrl.searchParams;
  const oauthError = params.get("error");
  if (oauthError) return settingsRedirect({ error: oauthError === "access_denied" ? "denied" : "oauth" });

  const code = params.get("code");
  const state = params.get("state");
  const raw = request.cookies.get(OAUTH_COOKIE)?.value;
  let stored: { state?: string; verifier?: string; hint?: string | null } = {};
  try {
    stored = raw ? (JSON.parse(raw) as { state?: string; verifier?: string; hint?: string | null }) : {};
  } catch {
    stored = {};
  }
  if (!code || !state || !stored.state || !stored.verifier || stored.state !== state) {
    return settingsRedirect({ error: "state" });
  }

  try {
    const tokens = await exchangeCodeForTokens(code, stored.verifier);
    if (!tokens.refresh_token) return settingsRedirect({ error: "no_refresh_token" });
    const granted = (tokens.scope ?? "").split(" ");
    if (!GMAIL_SCOPES.every((scope) => granted.includes(scope))) return settingsRedirect({ error: "scope" });

    const profile = await GmailClient.profileWithToken(tokens.access_token);
    // A reconnect must land on the mailbox it was started for, not on whichever account the user picked.
    if (stored.hint && profile.emailAddress.toLowerCase() !== stored.hint) return settingsRedirect({ error: "mismatch" });
    const account = await saveEmailAccount({
      provider: "gmail",
      emailAddress: profile.emailAddress.toLowerCase(),
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      expiresIn: tokens.expires_in,
      scopes: tokens.scope ?? GMAIL_SCOPES.join(" "),
      syncState: { gmail: { historyId: profile.historyId } },
    });

    after(async () => {
      await syncEmailAccounts({ reason: "connect", budgetMs: 45_000, accountIds: [account.id] });
    });

    return settingsRedirect({ connected: "1" });
  } catch (error) {
    console.error("[google] OAuth callback failed:", error);
    return settingsRedirect({ error: "exchange" });
  }
}
