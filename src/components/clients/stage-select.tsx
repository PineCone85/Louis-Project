"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight } from "lucide-react";
import { changeStageAction } from "@/lib/actions/clients";
import { STAGES, stageIndex } from "@/lib/pipeline";

export function StageSelect({ clientId, stage }: { clientId: string; stage: string }) {
  const router = useRouter();
  const [value, setValue] = useState(stage);
  const [pending, startTransition] = useTransition();
  const next = STAGES[stageIndex(value) + 1];
  const canAdvance = next && next.key !== "lost";

  const move = (target: string) => {
    setValue(target);
    startTransition(async () => {
      await changeStageAction(clientId, target);
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-2">
      <select className="select w-48" value={value} disabled={pending} onChange={(event) => move(event.target.value)} aria-label="Pipeline stage">
        {STAGES.map((item) => (
          <option key={item.key} value={item.key}>
            {item.label}
          </option>
        ))}
      </select>
      {canAdvance ? (
        <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => move(next.key)}>
          {next.label} <ArrowRight size={14} />
        </button>
      ) : null}
    </div>
  );
}
