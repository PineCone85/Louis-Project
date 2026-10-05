CREATE TABLE "email_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"email_address" text NOT NULL,
	"display_name" text,
	"refresh_token_enc" text NOT NULL,
	"access_token_enc" text,
	"access_token_expires_at" timestamp with time zone,
	"scopes" text DEFAULT '' NOT NULL,
	"sync_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"watch_id" text,
	"watch_expires_at" timestamp with time zone,
	"backfill_completed_at" timestamp with time zone,
	"sync_locked_at" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"last_sync_error" text,
	"last_sync_error_at" timestamp with time zone,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "email_accounts" ("provider", "email_address", "refresh_token_enc", "access_token_enc", "access_token_expires_at", "scopes", "sync_state", "watch_id", "watch_expires_at", "backfill_completed_at", "last_sync_at", "last_sync_error", "last_sync_error_at", "connected_at", "updated_at")
SELECT 'gmail', "email_address", "refresh_token_enc", "access_token_enc", "access_token_expires_at", "scopes",
	jsonb_build_object('gmail', jsonb_strip_nulls(jsonb_build_object('historyId', "history_id", 'backfillPageToken', "backfill_page_token"))),
	"watch_topic", "watch_expires_at", "backfill_completed_at", "last_sync_at", "last_sync_error", "last_sync_error_at", "connected_at", "updated_at"
FROM "gmail_accounts";--> statement-breakpoint
ALTER TABLE "gmail_accounts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "gmail_accounts" CASCADE;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "account_id" uuid;--> statement-breakpoint
UPDATE "messages" SET "account_id" = (SELECT "id" FROM "email_accounts" WHERE "provider" = 'gmail' ORDER BY "connected_at" LIMIT 1) WHERE "channel" = 'email' AND "account_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "email_accounts_provider_address_idx" ON "email_accounts" USING btree ("provider","email_address");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_account_id_email_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."email_accounts"("id") ON DELETE set null ON UPDATE no action;