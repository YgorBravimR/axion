import "dotenv/config"
import { neon } from "@neondatabase/serverless"
import postgres from "postgres"
import { isNeonUrl } from "@/db/url"

const run = async () => {
	const databaseUrl = process.env.DATABASE_URL
	if (!databaseUrl) {
		console.error("DATABASE_URL missing")
		process.exit(1)
	}
	const sql = isNeonUrl(databaseUrl) ? neon(databaseUrl) : postgres(databaseUrl)

	const counts = (await sql`
		SELECT tf.code AS timeframe, COUNT(*)::int AS n
		FROM price_candles pc
		JOIN timeframes tf ON tf.id = pc.timeframe_id
		JOIN assets a ON a.id = pc.asset_id
		WHERE a.symbol = 'WIN'
		GROUP BY tf.code
		ORDER BY tf.code
	`) as { timeframe: string; n: number }[]
	console.log("price_candles row counts by timeframe:")
	for (const r of counts) {
		console.log(`  ${r.timeframe}: ${r.n}`)
	}

	const sample = (await sql`
		SELECT pc."timestamp", pc.open, pc.close, pc.indicators
		FROM price_candles pc
		JOIN timeframes tf ON tf.id = pc.timeframe_id
		JOIN assets a ON a.id = pc.asset_id
		WHERE a.symbol = 'WIN' AND tf.code = '5m'
		ORDER BY pc."timestamp" DESC
		LIMIT 1
	`) as {
		timestamp: string
		open: string
		close: string
		indicators: Record<string, number>
	}[]

	if (sample.length === 0) {
		console.error("NO 5m sample row found")
		process.exit(1)
	}
	const s = sample[0]!
	console.log("\nLatest 5m candle sample:")
	console.log(`  timestamp: ${s.timestamp}`)
	console.log(`  open=${s.open} close=${s.close}`)
	console.log(
		`  indicator keys: ${Object.keys(s.indicators).sort().join(", ")}`
	)
	console.log("  full indicators object:")
	console.log(JSON.stringify(s.indicators, null, 2))

	const renkoCount = (await sql`
		SELECT COUNT(*)::int AS n FROM hawks_renko_sizes
	`) as { n: number }[]
	console.log(`\nhawks_renko_sizes rows: ${renkoCount[0]!.n}`)

	const renkoSample = (await sql`
		SELECT effective_date, week_number, size_5m, size_15m, size_60m
		FROM hawks_renko_sizes
		ORDER BY effective_date DESC
		LIMIT 3
	`) as {
		effective_date: string
		week_number: number
		size_5m: number
		size_15m: number
		size_60m: number
	}[]
	console.log("most recent 3 renko-size rows:")
	for (const r of renkoSample) {
		console.log(
			`  ${r.effective_date} wk${r.week_number}: 5m=${r.size_5m} 15m=${r.size_15m} 60m=${r.size_60m}`
		)
	}

	if (!isNeonUrl(databaseUrl)) {
		await (sql as ReturnType<typeof postgres>).end()
	}
}

run().catch((err) => {
	console.error(err)
	process.exit(1)
})
