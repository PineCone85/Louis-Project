export const APP_NAME = "Foyer";

export const CLIENT_TYPES = [
  { key: "buyer", label: "Buyer" },
  { key: "seller", label: "Seller" },
  { key: "investor", label: "Investor" },
  { key: "tenant", label: "Tenant" },
  { key: "landlord", label: "Landlord" },
] as const;

export const CLIENT_SOURCES = [
  "Referral",
  "Website",
  "Property portal",
  "Walk-in",
  "Show house",
  "Social media",
  "Repeat client",
  "Cold outreach",
  "Other",
] as const;

export const PROPERTY_TYPES = [
  { key: "house", label: "House" },
  { key: "apartment", label: "Apartment" },
  { key: "townhouse", label: "Townhouse" },
  { key: "duplex", label: "Duplex" },
  { key: "land", label: "Vacant land" },
  { key: "farm", label: "Farm or smallholding" },
  { key: "commercial", label: "Commercial" },
  { key: "other", label: "Other" },
] as const;

export const PROPERTY_STATUSES = [
  { key: "available", label: "Available" },
  { key: "under_offer", label: "Under offer" },
  { key: "sold", label: "Sold" },
  { key: "rented", label: "Rented" },
  { key: "withdrawn", label: "Withdrawn" },
] as const;

export const LISTING_TYPES = [
  { key: "sale", label: "For sale" },
  { key: "rental", label: "To rent" },
] as const;

export const CLIENT_PROPERTY_STATUSES = [
  { key: "suggested", label: "Suggested" },
  { key: "interested", label: "Interested" },
  { key: "viewing_scheduled", label: "Viewing scheduled" },
  { key: "viewed", label: "Viewed" },
  { key: "offer_made", label: "Offer made" },
  { key: "not_interested", label: "Not interested" },
  { key: "purchased", label: "Purchased" },
] as const;

export const ACTIVITY_TYPES = [
  { key: "note", label: "Note" },
  { key: "call", label: "Call" },
  { key: "meeting", label: "Meeting" },
  { key: "viewing", label: "Viewing" },
] as const;

export const AUTO_REPLY_TRIGGERS = [
  { key: "any", label: "Every incoming message", description: "Reply to each message that arrives, subject to the cooldown." },
  { key: "new_contact", label: "First message from a contact", description: "Reply only to the first message ever received from a sender." },
  { key: "keyword", label: "Message contains keywords", description: "Reply when the subject or body contains any of the keywords." },
  { key: "outside_hours", label: "Outside business hours", description: "Reply when a message arrives outside the business hours set in Settings." },
  { key: "weekly", label: "Every week between", description: "Reply during a window that repeats every week, for example Friday evening to Monday morning." },
  { key: "away", label: "Away between dates", description: "Reply to messages that arrive during an away period, such as a holiday. The rule switches itself off when the period ends." },
] as const;

export const AUTO_REPLY_AUDIENCES = [
  { key: "all", label: "Clients and unknown contacts" },
  { key: "clients", label: "Existing clients only" },
  { key: "unknown", label: "Unknown contacts only" },
] as const;

export const TEMPLATE_PLACEHOLDERS = [
  { token: "{{first_name}}", description: "Client first name, or \"there\" when unknown" },
  { token: "{{last_name}}", description: "Client last name" },
  { token: "{{full_name}}", description: "Client full name" },
  { token: "{{agent_name}}", description: "Your name from Settings" },
  { token: "{{agency_name}}", description: "Agency name from Settings" },
  { token: "{{agent_phone}}", description: "Your phone number from Settings" },
] as const;

export function labelFor<T extends readonly { key: string; label: string }[]>(list: T, key: string | null | undefined): string {
  if (!key) return "";
  return list.find((item) => item.key === key)?.label ?? key;
}

export const WEEKDAYS = [
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
  { value: 0, label: "Sunday", short: "Sun" },
] as const;

export function weekdayLabel(value: number, short = false): string {
  const day = WEEKDAYS.find((d) => d.value === value);
  return day ? (short ? day.short : day.label) : String(value);
}
