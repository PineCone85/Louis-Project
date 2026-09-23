"use client";

import { getStage } from "@/lib/pipeline";
import { cx } from "@/components/ui/primitives";
import { useStages } from "./stages-provider";

export function StageChip({ stage, className }: { stage: string; className?: string }) {
  const stages = useStages();
  const meta = getStage(stages, stage);
  const variant =
    meta.group === "closed"
      ? meta.outcome === "lost"
        ? "stage-lost"
        : "stage-completed"
      : meta.group === "transaction"
        ? "stage-transaction"
        : meta.group === "active"
          ? "stage-active"
          : "stage-lead";
  return <span className={cx("badge", variant, className)}>{meta.label}</span>;
}
