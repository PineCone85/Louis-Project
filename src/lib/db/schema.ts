import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

// ---------------------------------------------------------------------------
// Clients and pipeline
// ---------------------------------------------------------------------------

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull().default(""),
    email: text("email"),
    alternateEmail: text("alternate_email"),
    phone: text("phone"),
    alternatePhone: text("alternate_phone"),
    clientType: text("client_type").notNull().default("buyer"),
    stage: text("stage").notNull().default("prospect"),
    stageChangedAt: timestamp("stage_changed_at", { withTimezone: true }).notNull().defaultNow(),
    source: text("source"),
    budgetMin: bigint("budget_min", { mode: "number" }),
    budgetMax: bigint("budget_max", { mode: "number" }),
    preferredAreas: text("preferred_areas"),
    requirements: text("requirements"),
    notes: text("notes"),
    nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true }),
    lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
    lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("clients_email_idx").on(t.email),
    index("clients_alternate_email_idx").on(t.alternateEmail),
    index("clients_phone_idx").on(t.phone),
    index("clients_alternate_phone_idx").on(t.alternatePhone),
    index("clients_stage_idx").on(t.stage),
  ],
);

export const properties = pgTable(
  "properties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    reference: text("reference"),
    status: text("status").notNull().default("available"),
    propertyType: text("property_type").notNull().default("house"),
    listingType: text("listing_type").notNull().default("sale"),
    price: bigint("price", { mode: "number" }),
    address: text("address"),
    suburb: text("suburb"),
    city: text("city"),
    province: text("province"),
    postalCode: text("postal_code"),
    bedrooms: integer("bedrooms"),
    bathrooms: real("bathrooms"),
    parking: integer("parking"),
    floorSize: integer("floor_size"),
    erfSize: integer("erf_size"),
    description: text("description"),
    features: text("features"),
    listingUrl: text("listing_url"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("properties_status_idx").on(t.status)],
);

export const clientProperties = pgTable(
  "client_properties",
  {
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("suggested"),
    notes: text("notes"),
    viewingAt: timestamp("viewing_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.clientId, t.propertyId] })],
);

// ---------------------------------------------------------------------------
// Communication
// ---------------------------------------------------------------------------

export type EmailAddress = { name: string | null; address: string };
export type EmailAttachment = {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
};
export type WhatsAppMedia = {
  id: string;
  mimeType: string | null;
  filename: string | null;
  caption: string | null;
  sha256: string | null;
};

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channel: text("channel").notNull(),
    direction: text("direction").notNull(),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    contactName: text("contact_name"),
    contactAddress: text("contact_address").notNull(),
    externalId: text("external_id"),
    threadId: text("thread_id"),
    subject: text("subject"),
    snippet: text("snippet"),
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    fromAddress: text("from_address"),
    toAddresses: jsonb("to_addresses").$type<EmailAddress[]>(),
    ccAddresses: jsonb("cc_addresses").$type<EmailAddress[]>(),
    messageIdHeader: text("message_id_header"),
    inReplyTo: text("in_reply_to"),
    referencesHeader: text("references_header"),
    attachments: jsonb("attachments").$type<EmailAttachment[]>(),
    mediaType: text("media_type"),
    media: jsonb("media").$type<WhatsAppMedia>(),
    status: text("status").notNull().default("received"),
    errorMessage: text("error_message"),
    isAutoReply: boolean("is_auto_reply").notNull().default(false),
    autoReplyRuleId: uuid("auto_reply_rule_id"),
    readAt: timestamp("read_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("messages_channel_external_idx").on(t.channel, t.externalId),
    index("messages_client_idx").on(t.clientId, t.sentAt),
    index("messages_contact_idx").on(t.channel, t.contactAddress),
    index("messages_thread_idx").on(t.threadId),
    index("messages_sent_at_idx").on(t.sentAt),
  ],
);

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activities_client_idx").on(t.clientId, t.createdAt)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => messages.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_unread_idx").on(t.readAt, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Templates and automatic replies
// ---------------------------------------------------------------------------

export const templates = pgTable("message_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  channel: text("channel").notNull().default("any"),
  subject: text("subject"),
  body: text("body").notNull(),
  ...timestamps,
});

