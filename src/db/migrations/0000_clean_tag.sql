CREATE TYPE "public"."account_type" AS ENUM('personal', 'prop', 'replay');--> statement-breakpoint
CREATE TYPE "public"."bug_report_status" AS ENUM('open', 'accepted', 'rejected', 'closed');--> statement-breakpoint
CREATE TYPE "public"."capital_event_type" AS ENUM('deposit', 'withdrawal');--> statement-breakpoint
CREATE TYPE "public"."condition_category" AS ENUM('indicator', 'price_action', 'market_context', 'custom');--> statement-breakpoint
CREATE TYPE "public"."condition_tier" AS ENUM('mandatory', 'tier_2', 'tier_3');--> statement-breakpoint
CREATE TYPE "public"."darf_status" AS ENUM('pending', 'paid', 'exempt', 'overdue');--> statement-breakpoint
CREATE TYPE "public"."execution_mode" AS ENUM('simple', 'scaled');--> statement-breakpoint
CREATE TYPE "public"."execution_type" AS ENUM('entry', 'exit');--> statement-breakpoint
CREATE TYPE "public"."order_type" AS ENUM('market', 'limit', 'stop', 'stop_limit');--> statement-breakpoint
CREATE TYPE "public"."plan_mood" AS ENUM('focused', 'neutral', 'distracted', 'risk_off');--> statement-breakpoint
CREATE TYPE "public"."setup_rank" AS ENUM('A', 'AA', 'AAA');--> statement-breakpoint
CREATE TYPE "public"."snapshot_reason" AS ENUM('month_start', 'drawdown_trigger', 'manual');--> statement-breakpoint
CREATE TYPE "public"."tag_type" AS ENUM('setup', 'mistake', 'general');--> statement-breakpoint
CREATE TYPE "public"."tier_change_reason" AS ENUM('month_start', 'drawdown_trigger', 'manual');--> statement-breakpoint
CREATE TYPE "public"."timeframe_type" AS ENUM('time_based', 'renko');--> statement-breakpoint
CREATE TYPE "public"."timeframe_unit" AS ENUM('minutes', 'hours', 'days', 'weeks', 'ticks', 'points');--> statement-breakpoint
CREATE TYPE "public"."trade_direction" AS ENUM('long', 'short');--> statement-breakpoint
CREATE TYPE "public"."trade_outcome" AS ENUM('win', 'loss', 'breakeven');--> statement-breakpoint
CREATE TYPE "public"."trade_rating" AS ENUM('A', 'B', 'C', 'D', 'F');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'premium', 'trader', 'viewer');--> statement-breakpoint
CREATE TABLE "account_asset_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"bias" varchar(10),
	"max_daily_trades" integer,
	"max_position_size" integer,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"breakeven_ticks_override" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "account_fee_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"asset_symbol" varchar(20),
	"tx_corretagem_cents" integer DEFAULT 5 NOT NULL,
	"tx_registro_cents" integer DEFAULT 74 NOT NULL,
	"emolumentos_cents" integer DEFAULT 40 NOT NULL,
	"iss_rate_percent" numeric(5, 2) DEFAULT '5.00' NOT NULL,
	"irrf_rate_bps" integer DEFAULT 100 NOT NULL,
	"ir_rate_bps" integer DEFAULT 2000 NOT NULL,
	"subject_to_personal_ir" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_monthly_aggregate" (
	"account_id" uuid NOT NULL,
	"year" smallint NOT NULL,
	"month" smallint NOT NULL,
	"gross_cents" bigint DEFAULT 0 NOT NULL,
	"net_cents" bigint DEFAULT 0 NOT NULL,
	"points" numeric(12, 2) DEFAULT '0' NOT NULL,
	"trading_days" smallint DEFAULT 0 NOT NULL,
	"gain_days" smallint DEFAULT 0 NOT NULL,
	"loss_days" smallint DEFAULT 0 NOT NULL,
	"is_dirty" boolean DEFAULT true NOT NULL,
	"computed_at" timestamp with time zone,
	CONSTRAINT "account_monthly_aggregate_account_id_year_month_pk" PRIMARY KEY("account_id","year","month")
);
--> statement-breakpoint
CREATE TABLE "account_timeframes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"timeframe_id" uuid NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_weekly_aggregate" (
	"account_id" uuid NOT NULL,
	"iso_year" smallint NOT NULL,
	"iso_week" smallint NOT NULL,
	"gross_cents" bigint DEFAULT 0 NOT NULL,
	"net_cents" bigint DEFAULT 0 NOT NULL,
	"points" numeric(12, 2) DEFAULT '0' NOT NULL,
	"trading_days" smallint DEFAULT 0 NOT NULL,
	"gain_days" smallint DEFAULT 0 NOT NULL,
	"loss_days" smallint DEFAULT 0 NOT NULL,
	"is_dirty" boolean DEFAULT true NOT NULL,
	"computed_at" timestamp with time zone,
	CONSTRAINT "account_weekly_aggregate_account_id_iso_year_iso_week_pk" PRIMARY KEY("account_id","iso_year","iso_week")
);
--> statement-breakpoint
CREATE TABLE "asset_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"name" varchar(100) NOT NULL,
	"asset_type_id" uuid NOT NULL,
	"tick_size" numeric(18, 8) NOT NULL,
	"tick_value" integer NOT NULL,
	"currency" varchar(10) DEFAULT 'BRL' NOT NULL,
	"multiplier" numeric(18, 4) DEFAULT '1',
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_symbol_unique" UNIQUE("symbol")
);
--> statement-breakpoint
CREATE TABLE "bug_report_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bug_report_id" uuid NOT NULL,
	"image_url" varchar(500) NOT NULL,
	"s3_key" varchar(500) NOT NULL,
	"is_screenshot" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bug_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reported_by" uuid NOT NULL,
	"subject" varchar(200) NOT NULL,
	"description" text NOT NULL,
	"current_url" varchar(500),
	"user_agent" varchar(500),
	"console_logs" text,
	"network_errors" text,
	"status" "bug_report_status" DEFAULT 'open' NOT NULL,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"handled_by" uuid,
	"reject_reason" text,
	"admin_notes" text
);
--> statement-breakpoint
CREATE TABLE "checklist_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checklist_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"completed_items" text DEFAULT '[]' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_asset_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"bias" varchar(10),
	"max_daily_trades" integer,
	"max_position_size" integer,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_checklists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"account_id" uuid,
	"name" varchar(100) NOT NULL,
	"items" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_journals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"market_outlook" text,
	"focus_goals" text,
	"mental_state" integer,
	"session_review" text,
	"emotional_state" integer,
	"key_takeaways" text,
	"total_pnl" bigint,
	"trade_count" integer,
	"win_count" integer,
	"loss_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_journals_date_unique" UNIQUE("date")
);
--> statement-breakpoint
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
	"override_max_consecutive_losses" integer,
	"override_allow_second_op_after_loss" boolean,
	"actual_r" numeric(8, 2),
	"trades_count" integer,
	"actual_synced_at" timestamp with time zone,
	"post_market_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "filter_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid,
	"name" varchar(100) NOT NULL,
	"filters" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indicator_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(50) NOT NULL,
	"group_id" uuid NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"csv_header" varchar(100),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indicator_definitions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "indicator_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(50) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indicator_groups_key_unique" UNIQUE("key")
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
	"override_risk_profile_id" uuid,
	"override_max_consecutive_losses" integer,
	"override_allow_second_op_after_loss" boolean,
	"override_reduce_risk_after_loss" boolean,
	"override_risk_reduction_factor" numeric(5, 2),
	"override_increase_risk_after_win" boolean,
	"override_cap_risk_after_win" boolean,
	"override_profit_reinvestment_percent" numeric(5, 2),
	"monthly_tax_ledger_id" uuid,
	"monthly_goal_cents" bigint,
	"intent_notes" text,
	"post_mortem_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_tax_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"month" timestamp with time zone NOT NULL,
	"gross_gain_cents" bigint DEFAULT 0 NOT NULL,
	"total_tx_corretagem_cents" bigint DEFAULT 0 NOT NULL,
	"total_tx_registro_cents" bigint DEFAULT 0 NOT NULL,
	"total_emolumentos_cents" bigint DEFAULT 0 NOT NULL,
	"total_iss_cents" bigint DEFAULT 0 NOT NULL,
	"total_fees_cents" bigint DEFAULT 0 NOT NULL,
	"total_contracts_executed" numeric(20, 4) DEFAULT '0' NOT NULL,
	"irrf_cents" bigint DEFAULT 0 NOT NULL,
	"net_gain_before_carryover_cents" bigint DEFAULT 0 NOT NULL,
	"carryover_in_cents" bigint DEFAULT 0 NOT NULL,
	"carryover_consumed_cents" bigint DEFAULT 0 NOT NULL,
	"carryover_out_cents" bigint DEFAULT 0 NOT NULL,
	"taxable_gain_cents" bigint DEFAULT 0 NOT NULL,
	"ir_gross_cents" bigint DEFAULT 0 NOT NULL,
	"darf_due_cents" bigint DEFAULT 0 NOT NULL,
	"darf_status" "darf_status" DEFAULT 'pending' NOT NULL,
	"darf_due_date" timestamp with time zone,
	"darf_paid_at" timestamp with time zone,
	"darf_paid_amount_cents" bigint,
	"previous_balance_cents" bigint DEFAULT 0 NOT NULL,
	"gastos_gerais_cents" bigint DEFAULT 0 NOT NULL,
	"net_liquid_cents" bigint DEFAULT 0 NOT NULL,
	"is_dirty" boolean DEFAULT true NOT NULL,
	"computed_at" timestamp with time zone,
	"trade_count" integer DEFAULT 0 NOT NULL,
	"monthly_plan_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nota_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_hash" varchar(64) NOT NULL,
	"nota_date" timestamp with time zone NOT NULL,
	"broker_name" varchar(100),
	"total_fills" integer DEFAULT 0 NOT NULL,
	"matched_fills" integer DEFAULT 0 NOT NULL,
	"unmatched_fills" integer DEFAULT 0 NOT NULL,
	"trades_enriched" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'completed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(255) NOT NULL,
	"provider" varchar(255) NOT NULL,
	"provider_account_id" varchar(255) NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" varchar(255),
	"scope" varchar(255),
	"id_token" text,
	"session_state" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "price_candles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"timeframe_id" uuid NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"open" numeric(18, 8) NOT NULL,
	"high" numeric(18, 8) NOT NULL,
	"low" numeric(18, 8) NOT NULL,
	"close" numeric(18, 8) NOT NULL,
	"candle_index" integer,
	"indicators" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_data_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"timeframe_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"last_imported_at" timestamp with time zone,
	"row_count" integer,
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
CREATE TABLE "rate_limit_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_management_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"created_by_user_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"decision_tree" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenario_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scenario_id" uuid NOT NULL,
	"url" varchar(500) NOT NULL,
	"s3_key" varchar(500) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_token" varchar(255) NOT NULL,
	"user_id" uuid NOT NULL,
	"current_account_id" uuid,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "sessions_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(50) NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "strategies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"account_id" uuid,
	"code" varchar NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"entry_criteria" text,
	"exit_criteria" text,
	"risk_rules" text,
	"stop_r" numeric(8, 2),
	"partial_r" numeric(8, 2),
	"partial_proportion" numeric(4, 3),
	"final_r" numeric(8, 2),
	"protection_r" numeric(8, 2),
	"default_instrument_symbol" varchar(20),
	"max_risk_percent" numeric(5, 2),
	"screenshot_url" varchar(500),
	"screenshot_s3_key" varchar(500),
	"notes" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_conditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strategy_id" uuid NOT NULL,
	"condition_id" uuid NOT NULL,
	"tier" "condition_tier" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strategy_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"account_id" uuid,
	"name" varchar(50) NOT NULL,
	"type" "tag_type" NOT NULL,
	"color" varchar(7),
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE "timeframes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(50) NOT NULL,
	"type" timeframe_type NOT NULL,
	"value" integer NOT NULL,
	"unit" timeframe_unit NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "timeframes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "trade_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trade_id" uuid NOT NULL,
	"execution_type" "execution_type" NOT NULL,
	"execution_date" timestamp with time zone NOT NULL,
	"price" text NOT NULL,
	"quantity" text NOT NULL,
	"order_type" "order_type",
	"notes" text,
	"commission" text,
	"fees" text,
	"slippage" text,
	"execution_value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trade_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid,
	"asset" varchar(20) NOT NULL,
	"direction" "trade_direction" NOT NULL,
	"timeframe_id" uuid,
	"entry_date" timestamp with time zone NOT NULL,
	"exit_date" timestamp with time zone,
	"entry_price" text NOT NULL,
	"exit_price" text,
	"position_size" text NOT NULL,
	"stop_loss" text,
	"take_profit" text,
	"planned_risk_amount" text,
	"planned_r_multiple" text,
	"pnl" text,
	"pnl_percent" numeric(8, 4),
	"points_pnl" numeric(10, 2),
	"realized_r_multiple" numeric(8, 2),
	"one_r_snapshot_cents" bigint,
	"r_outcome" numeric(8, 2),
	"outcome" "trade_outcome",
	"mfe" numeric(18, 8),
	"mae" numeric(18, 8),
	"mfe_r" numeric(8, 2),
	"mae_r" numeric(8, 2),
	"commission" text,
	"fees" text,
	"contracts_executed" numeric(18, 8),
	"pre_trade_thoughts" text,
	"post_trade_reflection" text,
	"lesson_learned" text,
	"strategy_id" uuid,
	"setup_rank" "setup_rank",
	"screenshot_url" varchar(500),
	"screenshot_s3_key" varchar(500),
	"followed_plan" boolean,
	"discipline_notes" text,
	"rating" "trade_rating",
	"execution_mode" "execution_mode" DEFAULT 'simple' NOT NULL,
	"total_entry_quantity" numeric(20, 8),
	"total_exit_quantity" numeric(20, 8),
	"avg_entry_price" numeric(20, 8),
	"avg_exit_price" numeric(20, 8),
	"remaining_quantity" numeric(20, 8) DEFAULT '0',
	"deduplication_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_archived" boolean DEFAULT false,
	"source" varchar(20) DEFAULT 'manual'
);
--> statement-breakpoint
CREATE TABLE "trading_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"account_type" "account_type" DEFAULT 'personal' NOT NULL,
	"prop_firm_name" text,
	"profit_share_percentage" text DEFAULT '100.00' NOT NULL,
	"day_trade_tax_rate" text DEFAULT '20.00' NOT NULL,
	"swing_trade_tax_rate" text DEFAULT '15.00' NOT NULL,
	"default_currency" varchar(3) DEFAULT 'BRL' NOT NULL,
	"default_breakeven_ticks" integer DEFAULT 2 NOT NULL,
	"default_asset" varchar(20),
	"show_tax_estimates" boolean DEFAULT true NOT NULL,
	"show_prop_calculations" boolean DEFAULT true NOT NULL,
	"brand" varchar(20) DEFAULT 'bravo' NOT NULL,
	"account_start_month" smallint,
	"account_start_year" smallint,
	"starting_balance_cents" bigint,
	"withdrawal_target_percent" numeric(5, 2) DEFAULT '30.00',
	"replay_current_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trading_conditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"category" "condition_category" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(50) DEFAULT 'default' NOT NULL,
	"is_prop_account" boolean DEFAULT false NOT NULL,
	"prop_firm_name" varchar(100),
	"profit_share_percentage" numeric(5, 2) DEFAULT '100.00' NOT NULL,
	"day_trade_tax_rate" numeric(5, 2) DEFAULT '20.00' NOT NULL,
	"swing_trade_tax_rate" numeric(5, 2) DEFAULT '15.00' NOT NULL,
	"tax_exempt_threshold" integer DEFAULT 0 NOT NULL,
	"default_currency" varchar(3) DEFAULT 'BRL' NOT NULL,
	"show_tax_estimates" boolean DEFAULT true NOT NULL,
	"show_prop_calculations" boolean DEFAULT true NOT NULL,
	"show_all_accounts" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" varchar(255) NOT NULL,
	"email_verified" timestamp with time zone,
	"password_hash" varchar(255) NOT NULL,
	"image" varchar(255),
	"is_admin" boolean DEFAULT false NOT NULL,
	"role" "user_role" DEFAULT 'trader' NOT NULL,
	"encrypted_dek" text,
	"preferred_locale" varchar(10) DEFAULT 'pt-BR' NOT NULL,
	"theme" varchar(20) DEFAULT 'dark' NOT NULL,
	"date_format" varchar(20) DEFAULT 'DD/MM/YYYY' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" varchar(255) NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_token_unique" UNIQUE("token")
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
	"override_max_consecutive_losses" integer,
	"override_allow_second_op_after_loss" boolean,
	"intent_notes" text,
	"post_mortem_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "yearly_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"initial_capital_cents" integer NOT NULL,
	"ir_tax_rate" numeric(5, 2) DEFAULT '30.00' NOT NULL,
	"trading_days_per_week" integer DEFAULT 5 NOT NULL,
	"ladder_rules" jsonb NOT NULL,
	"start_week" integer DEFAULT 1 NOT NULL,
	"default_daily_loss_r" numeric(5, 2),
	"default_daily_win_r" numeric(5, 2),
	"default_weekly_loss_r" numeric(5, 2),
	"default_weekly_win_r" numeric(5, 2),
	"default_monthly_loss_r" numeric(5, 2),
	"default_monthly_win_r" numeric(5, 2),
	"default_risk_profile_id" uuid,
	"default_max_consecutive_losses" integer,
	"default_allow_second_op_after_loss" boolean DEFAULT true,
	"default_reduce_risk_after_loss" boolean DEFAULT false,
	"default_risk_reduction_factor" numeric(5, 2),
	"default_increase_risk_after_win" boolean DEFAULT false,
	"default_cap_risk_after_win" boolean DEFAULT false,
	"default_profit_reinvestment_percent" numeric(5, 2),
	"target_months_to_yearly" integer,
	"target_weeks_to_yearly" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_asset_settings" ADD CONSTRAINT "account_asset_settings_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_asset_settings" ADD CONSTRAINT "account_asset_settings_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_assets" ADD CONSTRAINT "account_assets_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_assets" ADD CONSTRAINT "account_assets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_capital_events" ADD CONSTRAINT "account_capital_events_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_fee_rates" ADD CONSTRAINT "account_fee_rates_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_monthly_aggregate" ADD CONSTRAINT "account_monthly_aggregate_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_timeframes" ADD CONSTRAINT "account_timeframes_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_timeframes" ADD CONSTRAINT "account_timeframes_timeframe_id_timeframes_id_fk" FOREIGN KEY ("timeframe_id") REFERENCES "public"."timeframes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_weekly_aggregate" ADD CONSTRAINT "account_weekly_aggregate_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_asset_type_id_asset_types_id_fk" FOREIGN KEY ("asset_type_id") REFERENCES "public"."asset_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bug_report_images" ADD CONSTRAINT "bug_report_images_bug_report_id_bug_reports_id_fk" FOREIGN KEY ("bug_report_id") REFERENCES "public"."bug_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_completions" ADD CONSTRAINT "checklist_completions_checklist_id_daily_checklists_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."daily_checklists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_asset_settings" ADD CONSTRAINT "daily_asset_settings_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_asset_settings" ADD CONSTRAINT "daily_asset_settings_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_checklists" ADD CONSTRAINT "daily_checklists_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_plan" ADD CONSTRAINT "daily_plan_weekly_plan_id_weekly_plan_id_fk" FOREIGN KEY ("weekly_plan_id") REFERENCES "public"."weekly_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filter_presets" ADD CONSTRAINT "filter_presets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filter_presets" ADD CONSTRAINT "filter_presets_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_definitions" ADD CONSTRAINT "indicator_definitions_group_id_indicator_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."indicator_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_plan" ADD CONSTRAINT "monthly_plan_quarterly_plan_id_quarterly_plan_id_fk" FOREIGN KEY ("quarterly_plan_id") REFERENCES "public"."quarterly_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_plan" ADD CONSTRAINT "monthly_plan_monthly_tax_ledger_id_monthly_tax_ledger_id_fk" FOREIGN KEY ("monthly_tax_ledger_id") REFERENCES "public"."monthly_tax_ledger"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_plan" ADD CONSTRAINT "monthly_plan_override_risk_profile_fk" FOREIGN KEY ("override_risk_profile_id") REFERENCES "public"."risk_management_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_tax_ledger" ADD CONSTRAINT "monthly_tax_ledger_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_tax_ledger" ADD CONSTRAINT "monthly_tax_ledger_monthly_plan_id_monthly_plan_id_fk" FOREIGN KEY ("monthly_plan_id") REFERENCES "public"."monthly_plan"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota_imports" ADD CONSTRAINT "nota_imports_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_candles" ADD CONSTRAINT "price_candles_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_candles" ADD CONSTRAINT "price_candles_timeframe_id_timeframes_id_fk" FOREIGN KEY ("timeframe_id") REFERENCES "public"."timeframes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_data_versions" ADD CONSTRAINT "price_data_versions_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_data_versions" ADD CONSTRAINT "price_data_versions_timeframe_id_timeframes_id_fk" FOREIGN KEY ("timeframe_id") REFERENCES "public"."timeframes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quarterly_plan" ADD CONSTRAINT "quarterly_plan_yearly_plan_id_yearly_plans_id_fk" FOREIGN KEY ("yearly_plan_id") REFERENCES "public"."yearly_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_management_profiles" ADD CONSTRAINT "risk_management_profiles_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_images" ADD CONSTRAINT "scenario_images_scenario_id_strategy_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."strategy_scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_current_account_id_trading_accounts_id_fk" FOREIGN KEY ("current_account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_conditions" ADD CONSTRAINT "strategy_conditions_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_conditions" ADD CONSTRAINT "strategy_conditions_condition_id_trading_conditions_id_fk" FOREIGN KEY ("condition_id") REFERENCES "public"."trading_conditions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_scenarios" ADD CONSTRAINT "strategy_scenarios_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tier_change_log" ADD CONSTRAINT "tier_change_log_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tier_change_log" ADD CONSTRAINT "tier_change_log_monthly_plan_id_monthly_plan_id_fk" FOREIGN KEY ("monthly_plan_id") REFERENCES "public"."monthly_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_executions" ADD CONSTRAINT "trade_executions_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_tags" ADD CONSTRAINT "trade_tags_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_tags" ADD CONSTRAINT "trade_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_timeframe_id_timeframes_id_fk" FOREIGN KEY ("timeframe_id") REFERENCES "public"."timeframes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_accounts" ADD CONSTRAINT "trading_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_conditions" ADD CONSTRAINT "trading_conditions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plan" ADD CONSTRAINT "weekly_plan_monthly_plan_id_monthly_plan_id_fk" FOREIGN KEY ("monthly_plan_id") REFERENCES "public"."monthly_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yearly_plans" ADD CONSTRAINT "yearly_plans_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yearly_plans" ADD CONSTRAINT "yearly_plans_default_risk_profile_fk" FOREIGN KEY ("default_risk_profile_id") REFERENCES "public"."risk_management_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_asset_settings_user_idx" ON "account_asset_settings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_asset_settings_account_idx" ON "account_asset_settings" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "account_asset_settings_asset_idx" ON "account_asset_settings" USING btree ("asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_asset_settings_unique_idx" ON "account_asset_settings" USING btree ("account_id","asset_id");--> statement-breakpoint
CREATE INDEX "account_assets_account_idx" ON "account_assets" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_assets_unique_idx" ON "account_assets" USING btree ("account_id","asset_id");--> statement-breakpoint
CREATE INDEX "ace_account_date_idx" ON "account_capital_events" USING btree ("account_id","event_date");--> statement-breakpoint
CREATE INDEX "account_fee_rates_account_idx" ON "account_fee_rates" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_fee_rates_account_asset_idx" ON "account_fee_rates" USING btree ("account_id","asset_symbol");--> statement-breakpoint
CREATE INDEX "account_timeframes_account_idx" ON "account_timeframes" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_timeframes_unique_idx" ON "account_timeframes" USING btree ("account_id","timeframe_id");--> statement-breakpoint
CREATE INDEX "assets_symbol_idx" ON "assets" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "assets_asset_type_idx" ON "assets" USING btree ("asset_type_id");--> statement-breakpoint
CREATE INDEX "bug_reports_reported_by_idx" ON "bug_reports" USING btree ("reported_by");--> statement-breakpoint
CREATE INDEX "bug_reports_status_idx" ON "bug_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "checklist_completions_checklist_idx" ON "checklist_completions" USING btree ("checklist_id");--> statement-breakpoint
CREATE INDEX "checklist_completions_user_idx" ON "checklist_completions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "checklist_completions_date_idx" ON "checklist_completions" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "checklist_completions_unique_idx" ON "checklist_completions" USING btree ("checklist_id","date");--> statement-breakpoint
CREATE INDEX "daily_asset_settings_user_idx" ON "daily_asset_settings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "daily_asset_settings_account_idx" ON "daily_asset_settings" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "daily_asset_settings_asset_idx" ON "daily_asset_settings" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "daily_asset_settings_date_idx" ON "daily_asset_settings" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_asset_settings_unique_idx" ON "daily_asset_settings" USING btree ("account_id","asset_id","date");--> statement-breakpoint
CREATE INDEX "daily_checklists_user_idx" ON "daily_checklists" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "daily_checklists_account_idx" ON "daily_checklists" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "daily_journals_date_idx" ON "daily_journals" USING btree ("date");--> statement-breakpoint
CREATE INDEX "daily_plan_week_idx" ON "daily_plan" USING btree ("weekly_plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_plan_week_date_idx" ON "daily_plan" USING btree ("weekly_plan_id","date");--> statement-breakpoint
CREATE INDEX "filter_presets_user_idx" ON "filter_presets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "filter_presets_account_idx" ON "filter_presets" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "indicator_definitions_group_idx" ON "indicator_definitions" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "monthly_plan_quarter_idx" ON "monthly_plan" USING btree ("quarterly_plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_plan_quarter_month_idx" ON "monthly_plan" USING btree ("quarterly_plan_id","month");--> statement-breakpoint
CREATE INDEX "monthly_plan_year_month_idx" ON "monthly_plan" USING btree ("year","month");--> statement-breakpoint
CREATE INDEX "monthly_tax_ledger_account_idx" ON "monthly_tax_ledger" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_tax_ledger_account_month_idx" ON "monthly_tax_ledger" USING btree ("account_id","month");--> statement-breakpoint
CREATE INDEX "monthly_tax_ledger_darf_status_idx" ON "monthly_tax_ledger" USING btree ("darf_status");--> statement-breakpoint
CREATE INDEX "monthly_tax_ledger_dirty_idx" ON "monthly_tax_ledger" USING btree ("is_dirty");--> statement-breakpoint
CREATE INDEX "nota_imports_account_idx" ON "nota_imports" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "nota_imports_file_hash_idx" ON "nota_imports" USING btree ("file_hash");--> statement-breakpoint
CREATE INDEX "nota_imports_date_idx" ON "nota_imports" USING btree ("nota_date");--> statement-breakpoint
CREATE INDEX "oauth_accounts_user_idx" ON "oauth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_accounts_provider_idx" ON "oauth_accounts" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "price_candles_unique_idx" ON "price_candles" USING btree ("asset_id","timeframe_id","timestamp","candle_index");--> statement-breakpoint
CREATE UNIQUE INDEX "price_data_versions_unique_idx" ON "price_data_versions" USING btree ("asset_id","timeframe_id");--> statement-breakpoint
CREATE INDEX "quarterly_plan_year_idx" ON "quarterly_plan" USING btree ("yearly_plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quarterly_plan_year_quarter_idx" ON "quarterly_plan" USING btree ("yearly_plan_id","quarter");--> statement-breakpoint
CREATE INDEX "rate_limit_attempts_identifier_created_idx" ON "rate_limit_attempts" USING btree ("identifier","created_at");--> statement-breakpoint
CREATE INDEX "risk_profiles_created_by_idx" ON "risk_management_profiles" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "risk_profiles_active_idx" ON "risk_management_profiles" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "scenario_images_scenario_idx" ON "scenario_images" USING btree ("scenario_id");--> statement-breakpoint
CREATE INDEX "sessions_token_idx" ON "sessions" USING btree ("session_token");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "strategies_user_idx" ON "strategies" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "strategies_account_idx" ON "strategies" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "strategies_user_code_idx" ON "strategies" USING btree ("user_id","code");--> statement-breakpoint
CREATE INDEX "strategy_conditions_strategy_idx" ON "strategy_conditions" USING btree ("strategy_id");--> statement-breakpoint
CREATE INDEX "strategy_conditions_condition_idx" ON "strategy_conditions" USING btree ("condition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "strategy_conditions_unique_idx" ON "strategy_conditions" USING btree ("strategy_id","condition_id");--> statement-breakpoint
CREATE INDEX "strategy_scenarios_strategy_idx" ON "strategy_scenarios" USING btree ("strategy_id");--> statement-breakpoint
CREATE INDEX "tags_user_idx" ON "tags" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tags_account_idx" ON "tags" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_user_name_idx" ON "tags" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "tier_change_log_account_idx" ON "tier_change_log" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "tier_change_log_month_idx" ON "tier_change_log" USING btree ("monthly_plan_id");--> statement-breakpoint
CREATE INDEX "tier_change_log_triggered_at_idx" ON "tier_change_log" USING btree ("triggered_at");--> statement-breakpoint
CREATE INDEX "trade_executions_trade_idx" ON "trade_executions" USING btree ("trade_id");--> statement-breakpoint
CREATE INDEX "trade_executions_type_idx" ON "trade_executions" USING btree ("execution_type");--> statement-breakpoint
CREATE INDEX "trade_executions_date_idx" ON "trade_executions" USING btree ("execution_date");--> statement-breakpoint
CREATE INDEX "trade_tags_trade_idx" ON "trade_tags" USING btree ("trade_id");--> statement-breakpoint
CREATE INDEX "trade_tags_tag_idx" ON "trade_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "trades_account_idx" ON "trades" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "trades_asset_idx" ON "trades" USING btree ("asset");--> statement-breakpoint
CREATE INDEX "trades_entry_date_idx" ON "trades" USING btree ("entry_date");--> statement-breakpoint
CREATE INDEX "trades_outcome_idx" ON "trades" USING btree ("outcome");--> statement-breakpoint
CREATE INDEX "trades_strategy_idx" ON "trades" USING btree ("strategy_id");--> statement-breakpoint
CREATE INDEX "trades_timeframe_idx" ON "trades" USING btree ("timeframe_id");--> statement-breakpoint
CREATE INDEX "trades_dedup_hash_idx" ON "trades" USING btree ("deduplication_hash");--> statement-breakpoint
CREATE INDEX "idx_trades_account_archived_date" ON "trades" USING btree ("account_id","is_archived","entry_date");--> statement-breakpoint
CREATE INDEX "idx_trades_account_archived_outcome" ON "trades" USING btree ("account_id","is_archived","outcome");--> statement-breakpoint
CREATE INDEX "idx_trades_active_date" ON "trades" USING btree ("account_id","entry_date") WHERE is_archived = false;--> statement-breakpoint
CREATE INDEX "trading_accounts_user_idx" ON "trading_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trading_accounts_user_name_idx" ON "trading_accounts" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "trading_conditions_user_idx" ON "trading_conditions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trading_conditions_user_name_idx" ON "trading_conditions" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_tokens_idx" ON "verification_tokens" USING btree ("identifier","token");--> statement-breakpoint
CREATE INDEX "weekly_plan_month_idx" ON "weekly_plan" USING btree ("monthly_plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_plan_month_week_idx" ON "weekly_plan" USING btree ("monthly_plan_id","iso_week","iso_year");--> statement-breakpoint
CREATE INDEX "yearly_plans_account_idx" ON "yearly_plans" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "yearly_plans_account_year_idx" ON "yearly_plans" USING btree ("account_id","year");