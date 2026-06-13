import "dotenv/config"
import { DuckDBInstance } from "@duckdb/node-api"

const main = async () => {
	const instance = await DuckDBInstance.create(":memory:")
	const conn = await instance.connect()

	const reader = await conn.runAndReadAll(`
		WITH five AS (
			SELECT timestamp, close, macd1_histo AS m5_macd1, macd2_histo AS m5_macd2
			FROM 'data/parquet/candles/hawk_5m_win/WIN.parquet'
			WHERE timestamp >= TIMESTAMP '2026-05-29 12:00:00'
			  AND timestamp <  TIMESTAMP '2026-05-29 14:00:00'
		),
		fifteen AS (
			SELECT timestamp AS t15, macd1_histo AS m15_macd1, macd2_histo AS m15_macd2
			FROM 'data/parquet/candles/hawk_15m_win/WIN.parquet'
			WHERE timestamp >= TIMESTAMP '2026-05-29 11:00:00'
			  AND timestamp <  TIMESTAMP '2026-05-29 15:00:00'
		),
		sixty AS (
			SELECT timestamp AS t60, macd1_histo AS m60_macd1, macd2_histo AS m60_macd2
			FROM 'data/parquet/candles/hawk_60m_win/WIN.parquet'
			WHERE timestamp >= TIMESTAMP '2026-05-29 09:00:00'
			  AND timestamp <  TIMESTAMP '2026-05-29 15:00:00'
		)
		SELECT
			five.timestamp AS ts_5m,
			five.m5_macd1, five.m5_macd2,
			(SELECT MAX(t15) FROM fifteen WHERE t15 <= five.timestamp) AS ts_15m,
			(SELECT m15_macd1 FROM fifteen WHERE t15 = (SELECT MAX(t15) FROM fifteen WHERE t15 <= five.timestamp)) AS m15_macd1,
			(SELECT m15_macd2 FROM fifteen WHERE t15 = (SELECT MAX(t15) FROM fifteen WHERE t15 <= five.timestamp)) AS m15_macd2,
			(SELECT MAX(t60) FROM sixty WHERE t60 <= five.timestamp) AS ts_60m,
			(SELECT m60_macd1 FROM sixty WHERE t60 = (SELECT MAX(t60) FROM sixty WHERE t60 <= five.timestamp)) AS m60_macd1,
			(SELECT m60_macd2 FROM sixty WHERE t60 = (SELECT MAX(t60) FROM sixty WHERE t60 <= five.timestamp)) AS m60_macd2
		FROM five
		WHERE five.timestamp IN (
			TIMESTAMP '2026-05-29 12:03:12',
			TIMESTAMP '2026-05-29 12:15:02',
			TIMESTAMP '2026-05-29 12:30:03',
			TIMESTAMP '2026-05-29 13:00:00',
			TIMESTAMP '2026-05-29 13:30:00'
		)
		ORDER BY five.timestamp
	`)
	const rows = reader.getRowObjects()
	console.log(
		"ts_5m                | m5.macd1 m5.macd2 | m15.macd1 m15.macd2 | m60.macd1 m60.macd2"
	)
	for (const r of rows) {
		console.log(
			`${r.ts_5m} | ${r.m5_macd1} ${r.m5_macd2} | ${r.m15_macd1} ${r.m15_macd2} | ${r.m60_macd1} ${r.m60_macd2}`
		)
	}
	process.exit(0)
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
