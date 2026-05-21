CREATE TYPE "public"."strategy_methodology" AS ENUM('hawks', 'orb', 'dezk');--> statement-breakpoint
ALTER TABLE "strategies" ADD COLUMN "methodology" "strategy_methodology";--> statement-breakpoint
-- Backfill: mark strategies as Hawks methodology when any account currently
-- using them is in Hawks mode (matches the legacy `isHawksStrategy` heuristic
-- from getStrategyConditionsRollup, see src/app/actions/strategy-conditions.ts).
-- ORB/DezK have no production usage today, so they backfill to NULL.
UPDATE "strategies"
SET "methodology" = 'hawks'
WHERE "id" IN (
	SELECT DISTINCT "trades"."strategy_id"
	FROM "trades"
	INNER JOIN "account_modes"
		ON "account_modes"."account_id" = "trades"."account_id"
		AND "account_modes"."mode" = 'hawks'
		AND "account_modes"."deactivated_at" IS NULL
	WHERE "trades"."strategy_id" IS NOT NULL
);