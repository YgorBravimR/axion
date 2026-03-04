CREATE TYPE "public"."condition_category" AS ENUM('indicator', 'price_action', 'market_context', 'custom');--> statement-breakpoint
CREATE TYPE "public"."condition_tier" AS ENUM('mandatory', 'tier_2', 'tier_3');--> statement-breakpoint
CREATE TYPE "public"."setup_rank" AS ENUM('A', 'AA', 'AAA');--> statement-breakpoint
CREATE TABLE "scenario_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scenario_id" uuid NOT NULL,
	"url" varchar(500) NOT NULL,
	"s3_key" varchar(500) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
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
ALTER TABLE "strategies" ADD COLUMN "screenshot_s3_key" varchar(500);--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "setup_rank" "setup_rank";--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "screenshot_url" varchar(500);--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "screenshot_s3_key" varchar(500);--> statement-breakpoint
ALTER TABLE "scenario_images" ADD CONSTRAINT "scenario_images_scenario_id_strategy_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."strategy_scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_conditions" ADD CONSTRAINT "strategy_conditions_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_conditions" ADD CONSTRAINT "strategy_conditions_condition_id_trading_conditions_id_fk" FOREIGN KEY ("condition_id") REFERENCES "public"."trading_conditions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_scenarios" ADD CONSTRAINT "strategy_scenarios_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_conditions" ADD CONSTRAINT "trading_conditions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scenario_images_scenario_idx" ON "scenario_images" USING btree ("scenario_id");--> statement-breakpoint
CREATE INDEX "strategy_conditions_strategy_idx" ON "strategy_conditions" USING btree ("strategy_id");--> statement-breakpoint
CREATE INDEX "strategy_conditions_condition_idx" ON "strategy_conditions" USING btree ("condition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "strategy_conditions_unique_idx" ON "strategy_conditions" USING btree ("strategy_id","condition_id");--> statement-breakpoint
CREATE INDEX "strategy_scenarios_strategy_idx" ON "strategy_scenarios" USING btree ("strategy_id");--> statement-breakpoint
CREATE INDEX "trading_conditions_user_idx" ON "trading_conditions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trading_conditions_user_name_idx" ON "trading_conditions" USING btree ("user_id","name");