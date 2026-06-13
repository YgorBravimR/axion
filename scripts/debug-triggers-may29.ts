import "dotenv/config"
import { DuckDBInstance } from "@duckdb/node-api"

const main = async () => {
	const instance = await DuckDBInstance.create(":memory:")
	const conn = await instance.connect()
	const reader = await conn.runAndReadAll(
		`SELECT timestamp, open, high, low, close, vwap_d
		 FROM 'data/parquet/candles/hawk_5m_win/WIN.parquet'
		 WHERE timestamp >= TIMESTAMP '2026-05-29 09:00:00' AND timestamp < TIMESTAMP '2026-05-30 00:00:00'
		 ORDER BY timestamp`
	)
	const rows = reader.getRowObjects() as Array<Record<string, number | string>>
	console.log(`Brick count: ${rows.length}`)
	const bodies = rows
		.map((r) => Math.abs((r.close as number) - (r.open as number)))
		.filter((b) => b > 0)
	bodies.sort((a, b) => a - b)
	const buf = Math.round(bodies[Math.floor(bodies.length / 2)] ?? 50)
	console.log(`Buffer: ${buf}`)
	const fires = 0
	const arms = 0
	for (let i = 0; i < rows.length; i++) {
		const c = rows[i]!
		console.log(
			`brick ${i}: O=${(c.open as number).toFixed(0)} H=${(c.high as number).toFixed(0)} L=${(c.low as number).toFixed(0)} C=${(c.close as number).toFixed(0)} vwap_d=${(c.vwap_d as number).toFixed(0)} (${((c.close as number) - (c.vwap_d as number)).toFixed(0)} from)`
		)
		if (i > 60) {
			break
		}
	}
	console.log(`arms=${arms}, fires=${fires}`)
	process.exit(0)
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
