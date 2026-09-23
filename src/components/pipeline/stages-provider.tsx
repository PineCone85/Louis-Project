"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_STAGES, type Stage } from "@/lib/pipeline";

const StagesContext = createContext<Stage[]>(DEFAULT_STAGES);

/** Makes the agent's configured pipeline available to every client component. */
export function StagesProvider({ stages, children }: { stages: Stage[]; children: ReactNode }) {
  return <StagesContext.Provider value={stages}>{children}</StagesContext.Provider>;
}

export function useStages(): Stage[] {
  return useContext(StagesContext);
}
