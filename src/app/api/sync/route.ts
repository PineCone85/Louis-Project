import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { syncGmail } from "@/lib/gmail/sync";

export const maxDuration = 60;

export async function POST() {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const result = await syncGmail({ reason: "manual", budgetMs: 45_000 });
  return NextResponse.json(result);
}