export const autoReplyRules = pgTable("auto_reply_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  channel: text("channel").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  triggerType: text("trigger_type").notNull().default("any"),
  keywords: jsonb("keywords").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  applyTo: text("apply_to").notNull().default("all"),
  stages: jsonb("stages").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  cooldownHours: integer("cooldown_hours").notNull().default(24),
  oncePerThread: boolean("once_per_thread").notNull().default(true),
  templateId: uuid("template_id")
    .notNull()
    .references(() => templates.id, { onDelete: "restrict" }),
  position: integer("position").notNull().default(0),
  timesTriggered: integer("times_triggered").notNull().default(0),
  lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
  ...timestamps,
});

export const autoReplyLog = pgTable(
  "auto_reply_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => autoReplyRules.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    contactAddress: text("contact_address").notNull(),
    threadId: text("thread_id"),
    inboundMessageId: uuid("inbound_message_id").references(() => messages.id, { onDelete: "set null" }),
    sentMessageId: uuid("sent_message_id").references(() => messages.id, { onDelete: "set null" }),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auto_reply_log_contact_idx").on(t.channel, t.contactAddress, t.sentAt)],
);

// ---------------------------------------------------------------------------
// Settings and integrations (single-row tables)
// ---------------------------------------------------------------------------

export type BusinessHours = { days: number[]; start: string; end: string };

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  agentName: text("agent_name").notNull().default(""),
  agencyName: text("agency_name").notNull().default(""),
  agentPhone: text("agent_phone").notNull().default(""),
  emailSignature: text("email_signature").notNull().default(""),
  timezone: text("timezone").notNull().default("Africa/Johannesburg"),
  defaultCountry: text("default_country").notNull().default("ZA"),
  currency: text("currency").notNull().default("ZAR"),
  businessHours: jsonb("business_hours")
    .$type<BusinessHours>()
    .notNull()
    .default(sql`'{"days":[1,2,3,4,5],"start":"08:00","end":"17:00"}'::jsonb`),
  emailAutoRepliesEnabled: boolean("email_auto_replies_enabled").notNull().default(false),
  whatsappAutoRepliesEnabled: boolean("whatsapp_auto_replies_enabled").notNull().default(false),
  trackUnknownSenders: boolean("track_unknown_senders").notNull().default(true),
  syncSentMail: boolean("sync_sent_mail").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const gmailAccounts = pgTable("gmail_accounts", {
  id: integer("id").primaryKey().default(1),
  emailAddress: text("email_address").notNull(),
  refreshTokenEnc: text("refresh_token_enc").notNull(),
  accessTokenEnc: text("access_token_enc"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  scopes: text("scopes").notNull().default(""),
  historyId: text("history_id"),
  watchTopic: text("watch_topic"),
  watchExpiresAt: timestamp("watch_expires_at", { withTimezone: true }),
  backfillPageToken: text("backfill_page_token"),
  backfillCompletedAt: timestamp("backfill_completed_at", { withTimezone: true }),
  syncLockedAt: timestamp("sync_locked_at", { withTimezone: true }),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastSyncError: text("last_sync_error"),
  lastSyncErrorAt: timestamp("last_sync_error_at", { withTimezone: true }),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const loginAttempts = pgTable("login_attempts", {
  key: text("key").primaryKey(),
  failedCount: integer("failed_count").notNull().default(0),
  firstFailedAt: timestamp("first_failed_at", { withTimezone: true }),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
});

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;
export type ClientProperty = typeof clientProperties.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Activity = typeof activities.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Template = typeof templates.$inferSelect;
export type AutoReplyRule = typeof autoReplyRules.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type GmailAccount = typeof gmailAccounts.$inferSelect;
