ALTER TABLE "trading_accounts" ADD COLUMN "default_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "trading_accounts" ADD CONSTRAINT "trading_accounts_default_asset_id_assets_id_fk" FOREIGN KEY ("default_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "trading_accounts" ta SET "default_asset_id" = a."id" FROM "assets" a WHERE a."symbol" = ta."default_asset";--> statement-breakpoint
ALTER TABLE "trading_accounts" DROP COLUMN "default_asset";
