CREATE TYPE "public"."enrichment_pass_status" AS ENUM('skipped', 'succeeded', 'failed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."enrichment_status" AS ENUM('pending', 'partial', 'enriched');--> statement-breakpoint
CREATE TYPE "public"."snapshot_status" AS ENUM('draft', 'committed', 'abandoned');--> statement-breakpoint
CREATE TABLE "trade_enrichment_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trade_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"dry_run_output" jsonb NOT NULL,
	"accepted_fields" text[],
	"rejected_fields" text[],
	"enriched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enrichment_engine_version" varchar(32) NOT NULL,
	"candle_data_loaded_at" timestamp with time zone,
	"status" "snapshot_status" DEFAULT 'draft' NOT NULL,
	"run_id" uuid NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "enrichment_status" "enrichment_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "enrichment_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "enriched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "enrichment_ops_status" "enrichment_pass_status";--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "enrichment_candle_status" "enrichment_pass_status";--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "enrichment_indicator_status" "enrichment_pass_status";--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "enrichment_sl_target_status" "enrichment_pass_status";--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "indicator_readout" jsonb;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "profit_operation_number" integer;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "profit_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "trade_enrichment_snapshots" ADD CONSTRAINT "trade_enrichment_snapshots_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trade_enrichment_snapshots_trade_idx" ON "trade_enrichment_snapshots" USING btree ("trade_id");--> statement-breakpoint
CREATE INDEX "trade_enrichment_snapshots_trade_version_idx" ON "trade_enrichment_snapshots" USING btree ("trade_id","version");--> statement-breakpoint
CREATE INDEX "trade_enrichment_snapshots_run_idx" ON "trade_enrichment_snapshots" USING btree ("run_id","status");--> statement-breakpoint
CREATE INDEX "trade_enrichment_snapshots_status_expiry_idx" ON "trade_enrichment_snapshots" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "trades_enrichment_status_idx" ON "trades" USING btree ("enrichment_status");--> statement-breakpoint
CREATE INDEX "trades_profit_operation_number_idx" ON "trades" USING btree ("account_id","entry_date","profit_operation_number");