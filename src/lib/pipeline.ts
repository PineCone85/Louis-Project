export type StageGroup = "lead" | "active" | "transaction" | "closed";

export type Stage = {
  key: string;
  label: string;
  description: string;
  group: StageGroup;
};

/**
 * The default residential buyer pipeline. Stage keys are stored on clients,
 * labels are shown in the interface.
 */
export const STAGES: Stage[] = [
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
  { key: "completed", label: "Completed", description: "Transaction registered and complete.", group: "closed" },
  { key: "lost", label: "Lost", description: "No longer pursuing a purchase with us.", group: "closed" },
];

export const STAGE_KEYS = STAGES.map((stage) => stage.key);
export const ACTIVE_STAGE_KEYS = STAGES.filter((stage) => stage.group !== "closed").map((stage) => stage.key);

const STAGE_MAP = new Map(STAGES.map((stage) => [stage.key, stage]));

export function getStage(key: string): Stage {
  return STAGE_MAP.get(key) ?? { key, label: key, description: "", group: "lead" };
}

export function stageLabel(key: string): string {
  return getStage(key).label;
}

export function isStageKey(value: string): boolean {
  return STAGE_MAP.has(value);
}

export function stageIndex(key: string): number {
  return STAGE_KEYS.indexOf(key);
}
