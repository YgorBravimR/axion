-- Normalize asset symbols: WINFUT → WIN, WDOFUT → WDO
-- This migration:
-- 1. Normalizes all trade asset references first
-- 2. Remaps account_assets FKs to canonical asset IDs
-- 3. Renames or merges asset rows (with conflict handling)
-- 4. Clears stale deduplication hashes for migrated trades only

-- Step 1: Normalize all trades BEFORE touching assets table
UPDATE "trades" SET "asset" = 'WIN' WHERE "asset" = 'WINFUT';
UPDATE "trades" SET "asset" = 'WDO' WHERE "asset" = 'WDOFUT';

-- Step 2: Clear stale dedup hashes ONLY for trades that were migrated
-- We track these by checking asset IN ('WIN','WDO') with a hash that was
-- computed with the old symbol. Since we can't distinguish in SQL which hashes
-- were computed with WINFUT vs WIN, we clear all WIN/WDO hashes.
-- This is safe: new imports will recompute fresh hashes.
UPDATE "trades" SET "deduplication_hash" = NULL
WHERE "asset" IN ('WIN', 'WDO') AND "deduplication_hash" IS NOT NULL;

-- Step 3: Remap account_assets and rename/merge asset rows
DO $$
DECLARE
  old_id uuid;
  new_id uuid;
BEGIN
  -- Handle WINFUT → WIN
  SELECT id INTO old_id FROM "assets" WHERE "symbol" = 'WINFUT';
  SELECT id INTO new_id FROM "assets" WHERE "symbol" = 'WIN';

  IF old_id IS NOT NULL AND new_id IS NOT NULL THEN
    -- Both exist: remap account_assets from WINFUT to WIN, then delete WINFUT
    UPDATE "account_assets" SET "asset_id" = new_id, "updated_at" = now()
    WHERE "asset_id" = old_id
    AND NOT EXISTS (
      SELECT 1 FROM "account_assets" WHERE "asset_id" = new_id AND "account_id" = "account_assets"."account_id"
    );
    -- Delete any remaining WINFUT account_assets (where WIN config already exists)
    DELETE FROM "account_assets" WHERE "asset_id" = old_id;
    DELETE FROM "assets" WHERE "id" = old_id;
  ELSIF old_id IS NOT NULL AND new_id IS NULL THEN
    -- Only WINFUT exists: just rename it
    UPDATE "assets" SET "symbol" = 'WIN', "updated_at" = now() WHERE "id" = old_id;
  END IF;

  -- Handle WDOFUT → WDO
  SELECT id INTO old_id FROM "assets" WHERE "symbol" = 'WDOFUT';
  SELECT id INTO new_id FROM "assets" WHERE "symbol" = 'WDO';

  IF old_id IS NOT NULL AND new_id IS NOT NULL THEN
    UPDATE "account_assets" SET "asset_id" = new_id, "updated_at" = now()
    WHERE "asset_id" = old_id
    AND NOT EXISTS (
      SELECT 1 FROM "account_assets" WHERE "asset_id" = new_id AND "account_id" = "account_assets"."account_id"
    );
    DELETE FROM "account_assets" WHERE "asset_id" = old_id;
    DELETE FROM "assets" WHERE "id" = old_id;
  ELSIF old_id IS NOT NULL AND new_id IS NULL THEN
    UPDATE "assets" SET "symbol" = 'WDO', "updated_at" = now() WHERE "id" = old_id;
  END IF;
END $$;
