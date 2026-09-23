"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { resetPipelineAction, savePipelineAction } from "@/lib/actions/pipeline";
import { DEFAULT_STAGES, STAGE_GROUPS, type Stage, type StageGroup } from "@/lib/pipeline";
import type { ActionResult } from "@/lib/validation";
import { SubmitButton } from "@/components/ui/form-controls";
import { cx } from "@/components/ui/primitives";

type Row = { key: string; label: string; description: string; group: StageGroup; outcome: "won" | "lost" };

function rowsFrom(stages: Stage[]): Row[] {
  return stages.map((s) => ({ key: s.key, label: s.label, description: s.description, group: s.group, outcome: s.outcome ?? "won" }));
}

export function PipelineEditor({ stages, counts }: { stages: Stage[]; counts: Record<string, number> }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => rowsFrom(stages));
  const [state, action] = useActionState<ActionResult<{ saved: boolean }>, FormData>(savePipelineAction, { ok: true });
  const [resetting, startReset] = useTransition();
  const [resetError, setResetError] = useState<string | null>(null);

  const update = (index: number, patch: Partial<Row>) => setRows((list) => list.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const move = (index: number, direction: -1 | 1) =>
    setRows((list) => {
      const next = [...list];
      const target = index + direction;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  const remove = (index: number) => setRows((list) => list.filter((_, i) => i !== index));
  const add = () => setRows((list) => [...list, { key: "", label: "", description: "", group: "active", outcome: "won" }]);

  return (
    <div className="space-y-6">
      <form action={action} className="panel">
        <input type="hidden" name="stages" value={JSON.stringify(rows)} />
        <div className="panel-header">
          <h2 className="panel-title">Stages</h2>
          {state.ok && state.data?.saved ? <span className="text-[12px] text-sage-800">Saved</span> : null}
        </div>
        <div className="panel-body space-y-3">
          <p className="text-[13px] text-ink-muted">
            Clients move through these stages in order, from top to bottom. Rename, reorder, add or remove stages. A stage that still has clients in it cannot be removed; move them first.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] font-medium tracking-wide text-ink-muted uppercase">
                  <th className="w-16 px-2 py-2">Order</th>
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2">Description</th>
                  <th className="w-40 px-2 py-2">Group</th>
                  <th className="w-20 px-2 py-2">Clients</th>
                  <th className="w-12 px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row, index) => {
                  const count = row.key ? (counts[row.key] ?? 0) : 0;
                  return (
                    <tr key={row.key || `new-${index}`} className="align-top">
                      <td className="px-2 py-2">
                        <div className="flex gap-1">
                          <button type="button" className="text-ink-faint hover:text-ink disabled:opacity-30" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Move up">
                            <ArrowUp size={14} />
                          </button>
                          <button type="button" className="text-ink-faint hover:text-ink disabled:opacity-30" disabled={index === rows.length - 1} onClick={() => move(index, 1)} aria-label="Move down">
                            <ArrowDown size={14} />
                          </button>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <input className="input h-9" value={row.label} onChange={(e) => update(index, { label: e.target.value })} placeholder="Stage name" aria-label="Stage name" />
                        {row.key ? <span className="mt-0.5 block text-[11px] text-ink-faint">key: {row.key}</span> : <span className="mt-0.5 block text-[11px] text-ink-faint">new stage</span>}
                      </td>
                      <td className="px-2 py-2">
                        <input className="input h-9" value={row.description} onChange={(e) => update(index, { description: e.target.value })} placeholder="What this stage means" aria-label="Description" />
                      </td>
                      <td className="px-2 py-2">
                        <select className="select h-9" value={row.group} onChange={(e) => update(index, { group: e.target.value as StageGroup })} aria-label="Group">
                          {STAGE_GROUPS.map((g) => (
                            <option key={g.key} value={g.key}>
                              {g.label}
                            </option>
                          ))}
                        </select>
                        {row.group === "closed" ? (
                          <select className="select mt-1 h-8 text-[12px]" value={row.outcome} onChange={(e) => update(index, { outcome: e.target.value as "won" | "lost" })} aria-label="Outcome">
                            <option value="won">Won (green)</option>
                            <option value="lost">Lost (red)</option>
                          </select>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 tabular-nums text-ink-muted">{row.key ? count : "–"}</td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          className="text-ink-faint hover:text-danger disabled:opacity-30"
                          disabled={count > 0 || rows.length === 1}
                          title={count > 0 ? "Move the clients in this stage first" : "Remove stage"}
                          onClick={() => remove(index)}
                          aria-label="Remove stage"
                        >
                          <X size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={add}>
            <Plus size={14} /> Add stage
          </button>
          <div className="rounded-sm border border-line bg-canvas p-3 text-[12px] text-ink-muted">
            <p className="mb-1 font-medium text-ink">What the groups mean</p>
            <ul className="space-y-0.5">
              {STAGE_GROUPS.map((g) => (
                <li key={g.key}>
                  <span className="font-medium text-ink">{g.label}:</span> {g.description}
                </li>
              ))}
            </ul>
          </div>
          {!state.ok && state.error ? <p className="form-error">{state.error}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            <SubmitButton pendingText="Saving…">Save pipeline</SubmitButton>
            <button
              type="button"
              className={cx("btn btn-ghost", resetting && "opacity-60")}
              disabled={resetting}
              onClick={() => {
                if (!window.confirm("Reset the pipeline to the default stages? Custom stages are removed (only possible when no clients are in them).")) return;
                setResetError(null);
                startReset(async () => {
                  const result = await resetPipelineAction();
                  if (!result.ok) {
                    setResetError(result.error ?? "Could not reset");
                    return;
                  }
                  setRows(rowsFrom(DEFAULT_STAGES));
                  router.refresh();
                });
              }}
            >
              Reset to defaults
            </button>
            {resetError ? <span className="text-[12px] text-danger">{resetError}</span> : null}
          </div>
        </div>
      </form>
    </div>
  );
}
