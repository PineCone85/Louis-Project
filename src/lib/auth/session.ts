import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { SESSION_COOKIE, SESSION_DAYS, createSessionToken, verifySessionToken, type Session } from "./token";

export { SESSION_COOKIE, verifySessionToken, type Session };

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.isProduction,
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Server-component and server-action guard. Redirects to the login page when unauthenticated. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function setSessionCookie(email: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, await createSessionToken(email), sessionCookieOptions());
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
}
