import "dotenv/config"
import { DuckDBInstance } from "@duckdb/node-api"

const main = async () => {
	const instance = await DuckDBInstance.create(":memory:")
	const conn = await instance.connect()
	for (const tf of ["hawk_5m_win", "hawk_15m_win", "hawk_60m_win"]) {
		const reader = await conn.runAndReadAll(
			`SELECT timestamp, vwap_d, vwap_w, vwap_m, close
			 FROM 'data/parquet/candles/${tf}/WIN.parquet'
			 WHERE timestamp >= TIMESTAMP '2026-05-29 09:00:00' AND timestamp <= TIMESTAMP '2026-05-29 22:00:00'
			 ORDER BY timestamp DESC LIMIT 5`
		)
		console.log(`\n=== ${tf} ===`)
		for (const r of reader.getRowObjects()) {
			console.log(
				`  ${r.timestamp} | vwap_d=${r.vwap_d} vwap_w=${r.vwap_w} vwap_m=${r.vwap_m} close=${r.close}`
			)
		}
	}
	process.exit(0)
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
