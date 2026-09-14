import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

export const SESSION_COOKIE = "foyer_session";
export const SESSION_DAYS = 30;

export type Session = { email: string; issuedAt: number };

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.authSecret);
}

export async function createSessionToken(email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string") return null;
    if (payload.sub.toLowerCase() !== env.adminEmail) return null;
    return { email: payload.sub, issuedAt: payload.iat ?? 0 };
  } catch {
    return null;
  }
}
