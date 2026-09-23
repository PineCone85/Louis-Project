"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { changeStageAction } from "@/lib/actions/clients";
import { daysSince, formatCurrency, fullName } from "@/lib/format";
import { useStages } from "@/components/pipeline/stages-provider";
import type { PipelineClient } from "@/lib/queries/clients";
import { cx } from "@/components/ui/primitives";

type Props = { clients: PipelineClient[]; currency: string };

export function PipelineBoard({ clients, currency }: Props) {
  const router = useRouter();
  const stages = useStages();
  const [items, setItems] = useState(clients);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [, startTransition] = useTransition();

  const grouped = useMemo(() => {
    const map = new Map<string, PipelineClient[]>();
    for (const stage of stages) map.set(stage.key, []);
    for (const client of items) map.get(client.stage)?.push(client);
    return map;
  }, [items, stages]);

  const move = (clientId: string, stage: string) => {
    const current = items.find((c) => c.id === clientId);
    if (!current || current.stage === stage) return;
    setItems((list) => list.map((c) => (c.id === clientId ? { ...c, stage, stageChangedAt: new Date() } : c)));
    startTransition(async () => {
      const result = await changeStageAction(clientId, stage);
      if (!result.ok) setItems(clients);
      router.refresh();
    });
  };

  const visibleStages = stages.filter((stage) => showClosed || stage.group !== "closed");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 text-[12px] text-ink-muted">
        <span>Drag a client between columns or use the menu on each card to change their stage.</span>
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" className="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
          Show completed and lost
        </label>
      </div>
      <div className="scrollbar-thin flex gap-3 overflow-x-auto pb-4">
        {visibleStages.map((stage) => {
          const column = grouped.get(stage.key) ?? [];
          const isOver = over === stage.key && dragging !== null;
          return (
            <section
              key={stage.key}
              className={cx(
                "flex w-64 shrink-0 flex-col rounded-md border bg-canvas transition-colors",
                isOver ? "border-sage-500 bg-sage-50" : "border-line",
              )}
              onDragOver={(event) => {
                event.preventDefault();
                if (over !== stage.key) setOver(stage.key);
              }}
              onDragLeave={() => setOver((current) => (current === stage.key ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData("text/plain") || dragging;
                if (id) move(id, stage.key);
                setDragging(null);
                setOver(null);
              }}
            >
              <header className="flex items-center justify-between px-3 pt-3 pb-2">
                <div>
                  <h2 className={cx("text-[12px] font-semibold tracking-wide uppercase", stage.group === "closed" ? "text-ink-muted" : "text-ink")}>{stage.label}</h2>
                  <p className="text-[11px] text-ink-faint">{stage.description}</p>
                </div>
                <span className="ml-2 shrink-0 text-[12px] tabular-nums text-ink-muted">{column.length}</span>
              </header>
              <div className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
                {column.map((client) => {
                  const days = daysSince(client.stageChangedAt);
                  return (
                    <article
                      key={client.id}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/plain", client.id);
                        event.dataTransfer.effectAllowed = "move";
                        setDragging(client.id);
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setOver(null);
                      }}
                      className={cx(
                        "cursor-grab rounded-sm border border-line bg-paper p-3 shadow-[0_1px_0_rgba(21,23,21,0.03)] transition-opacity active:cursor-grabbing",
                        dragging === client.id && "opacity-40",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/clients/${client.id}`} className="min-w-0 truncate text-[13px] font-medium text-ink hover:underline">
                          {fullName(client)}
                        </Link>
                        {client.unreadCount > 0 ? <span className="badge-count">{client.unreadCount}</span> : null}
                      </div>
                      <p className="mt-0.5 text-[12px] text-ink-muted">
                        {client.budgetMax ? `Up to ${formatCurrency(client.budgetMax, currency)}` : client.preferredAreas ? client.preferredAreas : <span className="capitalize">{client.clientType}</span>}
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-ink-faint">
                        <span>
                          {days === 0 ? "Today" : `${days} day${days === 1 ? "" : "s"}`} in stage
                          {client.propertyCount > 0 ? ` · ${client.propertyCount} propert${client.propertyCount === 1 ? "y" : "ies"}` : ""}
                        </span>
                        <select
                          aria-label={`Move ${fullName(client)}`}
                          className="h-6 max-w-24 cursor-pointer rounded-xs border border-transparent bg-transparent pr-1 text-[11px] text-ink-muted hover:border-line"
                          value={client.stage}
                          onChange={(event) => move(client.id, event.target.value)}
                        >
                          {stages.map((option) => (
                            <option key={option.key} value={option.key}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </article>
                  );
                })}
                {column.length === 0 ? <div className="flex flex-1 items-center justify-center rounded-sm border border-dashed border-line py-6 text-[12px] text-ink-faint">Empty</div> : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
