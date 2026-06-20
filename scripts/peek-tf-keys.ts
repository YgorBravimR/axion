import "dotenv/config"
import { DuckDBInstance } from "@duckdb/node-api"

const FILES = [
	{ tf: "hawk_5m_win", path: "data/parquet/candles/hawk_5m_win/WIN.parquet" },
	{ tf: "hawk_15m_win", path: "data/parquet/candles/hawk_15m_win/WIN.parquet" },
	{ tf: "hawk_60m_win", path: "data/parquet/candles/hawk_60m_win/WIN.parquet" },
]

const main = async () => {
	const instance = await DuckDBInstance.create(":memory:")
	const conn = await instance.connect()

	for (const f of FILES) {
		const safePath = f.path.replace(/'/g, "''")
		// Get column names.
		const describeReader = await conn.runAndReadAll(
			`SELECT column_name FROM (DESCRIBE SELECT * FROM '${safePath}' LIMIT 1)`
		)
		const desc = describeReader.getRowObjects()
		const allCols = desc.map((r) => String(r.column_name))
		const indicatorCols = allCols.filter(
			(c) =>
				![
					"timestamp",
					"open",
					"high",
					"low",
					"close",
					"asset_id",
					"timeframe_id",
					"candle_index",
				].includes(c)
		)

		// Get one sample row (latest on 2026-05-29).
		const sampleReader = await conn.runAndReadAll(
			`SELECT * FROM '${safePath}'
			 WHERE timestamp >= TIMESTAMP '2026-05-29 12:00:00'
			   AND timestamp <  TIMESTAMP '2026-05-29 22:00:00'
			 ORDER BY timestamp DESC
			 LIMIT 1`
		)
		const sample = sampleReader.getRowObjects()[0]
		if (!sample) {
			console.log(`\n=== ${f.tf}: no rows in window ===`)
			continue
		}

		const emaish = indicatorCols.filter((c) =>
			/mme|ema|kc|vwap|macd|agr|volume/i.test(c)
		)
		console.log(`\n=== ${f.tf} ===`)
		console.log(
			`  total cols=${allCols.length}, indicator cols=${indicatorCols.length}`
		)
		console.log(`  sample timestamp = ${sample.timestamp}`)
		console.log(`  close = ${sample.close}`)
		console.log(`  ALL indicator cols: ${indicatorCols.join(", ")}`)
		console.log(`  EMA/KC/MACD/VWAP/AGR/VOL values:`)
		for (const k of emaish) {
			console.log(`    ${k} = ${sample[k]}`)
		}
	}
	process.exit(0)
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
