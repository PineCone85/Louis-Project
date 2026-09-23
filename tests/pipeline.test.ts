import { describe, expect, it } from "vitest";
import { DEFAULT_STAGES, activeStageKeys, defaultStageKey, getStage, normalizeStages, stageIndex, stageKeyFromLabel, transactionStageKeys } from "@/lib/pipeline";

describe("configurable pipeline", () => {
  it("derives active and transaction keys from the groups", () => {
    expect(activeStageKeys(DEFAULT_STAGES)).not.toContain("completed");
    expect(activeStageKeys(DEFAULT_STAGES)).toContain("viewing");
    expect(transactionStageKeys(DEFAULT_STAGES)).toEqual(["offer_submitted", "negotiation", "offer_accepted", "closing"]);
    expect(defaultStageKey(DEFAULT_STAGES)).toBe("prospect");
  });

  it("falls back gracefully for unknown keys", () => {
    expect(getStage(DEFAULT_STAGES, "mystery").label).toBe("mystery");
    expect(stageIndex(DEFAULT_STAGES, "mystery")).toBe(-1);
  });

  it("creates stable, unique keys from labels", () => {
    expect(stageKeyFromLabel("Bond Application", [])).toBe("bond_application");
    expect(stageKeyFromLabel("Bond Application", ["bond_application"])).toBe("bond_application_2");
    expect(stageKeyFromLabel("  ", [])).toBe("stage");
  });

  it("validates stored stage lists and rejects broken ones", () => {
    const custom = normalizeStages([
      { key: "lead", label: "Lead", description: "", group: "lead" },
      { key: "viewing", label: "Viewing", description: "x", group: "active" },
      { key: "won", label: "Won", description: "", group: "closed", outcome: "won" },
      { key: "gone", label: "Gone", description: "", group: "closed", outcome: "lost" },
    ]);
    expect(custom).toHaveLength(4);
    expect(custom![3].outcome).toBe("lost");
    expect(normalizeStages([])).toBeNull();
    expect(normalizeStages([{ key: "a", label: "A", group: "nope" }])).toBeNull();
    expect(normalizeStages([{ key: "a", label: "A", group: "lead" }, { key: "a", label: "B", group: "lead" }])).toBeNull();
    expect(normalizeStages([{ key: "Bad Key", label: "A", group: "lead" }])).toBeNull();
    expect(normalizeStages("nonsense")).toBeNull();
  });
});
