import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { buildMicrosoftAuthorizationUrl, createMicrosoftPkcePair } from "@/lib/outlook/oauth";

export const MICROSOFT_OAUTH_COOKIE = "foyer_ms_oauth";

/** Starts the Microsoft sign-in for connecting an Outlook / Microsoft 365 mailbox. */
export async function GET(request: NextRequest) {
  if (!(await getSession())) return NextResponse.redirect(new URL("/login", env.appUrl));
  if (!env.microsoft.configured) {
    return NextResponse.redirect(new URL("/settings/email?error=not_configured&provider=outlook", env.appUrl));
  }
  const state = randomBytes(24).toString("base64url");
  const { verifier, challenge } = createMicrosoftPkcePair();
  const loginHint = request.nextUrl.searchParams.get("hint") ?? undefined;
  const url = buildMicrosoftAuthorizationUrl({ state, codeChallenge: challenge, loginHint });

  const response = NextResponse.redirect(url);
  response.cookies.set(MICROSOFT_OAUTH_COOKIE, JSON.stringify({ state, verifier }), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProduction,
    path: "/api/auth/microsoft",
    maxAge: 10 * 60,
  });
  return response;
}
