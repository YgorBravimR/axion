-- Backfill: ensure every strategy has a v1 row in strategy_versions.
-- No-op on a fresh DB (strategies table empty); catches any pre-existing rows.
INSERT INTO "strategy_versions" (
	"strategy_id",
	"version",
	"name",
	"description",
	"entry_criteria",
	"exit_criteria",
	"risk_rules",
	"stop_r",
	"partial_r",
	"partial_proportion",
	"final_r",
	"protection_r",
	"default_instrument_symbol",
	"max_risk_percent",
	"screenshot_url",
	"screenshot_s3_key",
	"notes"
)
SELECT
	s."id",
	1,
	s."name",
	s."description",
	s."entry_criteria",
	s."exit_criteria",
	s."risk_rules",
	s."stop_r",
	s."partial_r",
	s."partial_proportion",
	s."final_r",
	s."protection_r",
	s."default_instrument_symbol",
	s."max_risk_percent",
	s."screenshot_url",
	s."screenshot_s3_key",
	s."notes"
FROM "strategies" s
WHERE NOT EXISTS (
	SELECT 1 FROM "strategy_versions" sv
	WHERE sv."strategy_id" = s."id" AND sv."version" = 1
);
--> statement-breakpoint
-- Point any orphaned junction rows at v1.
UPDATE "strategy_conditions" sc
SET "strategy_version_id" = sv."id"
FROM "strategy_versions" sv
WHERE sv."strategy_id" = sc."strategy_id"
	AND sv."version" = 1
	AND sc."strategy_version_id" IS NULL;
--> statement-breakpoint
UPDATE "strategy_scenarios" ss
SET "strategy_version_id" = sv."id"
FROM "strategy_versions" sv
WHERE sv."strategy_id" = ss."strategy_id"
	AND sv."version" = 1
	AND ss."strategy_version_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "strategy_conditions" ALTER COLUMN "strategy_version_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "strategy_scenarios" ALTER COLUMN "strategy_version_id" SET NOT NULL;
