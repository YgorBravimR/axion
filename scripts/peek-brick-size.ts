import "dotenv/config"
import { DuckDBInstance } from "@duckdb/node-api"

const main = async () => {
	const instance = await DuckDBInstance.create(":memory:")
	const conn = await instance.connect()
	const reader = await conn.runAndReadAll(
		`SELECT column_name FROM (DESCRIBE SELECT * FROM 'data/parquet/candles/hawk_5m_win/WIN.parquet' LIMIT 1)
		 WHERE column_name LIKE '%brick%' OR column_name LIKE '%size%' OR column_name LIKE '%atr%' OR column_name LIKE '%range%'`
	)
	console.log("Matching cols:", reader.getRowObjects())

	const sample = await conn.runAndReadAll(
		`SELECT * FROM 'data/parquet/candles/hawk_5m_win/WIN.parquet' LIMIT 1`
	)
	console.log("All cols:", Object.keys(sample.getRowObjects()[0] ?? {}))
	process.exit(0)
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
