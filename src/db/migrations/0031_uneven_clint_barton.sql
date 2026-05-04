CREATE TYPE "public"."plan_mood" AS ENUM('focused', 'neutral', 'distracted', 'risk_off');--> statement-breakpoint
CREATE TYPE "public"."snapshot_reason" AS ENUM('month_start', 'drawdown_trigger', 'manual');--> statement-breakpoint
CREATE TYPE "public"."tier_change_reason" AS ENUM('month_start', 'drawdown_trigger', 'manual');--> statement-breakpoint
CREATE TABLE "daily_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"weekly_plan_id" uuid NOT NULL,
	"date" date NOT NULL,
	"target_r" numeric(8, 2),
	"max_trades_today" integer,
	"pre_market_notes" text,
	"mood" "plan_mood",
	"override_daily_loss_r" numeric(8, 2),
	"override_daily_target_r" numeric(8, 2),
	"override_active_playbook_ids" jsonb,
	"actual_r" numeric(8, 2),
	"trades_count" integer,
	"actual_synced_at" timestamp with time zone,
	"post_market_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quarterly_plan_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"snapshot_capital_cents" bigint NOT NULL,
	"snapshot_one_r_cents" bigint NOT NULL,
	"snapshot_tier_index" integer NOT NULL,
	"snapshot_computed_at" timestamp with time zone NOT NULL,
	"snapshot_reason" "snapshot_reason" NOT NULL,
	"override_daily_loss_r" numeric(8, 2),
	"override_weekly_loss_r" numeric(8, 2),
	"override_monthly_loss_r" numeric(8, 2),
	"override_daily_target_r" numeric(8, 2),
	"override_active_playbook_ids" jsonb,
	"monthly_tax_ledger_id" uuid,
	"monthly_goal_cents" bigint,
	"intent_notes" text,
	"post_mortem_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quarterly_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"yearly_plan_id" uuid NOT NULL,
	"quarter" integer NOT NULL,
	"goal_cents" bigint,
	"reflection_notes" text,
	"post_mortem_notes" text,
	"active_playbook_ids" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tier_change_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"monthly_plan_id" uuid NOT NULL,
	"from_tier_index" integer NOT NULL,
	"to_tier_index" integer NOT NULL,
	"from_one_r_cents" bigint NOT NULL,
	"to_one_r_cents" bigint NOT NULL,
	"trigger_reason" "tier_change_reason" NOT NULL,
	"triggered_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"monthly_plan_id" uuid NOT NULL,
	"iso_week" integer NOT NULL,
	"iso_year" integer NOT NULL,
	"target_r" numeric(8, 2),
	"actual_r" numeric(8, 2),
	"actual_synced_at" timestamp with time zone,
	"override_daily_loss_r" numeric(8, 2),
	"override_weekly_loss_r" numeric(8, 2),
	"override_daily_target_r" numeric(8, 2),
	"override_active_playbook_ids" jsonb,
	"intent_notes" text,
	"post_mortem_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "monthly_tax_ledger" ADD COLUMN "monthly_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "strategies" ADD COLUMN "stop_r" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "strategies" ADD COLUMN "partial_r" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "strategies" ADD COLUMN "partial_proportion" numeric(4, 3);--> statement-breakpoint
ALTER TABLE "strategies" ADD COLUMN "final_r" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "strategies" ADD COLUMN "protection_r" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "strategies" ADD COLUMN "default_instrument_symbol" varchar(20);--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "one_r_snapshot_cents" bigint;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "r_outcome" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "daily_plan" ADD CONSTRAINT "daily_plan_weekly_plan_id_weekly_plan_id_fk" FOREIGN KEY ("weekly_plan_id") REFERENCES "public"."weekly_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_plan" ADD CONSTRAINT "monthly_plan_quarterly_plan_id_quarterly_plan_id_fk" FOREIGN KEY ("quarterly_plan_id") REFERENCES "public"."quarterly_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_plan" ADD CONSTRAINT "monthly_plan_monthly_tax_ledger_id_monthly_tax_ledger_id_fk" FOREIGN KEY ("monthly_tax_ledger_id") REFERENCES "public"."monthly_tax_ledger"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quarterly_plan" ADD CONSTRAINT "quarterly_plan_yearly_plan_id_yearly_plans_id_fk" FOREIGN KEY ("yearly_plan_id") REFERENCES "public"."yearly_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tier_change_log" ADD CONSTRAINT "tier_change_log_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tier_change_log" ADD CONSTRAINT "tier_change_log_monthly_plan_id_monthly_plan_id_fk" FOREIGN KEY ("monthly_plan_id") REFERENCES "public"."monthly_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plan" ADD CONSTRAINT "weekly_plan_monthly_plan_id_monthly_plan_id_fk" FOREIGN KEY ("monthly_plan_id") REFERENCES "public"."monthly_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_plan_week_idx" ON "daily_plan" USING btree ("weekly_plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_plan_week_date_idx" ON "daily_plan" USING btree ("weekly_plan_id","date");--> statement-breakpoint
CREATE INDEX "monthly_plan_quarter_idx" ON "monthly_plan" USING btree ("quarterly_plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_plan_quarter_month_idx" ON "monthly_plan" USING btree ("quarterly_plan_id","month");--> statement-breakpoint
CREATE INDEX "monthly_plan_year_month_idx" ON "monthly_plan" USING btree ("year","month");--> statement-breakpoint
CREATE INDEX "quarterly_plan_year_idx" ON "quarterly_plan" USING btree ("yearly_plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quarterly_plan_year_quarter_idx" ON "quarterly_plan" USING btree ("yearly_plan_id","quarter");--> statement-breakpoint
CREATE INDEX "tier_change_log_account_idx" ON "tier_change_log" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "tier_change_log_month_idx" ON "tier_change_log" USING btree ("monthly_plan_id");--> statement-breakpoint
CREATE INDEX "tier_change_log_triggered_at_idx" ON "tier_change_log" USING btree ("triggered_at");--> statement-breakpoint
CREATE INDEX "weekly_plan_month_idx" ON "weekly_plan" USING btree ("monthly_plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_plan_month_week_idx" ON "weekly_plan" USING btree ("monthly_plan_id","iso_week","iso_year");--> statement-breakpoint
ALTER TABLE "monthly_tax_ledger" ADD CONSTRAINT "monthly_tax_ledger_monthly_plan_id_monthly_plan_id_fk" FOREIGN KEY ("monthly_plan_id") REFERENCES "public"."monthly_plan"("id") ON DELETE set null ON UPDATE no action;