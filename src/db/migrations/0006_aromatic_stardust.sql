CREATE TABLE "strategy_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strategy_id" uuid NOT NULL,
	"version" integer NOT NULL,
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "strategy_conditions_unique_idx";--> statement-breakpoint
ALTER TABLE "strategies" ADD COLUMN "current_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "strategies" ADD COLUMN "next_version_number" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "strategy_conditions" ADD COLUMN "strategy_version_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "strategy_scenarios" ADD COLUMN "strategy_version_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "strategy_version_id" uuid;--> statement-breakpoint
ALTER TABLE "strategy_versions" ADD CONSTRAINT "strategy_versions_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "strategy_versions_strategy_idx" ON "strategy_versions" USING btree ("strategy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "strategy_versions_strategy_version_idx" ON "strategy_versions" USING btree ("strategy_id","version");--> statement-breakpoint
ALTER TABLE "strategy_conditions" ADD CONSTRAINT "strategy_conditions_strategy_version_id_strategy_versions_id_fk" FOREIGN KEY ("strategy_version_id") REFERENCES "public"."strategy_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_scenarios" ADD CONSTRAINT "strategy_scenarios_strategy_version_id_strategy_versions_id_fk" FOREIGN KEY ("strategy_version_id") REFERENCES "public"."strategy_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_strategy_version_id_strategy_versions_id_fk" FOREIGN KEY ("strategy_version_id") REFERENCES "public"."strategy_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "strategy_conditions_version_idx" ON "strategy_conditions" USING btree ("strategy_version_id");--> statement-breakpoint
CREATE INDEX "strategy_scenarios_version_idx" ON "strategy_scenarios" USING btree ("strategy_version_id");--> statement-breakpoint
CREATE INDEX "trades_strategy_version_idx" ON "trades" USING btree ("strategy_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "strategy_conditions_unique_idx" ON "strategy_conditions" USING btree ("strategy_version_id","condition_id");