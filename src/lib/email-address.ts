export type ParsedAddress = { name: string | null; address: string };

export function normalizeEmail(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Parses an RFC 5322 style address header such as
 *   "Doe, Jane" <jane@example.com>, John <john@example.com>, bob@example.com
 * into a list of name/address pairs. Tolerant of malformed input.
 */
export function parseAddressList(header: string | null | undefined): ParsedAddress[] {
  if (!header) return [];
  const items: string[] = [];
  let current = "";
  let inQuotes = false;
  let depth = 0;
  for (const char of header) {
    if (char === '"' ) {
      inQuotes = !inQuotes;
      current += char;
    } else if (!inQuotes && char === "<") {
      depth += 1;
      current += char;
    } else if (!inQuotes && char === ">") {
      depth = Math.max(0, depth - 1);
      current += char;
    } else if (!inQuotes && depth === 0 && char === ",") {
      items.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) items.push(current);

  const result: ParsedAddress[] = [];
  for (const raw of items) {
    const item = raw.trim();
    if (!item) continue;
    const angle = item.match(/^(.*?)<([^>]+)>\s*$/);
    if (angle) {
      const address = normalizeEmail(angle[2]);
      if (!address) continue;
      const name = cleanDisplayName(angle[1]);
      result.push({ name, address });
      continue;
    }
    const bare = item.match(/([^\s"<>,]+@[^\s"<>,]+)/);
    if (bare) {
      const address = normalizeEmail(bare[1]);
      if (address) result.push({ name: null, address });
    }
  }
  return result;
}

function cleanDisplayName(value: string): string | null {
  let name = value.trim();
  if (name.startsWith('"') && name.endsWith('"') && name.length >= 2) {
    name = name.slice(1, -1);
  }
  name = name.replace(/\\"/g, '"').trim();
  return name.length > 0 ? name : null;
}

export function formatAddress(entry: ParsedAddress): string {
  if (entry.name && entry.name !== entry.address) {
    const needsQuotes = /[",<>()@;:\\]/.test(entry.name);
    const name = needsQuotes ? `"${entry.name.replace(/"/g, '\\"')}"` : entry.name;
    return `${name} <${entry.address}>`;
  }
  return entry.address;
}

/** Splits a full name into first and last name parts. */
export function splitName(fullName: string | null | undefined): { firstName: string; lastName: string } {
  const cleaned = (fullName ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return { firstName: "", lastName: "" };
  const parts = cleaned.split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}
