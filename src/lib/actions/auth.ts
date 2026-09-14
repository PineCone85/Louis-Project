"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { verifyPassword } from "@/lib/auth/password";
import { clearSessionCookie, setSessionCookie } from "@/lib/auth/session";
import { clearLoginFailures, loginLockRemaining, recordLoginFailure } from "@/lib/auth/throttle";
import { env } from "@/lib/env";
import { formString } from "@/lib/validation";

export type LoginState = { error?: string; email?: string };

async function clientIdentifier(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return ip;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = formString(formData, "email").toLowerCase();
  const password = formData.get("password");
  const next = formString(formData, "next");
  if (!email || typeof password !== "string" || password.length === 0) {
    return { error: "Enter your email address and password.", email };
  }

  const identifier = await clientIdentifier();
  const wait = await loginLockRemaining(identifier);
  if (wait > 0) {
    return { error: `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minute${wait > 60 ? "s" : ""}.`, email };
  }

  let valid = false;
  try {
    valid = email === env.adminEmail && verifyPassword(password, env.adminPasswordHash);
  } catch (error) {
    console.error("[auth] configuration error:", error);
    return { error: "The administrator account is not configured. Set ADMIN_EMAIL and ADMIN_PASSWORD_HASH.", email };
  }

  if (!valid) {
    await recordLoginFailure(identifier);
    return { error: "Incorrect email address or password.", email };
  }

  await clearLoginFailures(identifier);
  await setSessionCookie(email);
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}
