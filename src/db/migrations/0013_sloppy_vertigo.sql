CREATE TABLE "hawks_weekly_oco" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"effective_date" date NOT NULL,
	"week_number" smallint NOT NULL,
	"asset" varchar(8) NOT NULL,
	"stop_ticks" smallint NOT NULL,
	"target_ticks" smallint NOT NULL,
	"breakeven_trigger_ticks" smallint NOT NULL,
	"trail_config" jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hawks_weekly_oco" ADD CONSTRAINT "hawks_weekly_oco_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hawks_weekly_oco_account_week_asset_idx" ON "hawks_weekly_oco" USING btree ("account_id","effective_date","asset");--> statement-breakpoint
CREATE INDEX "hawks_weekly_oco_effective_date_idx" ON "hawks_weekly_oco" USING btree ("effective_date");