CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auto_reply_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"contact_address" text NOT NULL,
	"thread_id" text,
	"inbound_message_id" uuid,
	"sent_message_id" uuid,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auto_reply_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"channel" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"trigger_type" text DEFAULT 'any' NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"apply_to" text DEFAULT 'all' NOT NULL,
	"stages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cooldown_hours" integer DEFAULT 24 NOT NULL,
	"once_per_thread" boolean DEFAULT true NOT NULL,
	"template_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"times_triggered" integer DEFAULT 0 NOT NULL,
	"last_triggered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_properties" (
	"client_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"status" text DEFAULT 'suggested' NOT NULL,
	"notes" text,
	"viewing_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_properties_client_id_property_id_pk" PRIMARY KEY("client_id","property_id")
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"email" text,
	"alternate_email" text,
	"phone" text,
	"alternate_phone" text,
	"client_type" text DEFAULT 'buyer' NOT NULL,
	"stage" text DEFAULT 'prospect' NOT NULL,
	"stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text,
	"budget_min" bigint,
	"budget_max" bigint,
	"preferred_areas" text,
	"requirements" text,
	"notes" text,
	"next_follow_up_at" timestamp with time zone,
	"last_contact_at" timestamp with time zone,
	"last_inbound_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gmail_accounts" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"email_address" text NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"access_token_enc" text,
	"access_token_expires_at" timestamp with time zone,
	"scopes" text DEFAULT '' NOT NULL,
	"history_id" text,
	"watch_topic" text,
	"watch_expires_at" timestamp with time zone,
	"backfill_page_token" text,
	"backfill_completed_at" timestamp with time zone,
	"sync_locked_at" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"last_sync_error" text,
	"last_sync_error_at" timestamp with time zone,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"key" text PRIMARY KEY NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"first_failed_at" timestamp with time zone,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	"direction" text NOT NULL,
	"client_id" uuid,
	"contact_name" text,
	"contact_address" text NOT NULL,
	"external_id" text,
	"thread_id" text,
	"subject" text,
	"snippet" text,
	"body_text" text,
	"body_html" text,
	"from_address" text,
	"to_addresses" jsonb,
	"cc_addresses" jsonb,
	"message_id_header" text,
	"in_reply_to" text,
	"references_header" text,
	"attachments" jsonb,
	"media_type" text,
	"media" jsonb,
	"status" text DEFAULT 'received' NOT NULL,
	"error_message" text,
	"is_auto_reply" boolean DEFAULT false NOT NULL,
	"auto_reply_rule_id" uuid,
	"read_at" timestamp with time zone,
	"sent_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"client_id" uuid,
	"message_id" uuid,
	"title" text NOT NULL,
	"body" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"reference" text,
	"status" text DEFAULT 'available' NOT NULL,
	"property_type" text DEFAULT 'house' NOT NULL,
	"listing_type" text DEFAULT 'sale' NOT NULL,
	"price" bigint,
	"address" text,
	"suburb" text,
	"city" text,
	"province" text,
	"postal_code" text,
	"bedrooms" integer,
	"bathrooms" real,
	"parking" integer,
	"floor_size" integer,
	"erf_size" integer,
	"description" text,
	"features" text,
	"listing_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"agent_name" text DEFAULT '' NOT NULL,
	"agency_name" text DEFAULT '' NOT NULL,
	"agent_phone" text DEFAULT '' NOT NULL,
	"email_signature" text DEFAULT '' NOT NULL,
	"timezone" text DEFAULT 'Africa/Johannesburg' NOT NULL,
	"default_country" text DEFAULT 'ZA' NOT NULL,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"business_hours" jsonb DEFAULT '{"days":[1,2,3,4,5],"start":"08:00","end":"17:00"}'::jsonb NOT NULL,
	"email_auto_replies_enabled" boolean DEFAULT false NOT NULL,
	"whatsapp_auto_replies_enabled" boolean DEFAULT false NOT NULL,
	"track_unknown_senders" boolean DEFAULT true NOT NULL,
	"sync_sent_mail" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"channel" text DEFAULT 'any' NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_reply_log" ADD CONSTRAINT "auto_reply_log_rule_id_auto_reply_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."auto_reply_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_reply_log" ADD CONSTRAINT "auto_reply_log_inbound_message_id_messages_id_fk" FOREIGN KEY ("inbound_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_reply_log" ADD CONSTRAINT "auto_reply_log_sent_message_id_messages_id_fk" FOREIGN KEY ("sent_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_reply_rules" ADD CONSTRAINT "auto_reply_rules_template_id_message_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."message_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_properties" ADD CONSTRAINT "client_properties_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_properties" ADD CONSTRAINT "client_properties_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_client_idx" ON "activities" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "auto_reply_log_contact_idx" ON "auto_reply_log" USING btree ("channel","contact_address","sent_at");--> statement-breakpoint
CREATE INDEX "clients_email_idx" ON "clients" USING btree ("email");--> statement-breakpoint
CREATE INDEX "clients_alternate_email_idx" ON "clients" USING btree ("alternate_email");--> statement-breakpoint
CREATE INDEX "clients_phone_idx" ON "clients" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "clients_alternate_phone_idx" ON "clients" USING btree ("alternate_phone");--> statement-breakpoint
CREATE INDEX "clients_stage_idx" ON "clients" USING btree ("stage");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_channel_external_idx" ON "messages" USING btree ("channel","external_id");--> statement-breakpoint
CREATE INDEX "messages_client_idx" ON "messages" USING btree ("client_id","sent_at");--> statement-breakpoint
CREATE INDEX "messages_contact_idx" ON "messages" USING btree ("channel","contact_address");--> statement-breakpoint
CREATE INDEX "messages_thread_idx" ON "messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "messages_sent_at_idx" ON "messages" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("read_at","created_at");--> statement-breakpoint
CREATE INDEX "properties_status_idx" ON "properties" USING btree ("status");