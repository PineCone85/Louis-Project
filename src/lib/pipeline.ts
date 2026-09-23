/**
 * The client pipeline. Stages are configurable in Settings > Pipeline and
 * stored on the settings row; these helpers work on whatever list is active.
 * Stage keys are stored on clients, so keys stay stable when a stage is
 * renamed. Every helper takes the active stage list as its first argument.
 */

export type StageGroup = "lead" | "active" | "transaction" | "closed";

export type Stage = {
  key: string;
  label: string;
  description: string;
  group: StageGroup;
  /** Only meaningful for the closed group: colours the chip green (won) or red (lost). */
  outcome?: "won" | "lost";
};

export const STAGE_GROUPS: Array<{ key: StageGroup; label: string; description: string }> = [
  { key: "lead", label: "Lead", description: "New or early-stage contacts you are still qualifying." },
  { key: "active", label: "Active", description: "Clients you are actively working with: searching, viewing, deciding." },
  { key: "transaction", label: "Transaction", description: "An offer is on the table through to registration. Counted as \"in transaction\" on the dashboard." },
  { key: "closed", label: "Closed", description: "Finished, won or lost. Hidden from the pipeline board by default and excluded from active counts." },
];

/** The default residential buyer pipeline, used until the agent customises it. */
export const DEFAULT_STAGES: Stage[] = [
  { key: "prospect", label: "Prospect", description: "New lead, not yet contacted.", group: "lead" },
  { key: "contacted", label: "Contacted", description: "Initial contact has been made.", group: "lead" },
  { key: "qualified", label: "Qualified", description: "Needs, budget and timeline confirmed.", group: "lead" },
  { key: "property_search", label: "Property Search", description: "Actively matching properties.", group: "active" },
  { key: "viewing", label: "Viewing", description: "Viewings scheduled or under way.", group: "active" },
  { key: "interested", label: "Interested", description: "Serious interest in one or more properties.", group: "active" },
  { key: "offer_submitted", label: "Offer Submitted", description: "An offer to purchase has been submitted.", group: "transaction" },
  { key: "negotiation", label: "Negotiation", description: "Terms are being negotiated.", group: "transaction" },
  { key: "offer_accepted", label: "Offer Accepted", description: "Offer accepted, conditions pending.", group: "transaction" },
  { key: "closing", label: "Closing", description: "Bond approval, transfer and registration.", group: "transaction" },
  { key: "completed", label: "Completed", description: "Transaction registered and complete.", group: "closed", outcome: "won" },
  { key: "lost", label: "Lost", description: "No longer pursuing a purchase with us.", group: "closed", outcome: "lost" },
];

const GROUP_KEYS: StageGroup[] = ["lead", "active", "transaction", "closed"];

export function stageKeys(stages: Stage[]): string[] {
  return stages.map((stage) => stage.key);
}

export function activeStageKeys(stages: Stage[]): string[] {
  return stages.filter((stage) => stage.group !== "closed").map((stage) => stage.key);
}

export function transactionStageKeys(stages: Stage[]): string[] {
  return stages.filter((stage) => stage.group === "transaction").map((stage) => stage.key);
}

export function getStage(stages: Stage[], key: string): Stage {
  return stages.find((stage) => stage.key === key) ?? { key, label: key, description: "", group: "lead" };
}

export function stageLabel(stages: Stage[], key: string): string {
  return getStage(stages, key).label;
}

export function isStageKey(stages: Stage[], value: string): boolean {
  return stages.some((stage) => stage.key === value);
}

export function stageIndex(stages: Stage[], key: string): number {
  return stages.findIndex((stage) => stage.key === key);
}

/** The stage new clients start in: the first one in the list. */
export function defaultStageKey(stages: Stage[]): string {
  return stages[0]?.key ?? DEFAULT_STAGES[0].key;
}

/** Turns a label into a stable, unique key such as "bond_application". */
export function stageKeyFromLabel(label: string, taken: string[]): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "stage";
  let key = base;
  let n = 2;
  while (taken.includes(key)) {
    key = `${base}_${n}`;
    n += 1;
  }
  return key;
}

/**
 * Validates a stored or submitted stage list. Returns null when it is not a
 * usable list, so callers can fall back to the defaults.
 */
export function normalizeStages(input: unknown): Stage[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const seen = new Set<string>();
  const stages: Stage[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Record<string, unknown>;
    const key = typeof item.key === "string" ? item.key.trim() : "";
    const label = typeof item.label === "string" ? item.label.trim() : "";
    const group = typeof item.group === "string" && (GROUP_KEYS as string[]).includes(item.group) ? (item.group as StageGroup) : null;
    if (!key || !label || !group || seen.has(key) || !/^[a-z0-9_]+$/.test(key)) return null;
    seen.add(key);
    const stage: Stage = {
      key,
      label: label.slice(0, 60),
      description: typeof item.description === "string" ? item.description.trim().slice(0, 200) : "",
      group,
    };
    if (group === "closed") stage.outcome = item.outcome === "lost" ? "lost" : "won";
    stages.push(stage);
  }
  return stages;
}
