import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { buildAuthorizationUrl, createPkcePair } from "@/lib/gmail/oauth";

export const OAUTH_COOKIE = "foyer_oauth";

export async function GET(request: NextRequest) {
  if (!(await getSession())) return NextResponse.redirect(new URL("/login", env.appUrl));
  if (!env.google.configured) {
    return NextResponse.redirect(new URL("/settings/gmail?error=not_configured", env.appUrl));
  }
  const state = randomBytes(24).toString("base64url");
  const { verifier, challenge } = createPkcePair();
  const loginHint = request.nextUrl.searchParams.get("hint") ?? undefined;
  const url = buildAuthorizationUrl({ state, codeChallenge: challenge, loginHint });

  const response = NextResponse.redirect(url);
  response.cookies.set(OAUTH_COOKIE, JSON.stringify({ state, verifier }), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProduction,
    path: "/api/auth/google",
    maxAge: 10 * 60,
  });
  return response;
}
