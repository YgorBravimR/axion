import "dotenv/config"
import { DuckDBInstance } from "@duckdb/node-api"

const main = async () => {
	const instance = await DuckDBInstance.create(":memory:")
	const conn = await instance.connect()
	const reader = await conn.runAndReadAll(
		`SELECT MIN(mme27_15m) AS min_27_15, MAX(mme27_15m) AS max_27_15,
		        MIN(mme55_15m) AS min_55_15, MAX(mme55_15m) AS max_55_15,
		        MIN(mme27_60m) AS min_27_60, MAX(mme27_60m) AS max_27_60
		 FROM 'data/parquet/candles/hawk_5m_win/WIN.parquet'
		 WHERE timestamp >= TIMESTAMP '2026-05-29 09:00:00' AND timestamp < TIMESTAMP '2026-05-30 00:00:00'`
	)
	console.log(reader.getRowObjects())
	process.exit(0)
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
