import "dotenv/config"
import { neon } from "@neondatabase/serverless"
import { isNeonUrl } from "@/db/url"
import postgres from "postgres"

type Row = Record<string, unknown>

const url = process.env.DATABASE_URL!
let exec: (_s: string) => Promise<Row[]>
if (isNeonUrl(url)) {
	const n = neon(url)
	exec = async (s) => (await n.query(s)) as Row[]
} else {
	const sql = postgres(url)
	exec = async (s) => (await sql.unsafe(s)) as Row[]
}

const main = async () => {
	const tfs = await exec(
		"SELECT code FROM timeframes WHERE code LIKE 'R%' ORDER BY code"
	)
	console.log("R-timeframes:", tfs.map((r) => r.code as string).join(", "))

	const v = await exec(
		"SELECT tf.code AS tf, pdv.row_count, pdv.first_candle_at::text AS first_at, pdv.last_candle_at::text AS last_at FROM price_data_versions pdv JOIN timeframes tf ON tf.id = pdv.timeframe_id JOIN assets a ON a.id = pdv.asset_id WHERE a.symbol='WIN' AND tf.code LIKE 'R%' ORDER BY (regexp_replace(tf.code, '^R', ''))::int"
	)
	console.log("price_data_versions (R*, WIN):", v.length, "rows")
	let totalRows = 0
	for (const r of v) {
		totalRows += Number(r.row_count)
		console.log(
			" ",
			String(r.tf).padEnd(5),
			String(r.row_count).padStart(7),
			" ",
			r.first_at,
			"→",
			r.last_at
		)
	}
	console.log("TOTAL raw candle rows:", totalRows)

	const rs = await exec(
		"SELECT COUNT(*)::int AS n, MAX(effective_date)::text AS max_date, MIN(effective_date)::text AS min_date FROM hawks_renko_sizes"
	)
	console.log("renko-sizes:", rs[0])

	const recent = await exec(
		"SELECT effective_date::text AS d, size_5m, size_15m, size_60m FROM hawks_renko_sizes WHERE effective_date >= '2026-06-15' ORDER BY effective_date DESC LIMIT 5"
	)
	console.log("recent renko rows:")
	for (const r of recent) {
		console.log(" ", r)
	}

	const mat = await exec(
		"SELECT 'hawk_5m_win' AS code, COUNT(*)::int AS n FROM hawk_5m_win UNION ALL SELECT 'hawk_15m_win', COUNT(*)::int FROM hawk_15m_win UNION ALL SELECT 'hawk_60m_win', COUNT(*)::int FROM hawk_60m_win"
	)
	console.log("materialized:")
	for (const r of mat) {
		console.log(" ", r.code, r.n)
	}

	process.exit(0)
}
main().catch((e) => {
	console.error(e)
	process.exit(1)
})
