import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workflowRuns, workflows, type Workflow, type WorkflowRun } from "@/lib/db/schema";

export async function listWorkflows(): Promise<Workflow[]> {
  return db.query.workflows.findMany({ orderBy: [asc(workflows.position), asc(workflows.createdAt)] });
}

export async function getWorkflow(id: string): Promise<Workflow | null> {
  const row = await db.query.workflows.findFirst({ where: eq(workflows.id, id) });
  return row ?? null;
}

export type WorkflowRunItem = WorkflowRun & { workflowName: string };

export async function listWorkflowRuns(limit = 25): Promise<WorkflowRunItem[]> {
  const rows = await db
    .select({ run: workflowRuns, workflowName: workflows.name })
    .from(workflowRuns)
    .innerJoin(workflows, eq(workflowRuns.workflowId, workflows.id))
    .orderBy(desc(workflowRuns.createdAt))
    .limit(limit);
  return rows.map((row) => ({ ...row.run, workflowName: row.workflowName }));
}
