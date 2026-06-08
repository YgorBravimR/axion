ALTER TABLE "price_data_versions" ADD COLUMN "first_candle_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "price_data_versions" ADD COLUMN "last_candle_at" timestamp with time zone;