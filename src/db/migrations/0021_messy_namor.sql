CREATE TYPE "public"."pivot_type" AS ENUM('topo', 'fundo');--> statement-breakpoint
CREATE TABLE "asset_pivots" (
	"asset_id" uuid NOT NULL,
	"timeframe_id" uuid NOT NULL,
	"confirmation_n" smallint NOT NULL,
	"brick_index" integer NOT NULL,
	"pivot_type" "pivot_type" NOT NULL,
	"pivot_price" numeric(20, 8) NOT NULL,
	"pivot_timestamp" timestamp with time zone NOT NULL,
	"algorithm_version" varchar(32) NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_pivots_asset_id_timeframe_id_confirmation_n_brick_index_pk" PRIMARY KEY("asset_id","timeframe_id","confirmation_n","brick_index"),
	CONSTRAINT "asset_pivots_confirmation_n_range" CHECK ("asset_pivots"."confirmation_n" between 1 and 6)
);
--> statement-breakpoint
ALTER TABLE "asset_pivots" ADD CONSTRAINT "asset_pivots_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_pivots" ADD CONSTRAINT "asset_pivots_timeframe_id_timeframes_id_fk" FOREIGN KEY ("timeframe_id") REFERENCES "public"."timeframes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_pivots_seq_idx" ON "asset_pivots" USING btree ("asset_id","timeframe_id","confirmation_n","brick_index");