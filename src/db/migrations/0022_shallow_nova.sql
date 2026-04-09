CREATE TABLE "indicator_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(50) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"category" varchar(50) NOT NULL,
	"csv_header" varchar(100),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indicator_definitions_key_unique" UNIQUE("key")
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
ALTER TABLE "price_candles" ADD CONSTRAINT "price_candles_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_candles" ADD CONSTRAINT "price_candles_timeframe_id_timeframes_id_fk" FOREIGN KEY ("timeframe_id") REFERENCES "public"."timeframes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_data_versions" ADD CONSTRAINT "price_data_versions_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_data_versions" ADD CONSTRAINT "price_data_versions_timeframe_id_timeframes_id_fk" FOREIGN KEY ("timeframe_id") REFERENCES "public"."timeframes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "indicator_definitions_category_idx" ON "indicator_definitions" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "price_candles_unique_idx" ON "price_candles" USING btree ("asset_id","timeframe_id","timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "price_data_versions_unique_idx" ON "price_data_versions" USING btree ("asset_id","timeframe_id");--> statement-breakpoint
CREATE INDEX "price_candles_indicators_gin_idx" ON "price_candles" USING gin ("indicators");