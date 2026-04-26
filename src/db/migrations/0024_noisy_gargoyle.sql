ALTER TYPE "public"."user_role" ADD VALUE 'premium' BEFORE 'trader';--> statement-breakpoint
ALTER TABLE "indicator_definitions" DROP CONSTRAINT "indicator_definitions_group_id_indicator_groups_id_fk";
--> statement-breakpoint
DROP INDEX "indicator_definitions_category_idx";--> statement-breakpoint
DROP INDEX "price_candles_unique_idx";--> statement-breakpoint
ALTER TABLE "indicator_definitions" ALTER COLUMN "group_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "indicator_definitions" ADD CONSTRAINT "indicator_definitions_group_id_indicator_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."indicator_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "price_candles_unique_idx" ON "price_candles" USING btree ("asset_id","timeframe_id","timestamp","candle_index");--> statement-breakpoint
ALTER TABLE "indicator_definitions" DROP COLUMN "category";