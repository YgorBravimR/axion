import "dotenv/config"
import { DuckDBInstance } from "@duckdb/node-api"

const main = async () => {
	const instance = await DuckDBInstance.create(":memory:")
	const conn = await instance.connect()
	const reader = await conn.runAndReadAll(`
		WITH days AS (
			SELECT
				STRFTIME(timestamp - INTERVAL 3 HOUR, '%Y-%m-%d') AS day,
				SUM(CASE WHEN close > kc1_sup THEN 1 ELSE 0 END) AS above_kc1,
				SUM(CASE WHEN close < kc1_inf THEN 1 ELSE 0 END) AS below_kc1,
				SUM(CASE WHEN close > kc2_sup THEN 1 ELSE 0 END) AS above_kc2,
				SUM(CASE WHEN close < kc2_inf THEN 1 ELSE 0 END) AS below_kc2,
				COUNT(*) AS bricks
			FROM 'data/parquet/candles/hawk_5m_win/WIN.parquet'
			WHERE timestamp >= TIMESTAMP '2026-03-01'
			GROUP BY day
		)
		SELECT
			day,
			bricks,
			above_kc1 + below_kc1 AS kc1_pierces,
			above_kc2 + below_kc2 AS kc2_pierces,
			above_kc1, below_kc1, above_kc2, below_kc2
		FROM days
		WHERE bricks > 50
		ORDER BY (above_kc1 + below_kc1 + above_kc2 + below_kc2 * 5) DESC
		LIMIT 25
	`)
	const rows = reader.getRowObjects()
	console.log("day        | bricks | kc1+kc1 | kc2+kc2 | a1 b1 a2 b2")
	for (const r of rows) {
		console.log(
			`${r.day} | ${String(r.bricks).padStart(6)} | ${String(r.kc1_pierces).padStart(7)} | ${String(r.kc2_pierces).padStart(7)} | ${r.above_kc1} ${r.below_kc1} ${r.above_kc2} ${r.below_kc2}`
		)
	}
	process.exit(0)
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
