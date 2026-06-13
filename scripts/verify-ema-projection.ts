import "dotenv/config"
import { DuckDBInstance } from "@duckdb/node-api"

const main = async () => {
	const instance = await DuckDBInstance.create(":memory:")
	const conn = await instance.connect()

	// For a few timestamps on 2026-05-29, compare:
	//   5m.mme27_15m  vs  the 15m row that CONTAINS that 5m brick's timestamp.ema27
	const out = await conn.runAndReadAll(`
		WITH five AS (
			SELECT timestamp, mme27_15m, mme55_15m, prev_15m_open, prev_15m_close
			FROM 'data/parquet/candles/hawk_5m_win/WIN.parquet'
			WHERE timestamp >= TIMESTAMP '2026-05-29 12:00:00'
			  AND timestamp <  TIMESTAMP '2026-05-29 15:00:00'
		),
		fifteen AS (
			SELECT timestamp AS t15, ema27 AS ema27_15, ema55 AS ema55_15, open AS o15, close AS c15
			FROM 'data/parquet/candles/hawk_15m_win/WIN.parquet'
			WHERE timestamp >= TIMESTAMP '2026-05-29 11:00:00'
			  AND timestamp <  TIMESTAMP '2026-05-29 16:00:00'
		)
		SELECT
			five.timestamp AS ts_5m,
			five.mme27_15m AS proj_27,
			five.mme55_15m AS proj_55,
			five.prev_15m_open AS prev_o,
			five.prev_15m_close AS prev_c,
			(SELECT MAX(t15) FROM fifteen WHERE t15 <= five.timestamp) AS containing_15m_close_ts,
			(SELECT ema27_15 FROM fifteen WHERE t15 = (SELECT MAX(t15) FROM fifteen WHERE t15 <= five.timestamp)) AS native_27,
			(SELECT ema55_15 FROM fifteen WHERE t15 = (SELECT MAX(t15) FROM fifteen WHERE t15 <= five.timestamp)) AS native_55,
			(SELECT o15 FROM fifteen WHERE t15 = (SELECT MAX(t15) FROM fifteen WHERE t15 <= five.timestamp)) AS native_o,
			(SELECT c15 FROM fifteen WHERE t15 = (SELECT MAX(t15) FROM fifteen WHERE t15 <= five.timestamp)) AS native_c
		FROM five
		ORDER BY five.timestamp
		LIMIT 30
	`)
	for (const r of out.getRowObjects()) {
		const proj27 = Number(r.proj_27)
		const native27 = Number(r.native_27)
		const delta = proj27 - native27
		console.log(
			`5m=${r.ts_5m} | proj27=${proj27} vs native27=${native27} (Δ=${delta.toFixed(2)}) | prev_o=${r.prev_o} prev_c=${r.prev_c} | 15m_close@${r.containing_15m_close_ts} native_o=${r.native_o} native_c=${r.native_c}`
		)
	}
	process.exit(0)
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
