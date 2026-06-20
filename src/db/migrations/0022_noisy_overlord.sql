-- Asset-tag hawks_renko_sizes so WIN and WDO triples don't collide.
-- Expand-contract: add NULLable, backfill all existing rows to WIN, then
-- enforce NOT NULL + swap unique index from (effective_date) to
-- (asset_id, effective_date). The CSV at data/hawks/renko-sizes.csv is
-- WIN-only today, so every existing row gets WIN's asset_id; if/when
-- WDO ships, the importer accepts an assetSymbol arg.

ALTER TABLE "hawks_renko_sizes" DROP CONSTRAINT "hawks_renko_sizes_effective_date_unique";--> statement-breakpoint
DROP INDEX "hawks_renko_sizes_date_idx";--> statement-breakpoint
ALTER TABLE "hawks_renko_sizes" ADD COLUMN "asset_id" uuid;--> statement-breakpoint
UPDATE "hawks_renko_sizes"
SET "asset_id" = (SELECT "id" FROM "assets" WHERE "symbol" = 'WIN' LIMIT 1)
WHERE "asset_id" IS NULL;--> statement-breakpoint
ALTER TABLE "hawks_renko_sizes" ALTER COLUMN "asset_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "hawks_renko_sizes" ADD CONSTRAINT "hawks_renko_sizes_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hawks_renko_sizes_asset_date_idx" ON "hawks_renko_sizes" USING btree ("asset_id","effective_date");
