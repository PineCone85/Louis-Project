/**
 * Seeds a database with a complete, realistic demo of Foyer.
 *
 *   npm run demo:seed        (uses .env.demo)
 *
 * The script migrates the database, wipes every table, then inserts a Cape Town
 * agency with clients at every pipeline stage, properties in every status,
 * email and WhatsApp conversations, activities, templates, auto-reply rules and
 * notifications. Dates are relative to "now" so the dashboard always has
 * something due today, something overdue and something gone quiet.
 *
 * Safety: refuses to run unless the database name contains "demo" or
 * --force is passed, because it deletes everything first.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[seed] DATABASE_URL is not set.");
  process.exit(1);
}
const dbName = new URL(url).pathname.replace(/^\//, "");
if (!/demo/i.test(dbName) && !process.argv.includes("--force")) {
  console.error(`[seed] Refusing to wipe database "${dbName}" because its name does not contain "demo". Pass --force to override.`);
  process.exit(1);
}

const pool = new Pool({ connectionString: url, max: 1 });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const now = new Date();
/** A date `days` ago at the given hour (local to the server, fine for a demo). */
const ago = (days, hour = 10, minute = 0) => {
  const d = new Date(now.getTime() - days * DAY);
  d.setHours(hour, minute, 0, 0);
  return d;
};
const inDays = (days, hour = 10) => ago(-days, hour);
const hoursAgo = (hours) => new Date(now.getTime() - hours * HOUR);

const AGENT = {
  name: "Sam Naidoo",
  agency: "Harbourview Properties",
  phone: "+27 82 555 0100",
  email: "sam@harbourview.demo",
};

const paragraphs = (text) =>
  text
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("\n");

