-- Seed Renko-calibrated timeframes for the Renko-native pipeline.
-- Each row is a stable identifier; the actual brick size for a given ISO week
-- is read from hawks_renko_sizes.size_{5m,15m,60m}. The `value` column stores
-- the calibration label (5/15/60) for human display; `unit = points` reflects
-- that the actual size is points-based once resolved per week.
INSERT INTO "timeframes" ("id", "code", "name", "type", "value", "unit", "sort_order", "is_active") VALUES
	(gen_random_uuid(), 'renko-5m-cal', 'Renko (5m calibrated)', 'renko', 5, 'points', 10, true),
	(gen_random_uuid(), 'renko-15m-cal', 'Renko (15m calibrated)', 'renko', 15, 'points', 11, true),
	(gen_random_uuid(), 'renko-60m-cal', 'Renko (60m calibrated)', 'renko', 60, 'points', 12, true)
ON CONFLICT ("code") DO UPDATE SET
	"name" = EXCLUDED."name",
	"sort_order" = EXCLUDED."sort_order",
	"is_active" = EXCLUDED."is_active";
