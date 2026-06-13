import "dotenv/config"
import { DuckDBInstance } from "@duckdb/node-api"

const main = async () => {
	const instance = await DuckDBInstance.create(":memory:")
	const conn = await instance.connect()
	// Pull the 5m bricks of the target day with all 8 trigger levels
	const reader = await conn.runAndReadAll(
		`SELECT timestamp, open, high, low, close,
		        vwap_d, vwap_w, vwap_m,
		        mme27_15m, mme55_15m, mme27_60m, mme55_60m
		 FROM 'data/parquet/candles/hawk_5m_win/WIN.parquet'
		 WHERE timestamp >= TIMESTAMP '2026-05-29 09:00:00' AND timestamp < TIMESTAMP '2026-05-30 00:00:00'
		 ORDER BY timestamp`
	)
	const rows = reader.getRowObjects() as Array<Record<string, number | string>>
	console.log(`Target day 5m bricks: ${rows.length}`)
	// Catalog markers were at #3399-#3502 in the 20-day view → those are bricks in the target day.
	// Target day starts at index (20 days × ~200 bricks/day) ≈ 3400 in the 20-day window.
	// To find which target-day bricks match, just print all OHLC for target day.
	// And include ajuste from session_anchors? We know from earlier ajuste exists.
	// Print the last 100 bricks of the target day with price + all levels
	const startIdx = Math.max(0, rows.length - 110)
	for (let i = startIdx; i < rows.length; i++) {
		const c = rows[i]!
		console.log(
			`t${i.toString().padStart(3, "0")}: ` +
				`O=${(c.open as number).toFixed(0)} H=${(c.high as number).toFixed(0)} L=${(c.low as number).toFixed(0)} C=${(c.close as number).toFixed(0)} | ` +
				`vD=${(c.vwap_d as number).toFixed(0)} vW=${(c.vwap_w as number).toFixed(0)} vM=${(c.vwap_m as number).toFixed(0)} | ` +
				`27_15=${(c.mme27_15m as number).toFixed(0)} 55_15=${(c.mme55_15m as number).toFixed(0)} 27_60=${(c.mme27_60m as number).toFixed(0)} 55_60=${(c.mme55_60m as number).toFixed(0)}`
		)
	}
	process.exit(0)
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