async function insert(client, table, row) {
  const keys = Object.keys(row);
  const values = keys.map((k) => {
    const v = row[k];
    return v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v;
  });
  const sql = `insert into ${table} (${keys.map((k) => `"${k}"`).join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")})`;
  await client.query(sql, values);
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const ids = {
  clients: {},
  properties: {},
  templates: {},
  rules: {},
  messages: {},
  workflows: {},
};
const id = (bucket, key) => (ids[bucket][key] ??= randomUUID());

const clients = [
  {
    key: "thandi",
    first_name: "Thandi",
    last_name: "Mokoena",
    email: "thandi.mokoena@example.com",
    phone: "+27825550101",
    client_type: "buyer",
    stage: "prospect",
    source: "Website",
    budget_min: 2500000,
    budget_max: 3200000,
    preferred_areas: "Sea Point, Green Point, Mouille Point",
    requirements: "2 bedrooms, secure parking, sea view if possible. First-time buyer, pre-approved with FNB.",
    notes: "New lead from the website enquiry form. Has not been called yet. Wants to move by year end.",
    created_at: ago(1, 9),
    last_contact_at: null,
    last_inbound_at: hoursAgo(3),
    next_follow_up_at: ago(0, 8),
    stage_changed_at: ago(1, 9),
  },
  {
    key: "james",
    first_name: "James",
    last_name: "van der Merwe",
    email: "james.vdm@example.com",
    phone: "+27825550102",
    client_type: "buyer",
    stage: "contacted",
    source: "Property portal",
    budget_min: 1800000,
    budget_max: 2400000,
    preferred_areas: "Pinelands, Rondebosch, Claremont",
    requirements: "Townhouse or small house, pet friendly, near good schools.",
    notes: "Enquired on Property24 about the Pinelands townhouse. Relocating from Johannesburg in November. Prefers WhatsApp.",
    created_at: ago(4, 14),
    last_contact_at: ago(3, 11),
    last_inbound_at: hoursAgo(1),
    next_follow_up_at: inDays(1, 9),
    stage_changed_at: ago(3, 11),
  },
  {
    key: "priya",
    first_name: "Priya",
    last_name: "Reddy",
    email: "priya.reddy@example.com",
    alternate_email: "p.reddy@work-example.com",
    phone: "+27825550103",
    client_type: "buyer",
    stage: "qualified",
    source: "Referral",
    budget_min: 4000000,
    budget_max: 5200000,
    preferred_areas: "Constantia, Newlands, Bishopscourt",
    requirements: "4 bedrooms, study, garden for two dogs, double garage. Bond pre-approval in place.",
    notes: "Referred by Elena Rossi. Husband Dev works from home so a study is non-negotiable. Available for viewings on Saturdays.",
    created_at: ago(12, 10),
    last_contact_at: ago(6, 16),
    last_inbound_at: ago(6, 15),
    next_follow_up_at: ago(2, 9),
    stage_changed_at: ago(9, 10),
  },
  {
    key: "lerato",
    first_name: "Lerato",
    last_name: "Dlamini",
    email: "lerato.d@example.com",
    phone: "+27825550104",
    client_type: "investor",
    stage: "property_search",
    source: "Social media",
    budget_min: 1200000,
    budget_max: 1900000,
    preferred_areas: "Woodstock, Observatory, Salt River",
    requirements: "Buy-to-let with at least 8% gross yield. Prefers lock-up-and-go apartments with low levies.",
    notes: "Already owns two units in Salt River. Very numbers driven: always send levy, rates and rental estimates together.",
    created_at: ago(20, 12),
    last_contact_at: ago(2, 10),
    last_inbound_at: ago(2, 9),
    next_follow_up_at: inDays(4, 10),
    stage_changed_at: ago(15, 12),
  },
  {
    key: "botha",
    first_name: "Michael",
    last_name: "Botha",
    email: "michael.botha@example.com",
    phone: "+27825550105",
    alternate_phone: "+27825550106",
    client_type: "buyer",
    stage: "viewing",
    source: "Show house",
    budget_min: 4200000,
    budget_max: 4800000,
    preferred_areas: "Constantia, Tokai",
    requirements: "Family home, 4 beds, pool, good security. Wife Sarah is the decision maker on kitchens.",
    notes: "Met at the Constantia show house. Second viewing booked for this weekend. Alternate number is Sarah.",
    created_at: ago(9, 15),
    last_contact_at: ago(1, 17),
    last_inbound_at: ago(1, 16),
    next_follow_up_at: inDays(2, 9),
    stage_changed_at: ago(4, 10),
  },
  {
    key: "ahmed",
    first_name: "Ahmed",
    last_name: "Patel",
    email: "ahmed.patel@example.com",
    phone: "+27825550107",
    client_type: "buyer",
    stage: "interested",
    source: "Repeat client",
    budget_min: 2800000,
    budget_max: 3100000,
    preferred_areas: "Sea Point",
    requirements: "Lock-up-and-go apartment near the promenade for weekends in Cape Town.",
    notes: "Bought his Durbanville home through us in 2022. Loved the Sea Point apartment, is comparing it to one from another agency.",
    created_at: ago(18, 11),
    last_contact_at: ago(1, 12),
    last_inbound_at: ago(1, 11),
    next_follow_up_at: inDays(1, 14),
    stage_changed_at: ago(2, 12),
  },
  {
    key: "nomvula",
    first_name: "Nomvula",
    last_name: "Khumalo",
    email: "nomvula.k@example.com",
    phone: "+27825550108",
    client_type: "buyer",
    stage: "offer_submitted",
    source: "Referral",
    budget_min: 3000000,
    budget_max: 3300000,
    preferred_areas: "Pinelands",
    requirements: "3 bed townhouse in a secure estate.",
    notes: "Offer of R3,150,000 submitted on the Pinelands townhouse, 72-hour bond clause. Seller responding by Friday.",
    created_at: ago(25, 10),
    last_contact_at: ago(0, 9),
    last_inbound_at: ago(0, 8),
    next_follow_up_at: inDays(3, 9),
    stage_changed_at: ago(1, 15),
  },
  {
    key: "pieter",
    first_name: "Pieter",
    last_name: "Steyn",
    email: "pieter.steyn@example.com",
    phone: "+27825550109",
    client_type: "seller",
    stage: "negotiation",
    source: "Referral",
    preferred_areas: "Somerset West",
    requirements: "Selling the Somerset West plot. Wants R1.1m, will consider R1.05m for a quick unconditional sale.",
    notes: "Seller. Buyer from another agency offered R980,000. Pieter countered at R1,060,000. Waiting on buyer.",
    created_at: ago(40, 10),
    last_contact_at: ago(2, 14),
    last_inbound_at: ago(2, 13),
    next_follow_up_at: inDays(1, 11),
    stage_changed_at: ago(5, 10),
  },
  {
    key: "chloe",
    first_name: "Chloe",
    last_name: "Williams",
    email: "chloe.w@example.com",
    phone: "+27825550110",
    client_type: "tenant",
    stage: "viewing",
    source: "Website",
    budget_min: 12000,
    budget_max: 15000,
    preferred_areas: "Rondebosch, Claremont",
    requirements: "Furnished or unfurnished cottage, must allow one cat. Moving in on the 1st of next month.",
    notes: "Tenant. Viewing the Rondebosch garden cottage on Thursday. Employment letter and 3 months bank statements already received.",
    created_at: ago(6, 9),
    last_contact_at: ago(1, 10),
    last_inbound_at: ago(1, 9),
    next_follow_up_at: inDays(2, 16),
    stage_changed_at: ago(2, 9),
  },
  {
    key: "sipho",
    first_name: "Sipho",
    last_name: "Ndlovu",
    email: "sipho.ndlovu@example.com",
    phone: "+27825550111",
    client_type: "buyer",
    stage: "closing",
    source: "Walk-in",
    budget_min: 3500000,
    budget_max: 3700000,
    preferred_areas: "Durbanville",
    requirements: "Family home close to Durbanville schools.",
    notes: "Offer accepted on the Durbanville house at R3,600,000. Bond approved by Standard Bank. Transfer attorneys: Van Wyk & Partners. Expected registration in 6 weeks.",
    created_at: ago(55, 10),
    last_contact_at: ago(3, 10),
    last_inbound_at: ago(3, 9),
    next_follow_up_at: inDays(7, 10),
    stage_changed_at: ago(8, 10),
  },
  {
    key: "elena",
    first_name: "Elena",
    last_name: "Rossi",
    email: "elena.rossi@example.com",
    phone: "+27825550112",
    client_type: "buyer",
    stage: "completed",
    source: "Referral",
    budget_min: 6000000,
    budget_max: 7000000,
    preferred_areas: "Mouille Point",
    requirements: "Penthouse with sea views.",
    notes: "Purchased the Mouille Point penthouse. Registered 2 months ago. Referred Priya Reddy. Send a housewarming gift.",
    created_at: ago(140, 10),
    last_contact_at: ago(30, 10),
    last_inbound_at: ago(30, 9),
    next_follow_up_at: null,
    stage_changed_at: ago(60, 10),
  },
  {
    key: "daniel",
    first_name: "Daniel",
    last_name: "Okafor",
    email: "daniel.okafor@example.com",
    phone: "+27825550113",
    client_type: "buyer",
    stage: "lost",
    source: "Cold outreach",
    budget_min: 1500000,
    budget_max: 2000000,
    preferred_areas: "Observatory",
    requirements: "Starter home.",
    notes: "Bought privately through a friend. Keep on the mailing list; he mentioned wanting an investment unit in a year or two.",
    created_at: ago(70, 10),
    last_contact_at: ago(35, 10),
    last_inbound_at: ago(35, 9),
    next_follow_up_at: null,
    stage_changed_at: ago(35, 10),
  },
  {
    key: "grace",
    first_name: "Grace",
    last_name: "Mbeki",
    email: "grace.mbeki@example.com",
    phone: "+27825550114",
    client_type: "landlord",
    stage: "contacted",
    source: "Referral",
    preferred_areas: "Rondebosch",
    requirements: "Wants a managing agent for her Rondebosch garden cottage.",
    notes: "Landlord of the Rondebosch cottage. Was going to send the lease template. Has gone quiet since our first call.",
    created_at: ago(24, 10),
    last_contact_at: ago(19, 10),
    last_inbound_at: ago(19, 9),
    next_follow_up_at: null,
    stage_changed_at: ago(19, 10),
  },
  {
    key: "kevin",
    first_name: "Kevin",
    last_name: "Brown",
    email: "kevin.brown@example.com",
    phone: "+27825550115",
    client_type: "buyer",
    stage: "prospect",
    source: "Other",
    notes: "Duplicate of a lead that came in twice. Archived to keep the pipeline clean; archived clients are hidden from lists but keep their history.",
    created_at: ago(30, 10),
    last_contact_at: null,
    last_inbound_at: null,
    next_follow_up_at: null,
    stage_changed_at: ago(30, 10),
    archived_at: ago(28, 10),
  },
];

const properties = [
  {
    key: "seapoint",
    title: "Sunlit two-bedroom with sea views",
    reference: "HV-2041",
    status: "available",
    property_type: "apartment",
    listing_type: "sale",
    price: 2950000,
    address: "12 Beach Road",
    suburb: "Sea Point",
    city: "Cape Town",
    province: "Western Cape",
    postal_code: "8005",
    bedrooms: 2,
    bathrooms: 2,
    parking: 1,
    floor_size: 85,
    description: "North-facing apartment on the fourth floor with uninterrupted views over the promenade. Open-plan living, modern kitchen, secure basement parking and 24-hour concierge.",
    features: "Sea views, balcony, basement parking, concierge, pet friendly (small pets), fibre",
    listing_url: "https://example.com/listings/HV-2041",
    notes: "Levies R2,850, rates R1,120. Seller is relocating and motivated. Body corporate allows short-term letting.",
  },
  {
    key: "constantia",
    title: "Family home on the slopes of Constantia",
    reference: "HV-2038",
    status: "available",
    property_type: "house",
    listing_type: "sale",
    price: 4750000,
    address: "8 Silverhurst Avenue",
    suburb: "Constantia",
    city: "Cape Town",
    province: "Western Cape",
    postal_code: "7806",
    bedrooms: 4,
    bathrooms: 3,
    parking: 2,
    floor_size: 320,
    erf_size: 1200,
    description: "Established garden with mountain views, four bedrooms, a separate study, solar-heated pool and a double garage. Close to Constantia Village and top schools.",
    features: "Pool, study, double garage, borehole, solar geyser, alarm and beams",
    listing_url: "https://example.com/listings/HV-2038",
    notes: "Show house every second Sunday. Sellers want a 60-day occupation.",
  },
  {
    key: "woodstock",
    title: "Loft apartment in a converted warehouse",
    reference: "HV-2045",
    status: "available",
    property_type: "apartment",
    listing_type: "sale",
    price: 1450000,
    address: "The Foundry, 22 Albert Road",
    suburb: "Woodstock",
    city: "Cape Town",
    province: "Western Cape",
    postal_code: "7925",
    bedrooms: 1,
    bathrooms: 1,
    parking: 1,
    floor_size: 62,
    description: "Double-volume loft with exposed brick, industrial windows and a mezzanine bedroom. Currently tenanted at R11,500 per month on a lease ending in March.",
    features: "Double volume, mezzanine, secure parking, tenanted, fibre",
    listing_url: "https://example.com/listings/HV-2045",
    notes: "Gross yield about 9.5% at asking. Levies R1,650. Ideal for Lerato.",
  },
  {
    key: "obs",
    title: "Renovated Victorian in Observatory",
    reference: "HV-2032",
    status: "under_offer",
    property_type: "house",
    listing_type: "sale",
    price: 1795000,
    address: "41 Lower Main Road",
    suburb: "Observatory",
    city: "Cape Town",
    province: "Western Cape",
    postal_code: "7925",
    bedrooms: 2,
    bathrooms: 1,
    parking: 1,
    floor_size: 110,
    erf_size: 220,
    description: "Broekie lace, wooden floors and a renovated kitchen. Small courtyard garden and off-street parking behind a gate.",
    features: "Original features, courtyard, off-street parking",
    notes: "Under offer to a buyer from another agency. Backup offers welcome.",
  },
  {
    key: "pinelands",
    title: "Modern townhouse in a secure Pinelands estate",
    reference: "HV-2040",
    status: "under_offer",
    property_type: "townhouse",
    listing_type: "sale",
    price: 3200000,
    address: "Unit 14, Oakridge Estate, Forest Drive",
    suburb: "Pinelands",
    city: "Cape Town",
    province: "Western Cape",
    postal_code: "7405",
    bedrooms: 3,
    bathrooms: 2.5,
    parking: 2,
    floor_size: 165,
    description: "Three-bedroom townhouse with a private garden, open-plan living and a double garage inside a 24-hour manned estate with a clubhouse and pool.",
    features: "Estate security, private garden, double garage, clubhouse, pool",
    listing_url: "https://example.com/listings/HV-2040",
    notes: "Nomvula Khumalo's offer at R3,150,000 is with the seller. James van der Merwe is a backup.",
  },
  {
    key: "cottage",
    title: "Garden cottage to rent in Rondebosch",
    reference: "HV-R117",
    status: "available",
    property_type: "house",
    listing_type: "rental",
    price: 14500,
    address: "3A Belmont Road",
    suburb: "Rondebosch",
    city: "Cape Town",
    province: "Western Cape",
    postal_code: "7700",
    bedrooms: 1,
    bathrooms: 1,
    parking: 1,
    floor_size: 55,
    description: "Private one-bedroom cottage in the garden of a family home. Own entrance, small patio, prepaid electricity and water included. Available from the 1st.",
    features: "Own entrance, patio, water included, pet friendly (cats), fibre ready",
    notes: "Owner is Grace Mbeki (client). Deposit equal to one month's rent.",
  },
  {
    key: "durbanville",
    title: "Family home near Durbanville schools",
    reference: "HV-2029",
    status: "under_offer",
    property_type: "house",
    listing_type: "sale",
    price: 3650000,
    address: "17 Protea Street",
    suburb: "Durbanville",
    city: "Cape Town",
    province: "Western Cape",
    postal_code: "7550",
    bedrooms: 4,
    bathrooms: 2,
    parking: 2,
    floor_size: 240,
    erf_size: 800,
    description: "Neat four-bedroom home with a flatlet, established garden and a pool. Walking distance to Durbanville Primary.",
    features: "Flatlet, pool, double garage, solar panels",
    notes: "Sold to Sipho Ndlovu at R3,600,000. Awaiting transfer.",
  },
  {
    key: "plot",
    title: "Vacant plot with mountain views",
    reference: "HV-2044",
    status: "under_offer",
    property_type: "land",
    listing_type: "sale",
    price: 1100000,
    address: "Erf 2211, Helderberg Estate",
    suburb: "Somerset West",
    city: "Cape Town",
    province: "Western Cape",
    postal_code: "7130",
    erf_size: 950,
    description: "Level plot in a security estate with approved building guidelines. Services on the boundary.",
    features: "Estate security, level, services on boundary",
    notes: "Seller Pieter Steyn. Offer at R980,000 countered at R1,060,000.",
  },
  {
    key: "penthouse",
    title: "Penthouse on the Mouille Point promenade",
    reference: "HV-2012",
    status: "sold",
    property_type: "apartment",
    listing_type: "sale",
    price: 6800000,
    address: "The Bay, 90 Beach Road",
    suburb: "Mouille Point",
    city: "Cape Town",
    province: "Western Cape",
    postal_code: "8005",
    bedrooms: 3,
    bathrooms: 3,
    parking: 2,
    floor_size: 210,
    description: "Top-floor penthouse with wrap-around terrace, plunge pool and views from Robben Island to Lion's Head.",
    features: "Terrace, plunge pool, two parking bays, storeroom",
    notes: "Sold to Elena Rossi. Registered two months ago.",
  },
  {
    key: "kalkbay",
    title: "Fisherman's cottage in Kalk Bay",
    reference: "HV-2019",
    status: "withdrawn",
    property_type: "house",
    listing_type: "sale",
    price: 2400000,
    address: "5 Harbour Lane",
    suburb: "Kalk Bay",
    city: "Cape Town",
    province: "Western Cape",
    postal_code: "7975",
    bedrooms: 2,
    bathrooms: 1,
    floor_size: 90,
    erf_size: 180,
    description: "Charming cottage a street back from the harbour.",
    notes: "Withdrawn: owners decided to keep it as a holiday let. Check again in the new year.",
  },
];

/** client -> property relationships; every status in CLIENT_PROPERTY_STATUSES is represented. */
const links = [
  { client: "thandi", property: "seapoint", status: "suggested", notes: "Matches budget and area. Send with the enquiry reply.", created_at: ago(1, 9) },
  { client: "james", property: "pinelands", status: "interested", notes: "Enquired on Property24. Backup if Nomvula's offer falls through.", created_at: ago(4, 14) },
  { client: "priya", property: "constantia", status: "suggested", notes: "Study and garden tick every box. Propose Saturday 10:00.", created_at: ago(8, 10) },
  { client: "lerato", property: "woodstock", status: "interested", notes: "Yield works. She wants the levy schedule and rental agreement.", created_at: ago(10, 10) },
  { client: "lerato", property: "obs", status: "not_interested", notes: "House, not apartment; too much maintenance for a buy-to-let.", created_at: ago(12, 10) },
  { client: "botha", property: "constantia", status: "viewing_scheduled", viewing_at: inDays(2, 10), notes: "Second viewing with Sarah. Bring the plans for the kitchen extension.", created_at: ago(4, 10) },
  { client: "ahmed", property: "seapoint", status: "viewed", notes: "Viewed twice. Comparing with a unit at another agency at R3.05m.", created_at: ago(7, 10) },
  { client: "nomvula", property: "pinelands", status: "offer_made", notes: "Offer R3,150,000, 72-hour bond clause, occupation 1st of next month.", created_at: ago(14, 10) },
  { client: "chloe", property: "cottage", status: "viewing_scheduled", viewing_at: inDays(3, 17), notes: "Thursday 17:00. Owner will be home.", created_at: ago(2, 9) },
  { client: "sipho", property: "durbanville", status: "purchased", notes: "R3,600,000. Bond approved. In transfer.", created_at: ago(40, 10) },
  { client: "elena", property: "penthouse", status: "purchased", notes: "Registered two months ago.", created_at: ago(120, 10) },
  { client: "pieter", property: "plot", status: "interested", notes: "Pieter is the seller of this listing.", created_at: ago(40, 10) },
  { client: "grace", property: "cottage", status: "interested", notes: "Grace is the landlord of this cottage.", created_at: ago(24, 10) },
];

const clientByKey = Object.fromEntries(clients.map((c) => [c.key, c]));

/**
 * Conversations. Each entry becomes one message row. Email threads share a
 * thread key; WhatsApp is keyed on the phone number.
 */
const messages = [];
let counter = 0;
function email({ client, from, to, name, thread, subject, body, at, unread = false, autoReply = false }) {
  counter += 1;
  const inbound = from !== "agent";
  const c = client ? clientByKey[client] : null;
  const contactAddress = inbound ? from : to;
  const contactName = name ?? (c ? `${c.first_name} ${c.last_name}` : null);
  const key = `email-${counter}`;
  messages.push({
    key,
    id: id("messages", key),
    channel: "email",
    direction: inbound ? "inbound" : "outbound",
    client_id: c ? id("clients", c.key) : null,
    contact_name: contactName,
    contact_address: contactAddress,
    external_id: `demo-${key}`,
    thread_id: `demo-thread-${thread}`,
    subject,
    snippet: body.trim().replace(/\s+/g, " ").slice(0, 140),
    body_text: body.trim(),
    body_html: paragraphs(body),
    from_address: inbound ? from : AGENT.email,
    to_addresses: [inbound ? { name: AGENT.name, address: AGENT.email } : { name: contactName, address: to }],
    message_id_header: `<${key}@demo.foyer>`,
    status: inbound ? "received" : "sent",
    is_auto_reply: autoReply,
    read_at: inbound && !unread ? new Date(at.getTime() + 20 * 60 * 1000) : null,
    sent_at: at,
    created_at: at,
  });
  return key;
}
function whatsapp({ client, from, phone, name, body, at, unread = false, mediaType = null, autoReply = false }) {
  counter += 1;
  const inbound = from !== "agent";
  const c = client ? clientByKey[client] : null;
  const key = `wa-${counter}`;
  messages.push({
    key,
    id: id("messages", key),
    channel: "whatsapp",
    direction: inbound ? "inbound" : "outbound",
    client_id: c ? id("clients", c.key) : null,
    contact_name: name ?? (c ? `${c.first_name} ${c.last_name}` : null),
    contact_address: phone,
    external_id: `demo-${key}`,
    thread_id: null,
    subject: null,
    snippet: body.trim().slice(0, 140),
    body_text: body.trim(),
    body_html: null,
    from_address: null,
    to_addresses: null,
    media_type: mediaType,
    status: inbound ? "received" : "sent",
    is_auto_reply: autoReply,
    read_at: inbound && !unread ? new Date(at.getTime() + 10 * 60 * 1000) : null,
    sent_at: at,
    created_at: at,
  });
  return key;
}

// --- Thandi: brand new website enquiry, unread, auto-acknowledged ----------
const thandiEnquiry = email({
  client: "thandi",
  from: "thandi.mokoena@example.com",
  thread: "thandi-1",
  subject: "Enquiry: two-bedroom apartments in Sea Point",
  at: hoursAgo(3),
  unread: true,
  body: `Hi Sam

I found Harbourview on Google while looking for two-bedroom apartments in Sea Point or Green Point. My budget is up to about R3.2 million and I have pre-approval from FNB.

I'd love something with a sea view and secure parking. I'm renting at the moment and my lease ends in December, so I'm hoping to move before then.

Could you send me anything that might suit, and let me know when we could view?

Thanks
Thandi`,
});
const thandiAutoReply = email({
  client: "thandi",
  from: "agent",
  to: "thandi.mokoena@example.com",
  thread: "thandi-1",
  subject: "Re: Enquiry: two-bedroom apartments in Sea Point",
  at: hoursAgo(2.98),
  autoReply: true,
  body: `Hi Thandi

Thank you for getting in touch with Harbourview Properties. I've received your message and will come back to you personally within one business day.

If it's urgent you can reach me on +27 82 555 0100.

Kind regards
Sam Naidoo
Harbourview Properties`,
});

// --- James: WhatsApp back and forth, latest unread ------------------------
whatsapp({ client: "james", from: "+27825550102", phone: "+27825550102", at: ago(4, 14, 5), body: "Hi Sam, I saw the Pinelands townhouse (HV-2040) on Property24. Is it still available? We're moving down from Joburg in November." });
whatsapp({ client: "james", from: "agent", phone: "+27825550102", at: ago(4, 14, 30), body: "Hi James, thanks for reaching out! It is technically still available but there's an offer on the table right now. I'll know by Friday. Would you like me to keep you posted, and send a couple of similar options in the meantime?" });
whatsapp({ client: "james", from: "+27825550102", phone: "+27825550102", at: ago(4, 15, 2), body: "Yes please. Pet friendly is a must, we have a lab. Anything in Rondebosch or Claremont too." });
whatsapp({ client: "james", from: "agent", phone: "+27825550102", at: ago(3, 11), body: "Noted, a Labrador changes the garden requirement! I'll send three options this afternoon. When are you next in Cape Town for viewings?" });
whatsapp({ client: "james", from: "+27825550102", phone: "+27825550102", at: hoursAgo(1), unread: true, body: "Sorry for the slow reply. I'm flying down the weekend after next, Friday to Monday. Could we line up viewings for the Saturday?" });

// --- Priya: email thread, qualified, follow-up overdue --------------------
email({
  client: "priya",
  from: "priya.reddy@example.com",
  thread: "priya-1",
  subject: "Introduction from Elena Rossi",
  at: ago(12, 10),
  body: `Hi Sam

Elena Rossi gave me your details. She couldn't stop talking about how smooth her penthouse purchase was.

We're looking for a family home in the Constantia or Newlands area, four bedrooms, and my husband Dev needs a proper study because he works from home. We have two dogs so a decent garden matters. Budget is R4 to R5.2 million and our bond is pre-approved.

Saturdays are best for viewings.

Regards
Priya Reddy`,
});
email({
  client: "priya",
  from: "agent",
  to: "priya.reddy@example.com",
  thread: "priya-1",
  subject: "Re: Introduction from Elena Rossi",
  at: ago(11, 9),
  body: `Hi Priya

Lovely to hear from you, and thank you to Elena for the introduction.

Your brief is very clear and I have one listing in Constantia that I think you'll like: a four-bedroom home with a separate study, established garden and a pool on Silverhurst Avenue (ref HV-2038). I've attached the brochure.

Would Saturday at 10:00 suit you and Dev for a viewing?

Kind regards
Sam Naidoo
Harbourview Properties
+27 82 555 0100`,
});
email({
  client: "priya",
  from: "p.reddy@work-example.com",
  thread: "priya-1",
  subject: "Re: Introduction from Elena Rossi",
  at: ago(6, 15),
  body: `Hi Sam

Apologies, I'm replying from my work address. Saturday works for us. Could we also see anything you have in Newlands on the same morning?

Priya`,
});
email({
  client: "priya",
  from: "agent",
  to: "priya.reddy@example.com",
  thread: "priya-1",
  subject: "Re: Introduction from Elena Rossi",
  at: ago(6, 16),
  body: `Hi Priya

Perfect, Saturday 10:00 at Silverhurst Avenue it is. I'll line up one more in Newlands for 11:30 and confirm the address on Friday.

Kind regards
Sam`,
});

// --- Lerato: investor on WhatsApp ---------------------------------------
whatsapp({ client: "lerato", from: "+27825550104", phone: "+27825550104", at: ago(10, 9), body: "Morning Sam. Saw your post about the Woodstock loft. What's the levy and current rental?" });
whatsapp({ client: "lerato", from: "agent", phone: "+27825550104", at: ago(10, 9, 20), body: "Morning Lerato! Levy R1,650, rates about R780. Tenanted at R11,500 pm, lease ends March. At asking (R1,450,000) that's roughly 9.5% gross. I'll send the levy schedule and the lease now." });
whatsapp({ client: "lerato", from: "agent", phone: "+27825550104", at: ago(10, 9, 25), mediaType: "document", body: "Foundry_Unit_12_levy_schedule.pdf" });
whatsapp({ client: "lerato", from: "+27825550104", phone: "+27825550104", at: ago(2, 9), body: "Thanks. Numbers work. Is there any special levy planned for the building? And can I view on a weekday evening?" });
whatsapp({ client: "lerato", from: "agent", phone: "+27825550104", at: ago(2, 10), body: "No special levy in the last AGM minutes, I'll forward them. Tuesday or Wednesday at 17:30 both work for the tenant. Which do you prefer?" });

// --- Botha: viewing confirmation email --------------------------------------
email({
  client: "botha",
  from: "agent",
  to: "michael.botha@example.com",
  thread: "botha-1",
  subject: "Second viewing: Silverhurst Avenue, Constantia",
  at: ago(4, 10),
  body: `Hi Michael and Sarah

Thanks for coming to the show house on Sunday. As discussed, I've booked a second, private viewing of 8 Silverhurst Avenue for Saturday at 10:00 so Sarah can spend proper time in the kitchen.

I'll bring the approved plans for the kitchen extension and the pool compliance certificate.

Kind regards
Sam Naidoo
Harbourview Properties
+27 82 555 0100`,
});
email({
  client: "botha",
  from: "michael.botha@example.com",
  thread: "botha-1",
  subject: "Re: Second viewing: Silverhurst Avenue, Constantia",
  at: ago(1, 16),
  body: `Hi Sam

Saturday 10:00 confirmed, thanks. Sarah asked whether the sellers would consider leaving the built-in appliances. Also, what are the rates on the property?

Michael`,
});
email({
  client: "botha",
  from: "agent",
  to: "michael.botha@example.com",
  thread: "botha-1",
  subject: "Re: Second viewing: Silverhurst Avenue, Constantia",
  at: ago(1, 17),
  body: `Hi Michael

I'll ask the sellers about the appliances before Saturday; they've been flexible so far. Rates are R2,340 per month.

See you both on Saturday.

Sam`,
});

// --- Ahmed: repeat client, both channels ---------------------------------
email({
  client: "ahmed",
  from: "agent",
  to: "ahmed.patel@example.com",
  thread: "ahmed-1",
  subject: "Sea Point apartment: figures you asked for",
  at: ago(7, 12),
  body: `Hi Ahmed

Great to see you again yesterday. As promised, the figures for 12 Beach Road (HV-2041):

Asking price R2,950,000
Levies R2,850 per month
Rates R1,120 per month
Transfer duty approximately R146,000

The body corporate allows short-term letting, so the apartment can earn when you're not in Cape Town.

Kind regards
Sam`,
});
whatsapp({ client: "ahmed", from: "+27825550107", phone: "+27825550107", at: ago(1, 11), body: "Sam, quick one. The other agency's unit on the promenade is R3.05m but has two parking bays. Would the Beach Road seller consider R2.85m?" });
whatsapp({ client: "ahmed", from: "agent", phone: "+27825550107", at: ago(1, 12), body: "Let me put it to them properly. If you're serious I'd rather present a written offer at R2.85m than a verbal one. Want me to draft the offer to purchase so you can review it tonight?" });

// --- Nomvula: offer submitted -------------------------------------------------
email({
  client: "nomvula",
  from: "agent",
  to: "nomvula.k@example.com",
  thread: "nomvula-1",
  subject: "Your offer on Unit 14, Oakridge Estate has been submitted",
  at: ago(1, 15),
  body: `Hi Nomvula

Your signed offer to purchase for R3,150,000 on Unit 14, Oakridge Estate has been presented to the seller this afternoon. The offer is subject to bond approval within 72 hours, with occupation on the 1st of next month.

The seller has until Friday close of business to respond. I'll call you the moment I hear anything.

Kind regards
Sam Naidoo
Harbourview Properties`,
});
email({
  client: "nomvula",
  from: "nomvula.k@example.com",
  thread: "nomvula-1",
  subject: "Re: Your offer on Unit 14, Oakridge Estate has been submitted",
  at: ago(0, 8),
  body: `Thank you Sam! Fingers crossed. The bank called this morning and said the bond assessment is already in progress.

Nomvula`,
});

// --- Pieter: seller negotiating ---------------------------------------------
email({
  client: "pieter",
  from: "pieter.steyn@example.com",
  thread: "pieter-1",
  subject: "Counter offer on the Helderberg plot",
  at: ago(2, 13),
  body: `Sam

I've thought about the R980,000 offer. I'm not going that low. Counter at R1,060,000, unconditional, 30 days to transfer. If they can't do that I'd rather wait for the summer market.

Pieter`,
});
email({
  client: "pieter",
  from: "agent",
  to: "pieter.steyn@example.com",
  thread: "pieter-1",
  subject: "Re: Counter offer on the Helderberg plot",
  at: ago(2, 14),
  body: `Hi Pieter

Understood. I've sent the counter of R1,060,000 to the buyer's agent with your terms. They've asked for until Thursday to respond. I'll update you as soon as I hear.

Kind regards
Sam`,
});

// --- Chloe: tenant on WhatsApp ----------------------------------------------
whatsapp({ client: "chloe", from: "+27825550110", phone: "+27825550110", at: ago(2, 9), body: "Hi Sam! Chloe here about the Rondebosch garden cottage. I've emailed my employment letter and bank statements. Does Thursday evening work for a viewing?" });
whatsapp({ client: "chloe", from: "agent", phone: "+27825550110", at: ago(2, 9, 30), body: "Hi Chloe, received, thank you! Thursday 17:00 works, the owner will be home. The cottage is fine with one cat. See you there." });
whatsapp({ client: "chloe", from: "+27825550110", phone: "+27825550110", at: ago(1, 9), body: "Perfect, thank you! Is the deposit one month?" });
whatsapp({ client: "chloe", from: "agent", phone: "+27825550110", at: ago(1, 10), body: "Yes, one month's rent as deposit, held in the agency trust account. I'll bring the lease on Thursday." });

// --- Sipho: closing ---------------------------------------------------------
email({
  client: "sipho",
  from: "agent",
  to: "sipho.ndlovu@example.com",
  thread: "sipho-1",
  subject: "Bond approved: 17 Protea Street, Durbanville",
  at: ago(8, 10),
  body: `Hi Sipho

Wonderful news: Standard Bank has approved your bond in full. The offer is now unconditional.

Next steps:
1. The transfer attorneys, Van Wyk & Partners, will contact you this week to sign the transfer documents.
2. You'll receive a statement for transfer costs and the deposit.
3. Registration typically takes six to eight weeks from here.

Congratulations to you and the family.

Kind regards
Sam Naidoo
Harbourview Properties`,
});
email({
  client: "sipho",
  from: "sipho.ndlovu@example.com",
  thread: "sipho-1",
  subject: "Re: Bond approved: 17 Protea Street, Durbanville",
  at: ago(3, 9),
  body: `Sam, we signed at the attorneys yesterday. Thank you for everything so far. Do you know roughly when we'll get the keys?

Sipho`,
});

// --- Elena: completed, old ----------------------------------------------------
email({
  client: "elena",
  from: "elena.rossi@example.com",
  thread: "elena-1",
  subject: "We're in!",
  at: ago(30, 9),
  body: `Sam, we finally moved in on the weekend. The sunsets from the terrace are unreal. Thank you again for holding everything together during the transfer.

By the way, my friend Priya is looking for a house in Constantia, I've given her your number.

Elena`,
});

// --- Grace: gone quiet -----------------------------------------------------------
email({
  client: "grace",
  from: "agent",
  to: "grace.mbeki@example.com",
  thread: "grace-1",
  subject: "Managing your Rondebosch cottage",
  at: ago(19, 10),
  body: `Hi Grace

Thank you for the call this morning. As discussed, Harbourview can manage the cottage for 8% of the monthly rental, which covers tenant vetting, lease drafting, monthly statements and maintenance coordination.

I'll send our standard lease template and mandate for you to look over.

Kind regards
Sam`,
});

// --- Unknown senders: demonstrate "Not a client" and link/create flows ---------
email({
  client: null,
  from: "hello@foyer.demo",
  name: "The Foyer Team",
  thread: "foyer-guide",
  subject: "Welcome to your Foyer demo: a tour of everything in here",
  at: ago(0, 7),
  unread: true,
  body: `Hi Sam

This is a demo of Foyer, a CRM for a single real estate agent that lives on top of your Gmail and WhatsApp Business accounts. Everything in this demo is fake, but it's arranged to show off each part of the app. Here is a guided tour.

DASHBOARD
The home page opens with today's priorities: clients with unread messages, follow-ups due, recent activity, a pipeline summary and clients who have gone quiet. Thandi Mokoena and James van der Merwe have unread messages, Priya Reddy's follow-up is overdue, and Grace Mbeki has gone quiet.

CLIENTS
Every person you deal with is a client record: buyers, sellers, investors, tenants and landlords. Each has a pipeline stage, budget, preferred areas, requirements and private notes. Open Priya Reddy to see a fully filled-in profile with two email addresses, linked properties and a timeline. Kevin Brown is archived, so he's hidden unless you tick "include archived".

PIPELINE
A kanban board of your clients by stage, from Prospect through Viewing and Offer to Closing and Completed. Drag a card to move a client to the next stage; every move is logged on their timeline. Right now Nomvula Khumalo is at Offer Submitted, Pieter Steyn (a seller) is in Negotiation and Sipho Ndlovu is Closing.

PROPERTIES
Your listings, with price, specs, status and a private notes field. Link any property to any client and track where they are with it: suggested, interested, viewing scheduled, viewed, offer made, purchased or not interested. Open the Constantia family home to see two different buyers linked to the same listing.

INBOX
Every email and WhatsApp conversation in one place, grouped per contact. Filters: unread only, per channel, and "Clients only" to hide people who aren't in your CRM yet. This message is from an unknown sender, which is why it shows "Not a client": use the box above the conversation to link it to an existing client or create a new one in a click. Reply by email or WhatsApp from the same screen, insert a saved template, or (with an Anthropic API key configured) press "Draft with AI" to have a reply written from the client's record and the thread.

TIMELINE
Open any client to see their full history in one stream: emails, WhatsApp messages, calls, meetings, viewings, notes, stage changes and property links. Log a call or a note at the top of the page, and set the next follow-up date so the client appears on your dashboard when it's due.

TEMPLATES AND AUTO-REPLIES
Under Settings you'll find saved message templates with placeholders such as {{first_name}} and {{agent_name}}, and auto-reply rules that use them: reply to every first-time enquiry, reply after hours, or reply when a message contains certain keywords. Thandi's enquiry above was answered automatically by the "New enquiry acknowledgement" rule the moment it arrived; the reply is marked "auto-reply" in her timeline.

NOTIFICATIONS
The bell in the sidebar shows new messages as they arrive. Sync runs on a schedule, on demand with the Sync button, or instantly when Gmail push notifications are set up.

SETTINGS
Your name, agency, phone and signature; time zone, currency and business hours; Gmail and WhatsApp connections; and whether unknown senders should be tracked.

Enjoy the tour.
The Foyer Team`,
});
email({
  client: null,
  from: "alerts@propertyportal-example.com",
  name: "Property Portal Alerts",
  thread: "portal-alert",
  subject: "3 new listings match your saved search: Sea Point, 2 bed",
  at: ago(0, 6),
  body: `New listings matching "Sea Point, 2 bedrooms, R2.5m - R3.5m":

1. 2 bed apartment, Beach Road, R2,950,000
2. 2 bed apartment, Main Road, R2,700,000
3. 2 bed apartment, Regent Road, R3,400,000

Manage your alerts at propertyportal-example.com. This is an automated message; unknown senders like this one can be hidden with the "Clients only" filter or by turning off "track unknown senders" in Settings.`,
});
whatsapp({
  client: null,
  from: "+27825550199",
  phone: "+27825550199",
  name: "Zanele",
  at: hoursAgo(5),
  unread: true,
  body: "Hi, is the Woodstock loft (HV-2045) still for sale? I'd like to view this week if possible. Zanele",
});

/** Activities for the timeline and the dashboard's recent activity panel. */
const activities = [
  { client: "thandi", type: "client_created", title: "Client created", body: "Created from the website enquiry.", created_at: ago(1, 9) },
  { client: "thandi", type: "property_linked", title: "Property linked", body: "Sunlit two-bedroom with sea views (suggested)", metadata: { propertyId: id("properties", "seapoint"), status: "suggested" }, created_at: ago(1, 9, 5) },
  { client: "thandi", type: "follow_up_set", title: "Follow-up scheduled", metadata: { at: ago(0, 8).toISOString() }, created_at: ago(1, 9, 6) },
  { client: "james", type: "client_created", title: "Client created", created_at: ago(4, 14) },
  { client: "james", type: "stage_changed", title: "Stage changed", body: "Prospect to Contacted", metadata: { from: "prospect", to: "contacted" }, created_at: ago(3, 11) },
  { client: "priya", type: "client_created", title: "Client created", body: "Referred by Elena Rossi.", created_at: ago(12, 10) },
  { client: "priya", type: "call", title: "Call logged", body: "Qualification call with Priya and Dev. Budget confirmed at R4m to R5.2m, bond pre-approved with Nedbank. Study is non-negotiable. Two dogs.", created_at: ago(9, 10) },
  { client: "priya", type: "stage_changed", title: "Stage changed", body: "Contacted to Qualified", metadata: { from: "contacted", to: "qualified" }, created_at: ago(9, 10, 30) },
  { client: "priya", type: "property_linked", title: "Property linked", body: "Family home on the slopes of Constantia (suggested)", metadata: { propertyId: id("properties", "constantia"), status: "suggested" }, created_at: ago(8, 10) },
  { client: "lerato", type: "note", title: "Note", body: "Owns two units in Salt River already. Wants the AGM minutes before any offer. Very numbers driven.", created_at: ago(10, 10) },
  { client: "lerato", type: "property_status", title: "Property status updated", body: "Renovated Victorian in Observatory: suggested to not interested", metadata: { propertyId: id("properties", "obs"), from: "suggested", to: "not_interested" }, created_at: ago(9, 10) },
  { client: "botha", type: "meeting", title: "Meeting logged", body: "Met at the Constantia show house. Sarah loved the garden, wants a bigger kitchen. Michael is focused on security.", created_at: ago(9, 15) },
  { client: "botha", type: "viewing", title: "Viewing logged", body: "First viewing of 8 Silverhurst Avenue. Very positive. Asked about the kitchen extension plans.", created_at: ago(4, 11) },
  { client: "botha", type: "stage_changed", title: "Stage changed", body: "Qualified to Viewing", metadata: { from: "qualified", to: "viewing" }, created_at: ago(4, 11, 30) },
  { client: "ahmed", type: "viewing", title: "Viewing logged", body: "Second viewing of 12 Beach Road with his wife. Comparing with a promenade unit from another agency.", created_at: ago(2, 11) },
  { client: "ahmed", type: "stage_changed", title: "Stage changed", body: "Viewing to Interested", metadata: { from: "viewing", to: "interested" }, created_at: ago(2, 12) },
  { client: "nomvula", type: "note", title: "Note", body: "Offer to purchase signed at the office. R3,150,000, 72-hour bond clause, occupation on the 1st.", created_at: ago(1, 14) },
  { client: "nomvula", type: "stage_changed", title: "Stage changed", body: "Interested to Offer Submitted", metadata: { from: "interested", to: "offer_submitted" }, created_at: ago(1, 15) },
  { client: "nomvula", type: "property_status", title: "Property status updated", body: "Modern townhouse in a secure Pinelands estate: viewed to offer made", metadata: { propertyId: id("properties", "pinelands"), from: "viewed", to: "offer_made" }, created_at: ago(1, 15, 5) },
  { client: "pieter", type: "call", title: "Call logged", body: "Pieter rejects R980,000. Counter at R1,060,000, unconditional, 30-day transfer.", created_at: ago(2, 14) },
  { client: "chloe", type: "note", title: "Note", body: "Employment letter and 3 months of bank statements received and checked. Affordability fine.", created_at: ago(2, 10) },
  { client: "sipho", type: "note", title: "Note", body: "Bond approved by Standard Bank. Transfer attorneys Van Wyk & Partners instructed.", created_at: ago(8, 10) },
  { client: "sipho", type: "stage_changed", title: "Stage changed", body: "Offer Accepted to Closing", metadata: { from: "offer_accepted", to: "closing" }, created_at: ago(8, 10, 30) },
  { client: "elena", type: "stage_changed", title: "Stage changed", body: "Closing to Completed", metadata: { from: "closing", to: "completed" }, created_at: ago(60, 10) },
  { client: "elena", type: "note", title: "Note", body: "Registered. Send a housewarming gift and ask for a Google review.", created_at: ago(60, 10, 30) },
  { client: "daniel", type: "stage_changed", title: "Stage changed", body: "Property Search to Lost", metadata: { from: "property_search", to: "lost" }, created_at: ago(35, 10) },
  { client: "daniel", type: "note", title: "Note", body: "Bought privately through a friend. Keep on the mailing list for investment stock next year.", created_at: ago(35, 10, 5) },
  { client: "grace", type: "call", title: "Call logged", body: "Intro call about managing the Rondebosch cottage. Quoted 8%. To send lease template and mandate.", created_at: ago(19, 10) },
];

const templates = [
  {
    key: "ack",
    name: "New enquiry acknowledgement",
    channel: "email",
    subject: "Re: {{subject}}",
    body: `Hi {{first_name}}

Thank you for getting in touch with {{agency_name}}. I've received your message and will come back to you personally within one business day.

If it's urgent you can reach me on {{agent_phone}}.

Kind regards
{{agent_name}}
{{agency_name}}`,
  },
  {
    key: "afterhours",
    name: "After-hours reply",
    channel: "any",
    subject: null,
    body: `Hi {{first_name}}, thanks for your message. Our office is closed right now but I'll reply first thing in the morning. For anything urgent call {{agent_phone}}. {{agent_name}}, {{agency_name}}`,
  },
  {
    key: "viewing",
    name: "Viewing confirmation",
    channel: "email",
    subject: "Viewing confirmed",
    body: `Hi {{first_name}}

This is to confirm your viewing on [day] at [time] at [address].

Please bring along your ID. If anything changes, reply to this email or WhatsApp me on {{agent_phone}}.

Looking forward to seeing you.

Kind regards
{{agent_name}}
{{agency_name}}`,
  },
  {
    key: "wa-viewing",
    name: "WhatsApp: book a viewing",
    channel: "whatsapp",
    subject: null,
    body: `Hi {{first_name}}, happy to arrange a viewing. Which days and times suit you this week? {{agent_name}}, {{agency_name}}`,
  },
  {
    key: "away",
    name: "Away from the office",
    channel: "any",
    subject: null,
    body: `Hi {{first_name}}

Thanks for your message. I'm away from the office until [return date] with limited access to email. I'll reply as soon as I'm back.

For anything urgent, my colleague at {{agency_name}} can be reached on {{agent_phone}}.

Kind regards
{{agent_name}}`,
  },
  {
    key: "offer",
    name: "Offer update",
    channel: "email",
    subject: "Update on your offer",
    body: `Hi {{first_name}}

A quick update on your offer: [update].

I'll keep you posted on every development. Call me on {{agent_phone}} if you have questions in the meantime.

Kind regards
{{agent_name}}
{{agency_name}}`,
  },
];

const rules = [
  {
    key: "new-contact",
    name: "Acknowledge new email enquiries",
    channel: "email",
    enabled: true,
    trigger_type: "new_contact",
    keywords: [],
    apply_to: "unknown",
    stages: [],
    cooldown_hours: 24,
    once_per_thread: true,
    template: "ack",
    position: 0,
    times_triggered: 14,
    last_triggered_at: hoursAgo(2.98),
  },
  {
    key: "after-hours",
    name: "After-hours reply on WhatsApp",
    channel: "whatsapp",
    enabled: true,
    trigger_type: "outside_hours",
    keywords: [],
    apply_to: "all",
    stages: [],
    cooldown_hours: 12,
    once_per_thread: false,
    template: "afterhours",
    position: 1,
    times_triggered: 31,
    last_triggered_at: ago(1, 21),
  },
  {
    key: "away",
    name: "Holiday reply (email)",
    channel: "email",
    enabled: true,
    trigger_type: "away",
    keywords: [],
    apply_to: "all",
    stages: [],
    cooldown_hours: 72,
    once_per_thread: true,
    template: "away",
    position: 2,
    times_triggered: 0,
    last_triggered_at: null,
    away_from: inDays(11, 17),
    away_until: inDays(19, 8),
  },
  {
    key: "weekend",
    name: "Weekend reply (WhatsApp)",
    channel: "whatsapp",
    enabled: true,
    trigger_type: "weekly",
    keywords: [],
    apply_to: "all",
    stages: [],
    cooldown_hours: 48,
    once_per_thread: false,
    template: "afterhours",
    position: 3,
    times_triggered: 6,
    last_triggered_at: ago(2, 19),
    weekly: { fromDay: 5, fromTime: "17:30", untilDay: 1, untilTime: "08:00" },
  },
  {
    key: "keyword",
    name: "Viewing requests from clients (WhatsApp)",
    channel: "whatsapp",
    enabled: false,
    trigger_type: "keyword",
    keywords: ["viewing", "view", "see the place"],
    apply_to: "clients",
    stages: ["contacted", "qualified", "property_search"],
    cooldown_hours: 48,
    once_per_thread: true,
    template: "wa-viewing",
    position: 4,
    times_triggered: 3,
    last_triggered_at: ago(12, 10),
  },
];

/** Workflows: trigger + conditions + actions. Keys match src/lib/workflows/types.ts. */
const workflowsData = [
  {
    key: "new-listing",
    name: "New listing: introduce to matching clients",
    description: "Links new listings to clients who fit and drafts an intro for each.",
    enabled: true,
    trigger: "property.created",
    match_mode: "all",
    conditions: [{ field: "property.status", op: "eq", value: "available" }],
    actions: [
      { type: "link_property", config: { target: "matching_clients", status: "suggested", max_clients: "10" } },
      { type: "ai_draft", config: { target: "matching_clients", channel: "preferred", max_clients: "10", instruction: "" } },
      { type: "notify", config: { title: "{{matches.count}} clients matched {{property.title}}", body: "Drafts are waiting on the Drafts page." } },
    ],
    position: 0,
    times_triggered: 4,
    last_triggered_at: hoursAgo(20),
  },
  {
    key: "new-enquiry",
    name: "New enquiry: follow up tomorrow",
    description: null,
    enabled: true,
    trigger: "message.received",
    match_mode: "all",
    conditions: [
      { field: "message.is_new_contact", op: "eq", value: "true" },
      { field: "message.is_automated", op: "eq", value: "false" },
    ],
    actions: [
      { type: "notify", config: { title: "New enquiry from {{contact.name}}", body: "{{message.snippet}}" } },
      { type: "set_follow_up", config: { days: "1", time: "09:00", only_if_empty: "true" } },
    ],
    position: 1,
    times_triggered: 9,
    last_triggered_at: hoursAgo(3),
  },
  {
    key: "gone-quiet",
    name: "Gone quiet: 14-day nudge",
    description: null,
    enabled: true,
    trigger: "client.inactive",
    match_mode: "all",
    conditions: [{ field: "client.days_since_contact", op: "gte", value: "14" }],
    actions: [
      { type: "notify", config: { title: "{{client.full_name}} has gone quiet", body: "No contact for {{client.days_since_contact}} days while in {{client.stage_label}}." } },
      { type: "log_activity", config: { activity_type: "note", body: "Flagged by workflow: no contact for {{client.days_since_contact}} days." } },
    ],
    position: 2,
    times_triggered: 2,
    last_triggered_at: ago(5, 8),
  },
  {
    key: "sold",
    name: "Sold: update interested clients",
    description: null,
    enabled: true,
    trigger: "property.status_changed",
    match_mode: "any",
    conditions: [
      { field: "property.status", op: "eq", value: "sold" },
      { field: "property.status", op: "eq", value: "rented" },
    ],
    actions: [{ type: "ai_draft", config: { target: "linked_clients", channel: "preferred", instruction: "" } }],
    position: 3,
    times_triggered: 1,
    last_triggered_at: ago(60, 11),
  },
  {
    key: "offer-accepted",
    name: "Offer accepted: bond follow-up",
    description: null,
    enabled: false,
    trigger: "client.stage_changed",
    match_mode: "all",
    conditions: [{ field: "client.stage", op: "eq", value: "offer_accepted" }],
    actions: [
      { type: "log_activity", config: { activity_type: "note", body: "Offer accepted. Check bond application progress and confirm the attorneys have been instructed." } },
      { type: "set_follow_up", config: { days: "3", time: "09:00" } },
    ],
    position: 4,
    times_triggered: 0,
    last_triggered_at: null,
  },
];

const workflowRuns = [
  {
    workflow: "new-listing",
    trigger: "property.created",
    status: "completed",
    subject: "Loft apartment in a converted warehouse",
    steps: [
      { action: "link_property", status: "done", detail: "Linked to Lerato Dlamini, Thandi Mokoena, Ahmed Patel" },
      { action: "ai_draft", status: "done", detail: "Drafted for Lerato Dlamini, Thandi Mokoena, Ahmed Patel" },
      { action: "notify", status: "done", detail: "3 clients matched Loft apartment in a converted warehouse" },
    ],
    created_at: hoursAgo(20),
  },
  {
    workflow: "new-enquiry",
    trigger: "message.received",
    status: "completed",
    subject: "Email from Thandi Mokoena: Enquiry: two-bedroom apartments in Sea Point",
    steps: [
      { action: "notify", status: "done", detail: "New enquiry from Thandi Mokoena" },
      { action: "set_follow_up", status: "done", detail: "Follow-up set for tomorrow 09:00" },
    ],
    created_at: hoursAgo(3),
  },
  {
    workflow: "new-enquiry",
    trigger: "message.received",
    status: "completed",
    subject: "WhatsApp from Zanele",
    steps: [
      { action: "notify", status: "done", detail: "New enquiry from Zanele" },
      { action: "set_follow_up", status: "skipped", detail: "No client in this event" },
    ],
    created_at: hoursAgo(5),
  },
  {
    workflow: "gone-quiet",
    trigger: "client.inactive",
    status: "completed",
    subject: "Grace Mbeki",
    dedupe_key: "inactive:demo-grace",
    steps: [
      { action: "notify", status: "done", detail: "Grace Mbeki has gone quiet" },
      { action: "log_activity", status: "done", detail: "Flagged by workflow: no contact for 19 days." },
    ],
    created_at: ago(5, 8),
  },
];

/** AI drafts waiting on the Drafts page, as produced by the "new listing" workflow for the Woodstock loft. */
const drafts = [
  {
    client: "lerato",
    property: "woodstock",
    workflow: "new-listing",
    channel: "whatsapp",
    contact_address: "+27825550104",
    contact_name: "Lerato Dlamini",
    subject: null,
    body: "Hi Lerato, a listing just came in that fits your brief: Loft apartment in a converted warehouse in Woodstock, Cape Town, R1,450,000 (1 bedroom, 1 bathroom, 1 parking). I thought of you because it is within budget and in a preferred area (woodstock). Would you like to view it this week? Sam",
    notes: "Check the viewing availability before sending. Demo mode: this draft is generated from a template.",
    reason: "within budget, in a preferred area (woodstock)",
    created_at: hoursAgo(20),
  },
  {
    client: "thandi",
    property: "woodstock",
    workflow: "new-listing",
    channel: "email",
    contact_address: "thandi.mokoena@example.com",
    contact_name: "Thandi Mokoena",
    subject: "New listing: Loft apartment in a converted warehouse",
    body: `Hi Thandi

A property has just come onto our books that I think fits what you're looking for: Loft apartment in a converted warehouse (ref HV-2045).

Location: Woodstock, Cape Town
Price: R1,450,000
Layout: 1 bedroom, 1 bathroom, 1 parking
Features: Double volume, mezzanine, secure parking, tenanted, fibre

I thought of you because it is well within budget. It is smaller than the two-bedroom you asked for, so treat this as an option rather than a match. Would you like to see it? I can arrange a viewing this week; let me know which days suit you.

Warm regards
Sam`,
    notes: "Below her budget and one bedroom short of her brief; decide whether it is worth sending. Demo mode: this draft is generated from a template.",
    reason: "below their usual range",
    created_at: hoursAgo(20),
  },
  {
    client: "ahmed",
    property: "woodstock",
    workflow: "new-listing",
    channel: "email",
    contact_address: "ahmed.patel@example.com",
    contact_name: "Ahmed Patel",
    subject: "New listing: Loft apartment in a converted warehouse",
    body: `Hi Ahmed

A property has just come onto our books that may interest you as an investment alongside the Sea Point apartment: Loft apartment in a converted warehouse (ref HV-2045) in Woodstock.

Price: R1,450,000
Layout: 1 bedroom, 1 bathroom, 1 parking
It is tenanted at R11,500 per month, which works out to roughly 9.5% gross at asking.

Would you like the levy schedule and the lease? I can also arrange a weekday evening viewing.

Warm regards
Sam`,
    notes: "Demo mode: this draft is generated from a template.",
    reason: "within budget",
    created_at: hoursAgo(20),
  },
];

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log(`[seed] Migrating ${dbName}…`);
await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });

