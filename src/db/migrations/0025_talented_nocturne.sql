CREATE TYPE "public"."account_mode" AS ENUM('default', 'hawks');--> statement-breakpoint
CREATE TABLE "account_modes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"mode" "account_mode" DEFAULT 'default' NOT NULL,
	"archived_state" jsonb,
	"activated_at" timestamp with time zone,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hawks_daily_bias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"asset_symbol" varchar(20) NOT NULL,
	"bias" varchar(16) NOT NULL,
	"checklist" jsonb DEFAULT '{}'::jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hawks_global_calibrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_start" timestamp with time zone NOT NULL,
	"asset_symbol" varchar(20) NOT NULL,
	"timeframe_minutes" integer NOT NULL,
	"r_value" integer NOT NULL,
	"atr_reading" integer,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hawks_learning_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"section_key" varchar(100) NOT NULL,
	"completed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hawks_mentor_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"asset_symbol" varchar(20),
	"bias_called" varchar(16),
	"setup_called" text,
	"outcome" varchar(16),
	"body_markdown" text NOT NULL,
	"source_path" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hawks_scenario_on_trade" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trade_id" uuid NOT NULL,
	"scenario_code" integer,
	"elliott_wave" varchar(4),
	"pullback_level" varchar(8),
	"confluencia" jsonb DEFAULT '[]'::jsonb,
	"mma_aligned" varchar(8),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hawks_stop_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trade_id" uuid NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"old_stop" text,
	"new_stop" text NOT NULL,
	"direction" varchar(16) NOT NULL,
	"violation" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_modes" ADD CONSTRAINT "account_modes_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hawks_daily_bias" ADD CONSTRAINT "hawks_daily_bias_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hawks_global_calibrations" ADD CONSTRAINT "hawks_global_calibrations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hawks_learning_progress" ADD CONSTRAINT "hawks_learning_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hawks_scenario_on_trade" ADD CONSTRAINT "hawks_scenario_on_trade_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hawks_stop_audit" ADD CONSTRAINT "hawks_stop_audit_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_modes_account_idx" ON "account_modes" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "hawks_bias_account_idx" ON "hawks_daily_bias" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hawks_bias_unique_idx" ON "hawks_daily_bias" USING btree ("account_id","date","asset_symbol");--> statement-breakpoint
CREATE INDEX "hawks_global_calib_week_idx" ON "hawks_global_calibrations" USING btree ("week_start");--> statement-breakpoint
CREATE UNIQUE INDEX "hawks_global_calib_unique_idx" ON "hawks_global_calibrations" USING btree ("week_start","asset_symbol","timeframe_minutes");--> statement-breakpoint
CREATE UNIQUE INDEX "hawks_learning_unique_idx" ON "hawks_learning_progress" USING btree ("user_id","section_key");--> statement-breakpoint
CREATE INDEX "hawks_insights_date_idx" ON "hawks_mentor_insights" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "hawks_insights_source_idx" ON "hawks_mentor_insights" USING btree ("source_path");--> statement-breakpoint
CREATE UNIQUE INDEX "hawks_scenario_trade_idx" ON "hawks_scenario_on_trade" USING btree ("trade_id");--> statement-breakpoint
CREATE INDEX "hawks_stop_audit_trade_idx" ON "hawks_stop_audit" USING btree ("trade_id");