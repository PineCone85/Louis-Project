import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { syncEmailAccounts } from "@/lib/email/sync";
import { runScheduledWorkflows } from "@/lib/workflows/scheduled";

export const maxDuration = 60;

export async function POST() {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const result = await syncEmailAccounts({ reason: "manual", budgetMs: 45_000 });
  const workflows = await runScheduledWorkflows().catch((error) => {
    console.error("[workflows] scheduled check failed:", error);
    return null;
  });
  return NextResponse.json({ ...result, workflows });
}