const client = await pool.connect();
try {
  await client.query("begin");
  console.log("[seed] Clearing existing data…");
  await client.query(
    "truncate message_drafts, workflow_runs, workflows, auto_reply_log, auto_reply_rules, message_templates, notifications, activities, client_properties, messages, properties, clients, settings, login_attempts, gmail_accounts restart identity cascade",
  );

  console.log("[seed] Settings…");
  await insert(client, "settings", {
    id: 1,
    agent_name: AGENT.name,
    agency_name: AGENT.agency,
    agent_phone: AGENT.phone,
    email_signature: `Kind regards\n${AGENT.name}\n${AGENT.agency}\n${AGENT.phone}\nsam@harbourview.demo`,
    timezone: "Africa/Johannesburg",
    default_country: "ZA",
    currency: "ZAR",
    business_hours: { days: [1, 2, 3, 4, 5, 6], start: "08:00", end: "17:30", overrides: { "5": { start: "08:00", end: "16:00" }, "6": { start: "09:00", end: "13:00" } } },
    email_auto_replies_enabled: true,
    whatsapp_auto_replies_enabled: true,
    track_unknown_senders: true,
    sync_sent_mail: true,
  });

  console.log(`[seed] ${clients.length} clients…`);
  for (const c of clients) {
    const { key, ...row } = c;
    await insert(client, "clients", { id: id("clients", key), updated_at: row.last_contact_at ?? row.created_at, ...row });
  }

  console.log(`[seed] ${properties.length} properties…`);
  for (const p of properties) {
    const { key, ...row } = p;
    await insert(client, "properties", { id: id("properties", key), created_at: ago(45, 10), updated_at: ago(3, 10), ...row });
  }

  console.log(`[seed] ${links.length} client-property links…`);
  for (const l of links) {
    const { client: c, property, ...row } = l;
    await insert(client, "client_properties", { client_id: id("clients", c), property_id: id("properties", property), updated_at: row.created_at, ...row });
  }

  console.log(`[seed] ${messages.length} messages…`);
  for (const m of messages) {
    const row = { ...m };
    delete row.key;
    await insert(client, "messages", row);
  }

  console.log(`[seed] ${activities.length} activities…`);
  for (const a of activities) {
    const { client: c, ...row } = a;
    await insert(client, "activities", { client_id: id("clients", c), ...row });
  }

  console.log(`[seed] ${templates.length} templates and ${rules.length} auto-reply rules…`);
  for (const t of templates) {
    const { key, ...row } = t;
    await insert(client, "message_templates", { id: id("templates", key), created_at: ago(50, 10), updated_at: ago(50, 10), ...row });
  }
  for (const r of rules) {
    const { key, template, ...row } = r;
    await insert(client, "auto_reply_rules", { id: id("rules", key), template_id: id("templates", template), created_at: ago(50, 10), updated_at: ago(20, 10), ...row });
  }
  console.log(`[seed] ${workflowsData.length} workflows, runs and drafts…`);
  for (const w of workflowsData) {
    const { key, ...row } = w;
    await insert(client, "workflows", { id: id("workflows", key), created_at: ago(30, 10), updated_at: ago(30, 10), ...row });
  }
  for (const r of workflowRuns) {
    const { workflow, ...row } = r;
    await insert(client, "workflow_runs", { workflow_id: id("workflows", workflow), ...row });
  }
  for (const d of drafts) {
    const { client: c, property, workflow, ...row } = d;
    await insert(client, "message_drafts", {
      client_id: c ? id("clients", c) : null,
      property_id: property ? id("properties", property) : null,
      workflow_id: id("workflows", workflow),
      status: "pending",
      updated_at: row.created_at,
      ...row,
    });
  }
  await insert(client, "notifications", {
    type: "workflow_drafts",
    client_id: null,
    message_id: null,
    title: "New listing: introduce to matching clients: 3 drafts ready to review",
    body: "Lerato Dlamini, Thandi Mokoena, Ahmed Patel. Open Drafts to edit and send.",
    read_at: null,
    created_at: hoursAgo(20),
  });

  await insert(client, "auto_reply_log", {
    rule_id: id("rules", "new-contact"),
    channel: "email",
    contact_address: "thandi.mokoena@example.com",
    thread_id: "demo-thread-thandi-1",
    inbound_message_id: id("messages", thandiEnquiry),
    sent_message_id: id("messages", thandiAutoReply),
    sent_at: hoursAgo(2.98),
  });

  console.log("[seed] Notifications…");
  const unreadInbound = messages.filter((m) => m.direction === "inbound" && m.read_at === null);
  for (const m of unreadInbound) {
    const name = m.contact_name ?? m.contact_address;
    await insert(client, "notifications", {
      type: m.channel === "email" ? "email_received" : "whatsapp_received",
      client_id: m.client_id,
      message_id: m.id,
      title: m.channel === "email" ? `New email from ${name}` : `New WhatsApp from ${name}`,
      body: m.channel === "email" ? m.subject : m.snippet,
      read_at: null,
      created_at: m.sent_at,
    });
  }
  // A couple of already-read notifications so the list has history.
  for (const m of messages.filter((x) => x.direction === "inbound" && x.read_at !== null).slice(-3)) {
    await insert(client, "notifications", {
      type: m.channel === "email" ? "email_received" : "whatsapp_received",
      client_id: m.client_id,
      message_id: m.id,
      title: `New ${m.channel === "email" ? "email" : "WhatsApp"} from ${m.contact_name ?? m.contact_address}`,
      body: m.channel === "email" ? m.subject : m.snippet,
      read_at: new Date(m.sent_at.getTime() + 30 * 60 * 1000),
      created_at: m.sent_at,
    });
  }

  await client.query("commit");
  console.log(`[seed] Done. ${clients.length} clients, ${properties.length} properties, ${messages.length} messages, ${unreadInbound.length} unread.`);
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error("[seed] Failed:", error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
