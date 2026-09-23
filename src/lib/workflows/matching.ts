import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientProperties, clients, type Client, type Property } from "@/lib/db/schema";

export type ClientMatch = { client: Client; score: number; reasons: string[] };

const SALE_TYPES = ["buyer", "investor"];
const RENTAL_TYPES = ["tenant"];

function areaTokens(text: string | null): string[] {
  if (!text) return [];
  return text
    .split(/[,;/\n]+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 1);
}

/** Pulls "3 bed", "3-bedroom", "three bedrooms" style requirements out of free text. */
export function requiredBedrooms(requirements: string | null): number | null {
  if (!requirements) return null;
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
  const match = requirements.toLowerCase().match(/(\d+|one|two|three|four|five|six)\s*[- ]?\s*bed/);
  if (!match) return null;
  const n = Number.isFinite(Number(match[1])) ? Number(match[1]) : words[match[1]];
  return n ?? null;
}

/**
 * Scores how well a client fits a property. Returns null when the client is
 * the wrong kind (a seller for a sale, a buyer for a rental) or clearly out of
 * budget. Higher is better; budget and area matches carry the most weight.
 */
export function scoreClientForProperty(client: Client, property: Property): ClientMatch | null {
  const allowed = property.listingType === "rental" ? RENTAL_TYPES : SALE_TYPES;
  if (!allowed.includes(client.clientType)) return null;

  let score = 0;
  const reasons: string[] = [];

  if (property.price !== null && (client.budgetMin !== null || client.budgetMax !== null)) {
    const max = client.budgetMax ?? Number.POSITIVE_INFINITY;
    const min = client.budgetMin ?? 0;
    if (property.price > max * 1.25) return null;
    if (property.price <= max * 1.05 && property.price >= min * 0.9) {
      score += 3;
      reasons.push("within budget");
    } else if (property.price > max) {
      score -= 2;
      reasons.push("slightly over budget");
    } else {
      score -= 1;
      reasons.push("below their usual range");
    }
  }

  const areas = areaTokens(client.preferredAreas);
  if (areas.length > 0) {
    const place = `${property.suburb ?? ""} ${property.city ?? ""} ${property.address ?? ""}`.toLowerCase();
    const hit = areas.find((area) => place.includes(area));
    if (hit) {
      score += 3;
      reasons.push(`in a preferred area (${hit})`);
    } else {
      score -= 1;
    }
  }

  const beds = requiredBedrooms(client.requirements);
  if (beds !== null && property.bedrooms !== null) {
    if (property.bedrooms >= beds) {
      score += 1;
      reasons.push(`${property.bedrooms} bedrooms`);
    } else {
      score -= 2;
    }
  }

  const wants = (client.requirements ?? "").toLowerCase();
  const has = `${property.features ?? ""} ${property.description ?? ""}`.toLowerCase();
  for (const keyword of ["pool", "garden", "garage", "pet", "sea view", "security", "study", "fibre"]) {
    if (wants.includes(keyword) && has.includes(keyword)) {
      score += 1;
      reasons.push(keyword);
    }
  }

  return { client, score, reasons };
}

export type MatchOptions = {
  /** Only consider clients in these stages (defaults to every non-closed stage). */
  stages: string[];
  limit?: number;
  /** Minimum score to count as a match. 3 means at least a budget or area fit. */
  minScore?: number;
  /** Clients to leave out, for example those already linked to the property. */
  excludeIds?: string[];
};

export async function findMatchingClients(property: Property, options: MatchOptions): Promise<ClientMatch[]> {
  if (options.stages.length === 0) return [];
  const conditions = [isNull(clients.archivedAt), inArray(clients.stage, options.stages)];
  if (options.excludeIds && options.excludeIds.length > 0) conditions.push(notInArray(clients.id, options.excludeIds));
  const rows = await db.query.clients.findMany({ where: and(...conditions), limit: 500 });
  const minScore = options.minScore ?? 3;
  return rows
    .map((client) => scoreClientForProperty(client, property))
    .filter((m): m is ClientMatch => m !== null && m.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit ?? 10);
}

/** Clients with the property on their record, minus those who have bought it or said no. */
export async function findLinkedClients(propertyId: string, limit = 25): Promise<ClientMatch[]> {
  const rows = await db
    .select({ client: clients, status: clientProperties.status })
    .from(clientProperties)
    .innerJoin(clients, eq(clientProperties.clientId, clients.id))
    .where(and(eq(clientProperties.propertyId, propertyId), isNull(clients.archivedAt), notInArray(clientProperties.status, ["not_interested", "purchased"])))
    .limit(limit);
  return rows.map((row) => ({ client: row.client, score: 0, reasons: [`marked ${row.status.replace(/_/g, " ")}`] }));
}
