CREATE TYPE "public"."capital_event_type" AS ENUM('deposit', 'withdrawal');--> statement-breakpoint
CREATE TABLE "account_capital_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"event_type" "capital_event_type" NOT NULL,
	"amount_cents" bigint NOT NULL,
	"event_date" date NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_capital_events" ADD CONSTRAINT "account_capital_events_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ace_account_date_idx" ON "account_capital_events" USING btree ("account_id","event_date");