import type { Client, Settings } from "@/lib/db/schema";

export type RenderContext = {
  client: Pick<Client, "firstName" | "lastName"> | null;
  contactName?: string | null;
  settings: Pick<Settings, "agentName" | "agencyName" | "agentPhone">;
};

/**
 * Replaces {{placeholders}} in template text with deterministic values.
 * Unknown placeholders are left untouched so that the agent can see them and
 * correct the template.
 */
export function renderTemplate(template: string, context: RenderContext): string {
  const fallbackName = context.contactName?.trim() || "";
  const firstName = context.client?.firstName?.trim() || fallbackName.split(/\s+/)[0] || "there";
  const lastName = context.client?.lastName?.trim() || "";
  const fullName = context.client
    ? [context.client.firstName, context.client.lastName].filter(Boolean).join(" ").trim()
    : fallbackName || "there";

  const values: Record<string, string> = {
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    agent_name: context.settings.agentName || "",
    agency_name: context.settings.agencyName || "",
    agent_phone: context.settings.agentPhone || "",
  };

  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, key: string) => {
    const value = values[key.toLowerCase()];
    return value === undefined ? match : value;
  });
}

/** Appends the agent's signature to plain-text email content. */
export function withSignature(body: string, signature: string): string {
  const trimmed = body.replace(/\s+$/, "");
  const sig = signature.trim();
  if (!sig) return trimmed;
  return `${trimmed}\n\n${sig}`;
}
