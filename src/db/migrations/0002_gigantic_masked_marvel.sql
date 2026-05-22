CREATE TYPE "public"."account_mode" AS ENUM('default', 'hawks');--> statement-breakpoint
CREATE TYPE "public"."hawks_bias" AS ENUM('long', 'short', 'neutral');--> statement-breakpoint
CREATE TYPE "public"."hawks_scenario_direction" AS ENUM('long', 'short', 'either');--> statement-breakpoint
CREATE TYPE "public"."hawks_scenario_type" AS ENUM('setup', 'mistake');--> statement-breakpoint
CREATE TYPE "public"."hawks_stop_direction" AS ENUM('with', 'against', 'same');--> statement-breakpoint
CREATE TYPE "public"."plan_lock_cadence" AS ENUM('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly');--> statement-breakpoint
CREATE TABLE "account_modes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"mode" "account_mode" NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_hawks_bias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"trading_day" date NOT NULL,
	"bias" "hawks_bias" NOT NULL,
	"renko_close_above_60min" boolean NOT NULL,
	"macd_slope_up" boolean NOT NULL,
	"ema_stack_bullish" boolean NOT NULL,
	"vwap_above" boolean NOT NULL,
	"ajuste_respected" boolean NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"notes_pt" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hawks_scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(16) NOT NULL,
	"name_en" text NOT NULL,
	"name_pt" text NOT NULL,
	"description_pt" text NOT NULL,
	"direction" "hawks_scenario_direction" NOT NULL,
	"screen_confirmation" jsonb NOT NULL,
	"scenario_type" "hawks_scenario_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hawks_scenarios_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "trade_hawks_metadata" (
	"trade_id" uuid PRIMARY KEY NOT NULL,
	"scenario_id" uuid,
	"bias_at_entry" "hawks_bias" NOT NULL,
	"vwap_respected" boolean NOT NULL,
	"ajuste_respected" boolean NOT NULL,
	"triple_screen_confirmed" boolean NOT NULL,
	"daily_trade_ordinal" smallint NOT NULL,
	"entered_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_stop_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trade_id" uuid NOT NULL,
	"stop_price_r" numeric(8, 2) NOT NULL,
	"direction_vs_position" "hawks_stop_direction" NOT NULL,
	"method_violation" boolean DEFAULT false NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "monthly_plan" ADD COLUMN "lock_cadence" "plan_lock_cadence" DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE "monthly_plan" ADD COLUMN "locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "monthly_plan" ADD COLUMN "break_glass_reason" text;--> statement-breakpoint
ALTER TABLE "monthly_plan" ADD COLUMN "break_glass_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_modes" ADD CONSTRAINT "account_modes_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_modes" ADD CONSTRAINT "account_modes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_hawks_bias" ADD CONSTRAINT "daily_hawks_bias_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_hawks_metadata" ADD CONSTRAINT "trade_hawks_metadata_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_hawks_metadata" ADD CONSTRAINT "trade_hawks_metadata_scenario_id_hawks_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."hawks_scenarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_stop_audit_events" ADD CONSTRAINT "trade_stop_audit_events_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_modes_account_idx" ON "account_modes" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "account_modes_user_idx" ON "account_modes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_modes_active_per_account_idx" ON "account_modes" USING btree ("account_id") WHERE deactivated_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "dhb_account_day_idx" ON "daily_hawks_bias" USING btree ("account_id","trading_day");--> statement-breakpoint
CREATE INDEX "dhb_expires_at_idx" ON "daily_hawks_bias" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "hawks_scenarios_type_idx" ON "hawks_scenarios" USING btree ("scenario_type");--> statement-breakpoint
CREATE INDEX "thm_scenario_idx" ON "trade_hawks_metadata" USING btree ("scenario_id");--> statement-breakpoint
CREATE INDEX "thm_entered_at_idx" ON "trade_hawks_metadata" USING btree ("entered_at");--> statement-breakpoint
CREATE INDEX "tsae_trade_recorded_at_idx" ON "trade_stop_audit_events" USING btree ("trade_id","recorded_at");