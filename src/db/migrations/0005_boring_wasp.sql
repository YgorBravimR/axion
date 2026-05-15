-- Add columns as nullable first for safe backfill
ALTER TABLE "trade_hawks_metadata" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "trade_hawks_metadata" ADD COLUMN "trading_day" date;--> statement-breakpoint

-- Backfill from parent trades table
UPDATE "trade_hawks_metadata" thm
SET
  account_id = t.account_id,
  trading_day = DATE_TRUNC('day', t.entry_date)::date
FROM "trades" t
WHERE thm.trade_id = t.id AND thm.account_id IS NULL;--> statement-breakpoint

-- Delete any orphaned rows (trades that were deleted)
DELETE FROM "trade_hawks_metadata" WHERE account_id IS NULL;--> statement-breakpoint

-- Add FK constraint
ALTER TABLE "trade_hawks_metadata" ADD CONSTRAINT "trade_hawks_metadata_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Add NOT NULL constraints
ALTER TABLE "trade_hawks_metadata" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "trade_hawks_metadata" ALTER COLUMN "trading_day" SET NOT NULL;--> statement-breakpoint

-- Create unique index to prevent race-condition duplicates
CREATE UNIQUE INDEX "thm_account_day_ordinal_idx" ON "trade_hawks_metadata" USING btree ("account_id","trading_day","daily_trade_ordinal");