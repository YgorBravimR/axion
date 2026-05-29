import { neon } from "@neondatabase/serverless"
import { readFileSync } from "fs"

const envContent = readFileSync(".env", "utf-8")
const url =
	envContent.match(/DATABASE_URL\s*=\s*['"]?([^'"\n]+)/)?.[1] ??
	process.env.DATABASE_URL!
const sql = neon(url)

const run = async () => {
	const days = await sql`
		SELECT DATE(pc.timestamp - INTERVAL '3 hours') AS brt_day, COUNT(*) AS candle_count
		FROM price_candles pc
		JOIN timeframes t ON t.id = pc.timeframe_id
		JOIN assets a ON a.id = pc.asset_id
		WHERE a.symbol = 'WIN' AND t.code = '5m'
		GROUP BY brt_day
		ORDER BY brt_day DESC
		LIMIT 25
	`
	console.log("5m candle counts per BRT trading day:")
	for (const d of days) {
		console.log(d)
	}
	const may13Pivots = await sql`
		SELECT COUNT(*) AS pivot_count
		FROM price_candles pc
		JOIN timeframes t ON t.id = pc.timeframe_id
		JOIN assets a ON a.id = pc.asset_id
		WHERE a.symbol = 'WIN' AND t.code = '5m'
			AND DATE(pc.timestamp - INTERVAL '3 hours') = '2026-05-13'
			AND indicators ? 'topos_fundos'
	`
	console.log("13/05 BRT pivots:", may13Pivots)
}
void run()
