CREATE TABLE "whatsapp_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_number_id" text NOT NULL,
	"waba_id" text NOT NULL,
	"display_phone_number" text,
	"verified_name" text,
	"access_token_enc" text NOT NULL,
	"pin_enc" text,
	"coexistence" boolean DEFAULT false NOT NULL,
	"registered_at" timestamp with time zone,
	"last_error" text,
	"last_error_at" timestamp with time zone,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "wa_phone_number_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_accounts_phone_number_idx" ON "whatsapp_accounts" USING btree ("phone_number_id");