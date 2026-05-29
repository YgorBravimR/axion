import { neon } from "@neondatabase/serverless"
import { readFileSync } from "fs"

const envContent = readFileSync(".env", "utf-8")
const url =
	envContent.match(/DATABASE_URL\s*=\s*['"]?([^'"\n]+)/)?.[1] ??
	process.env.DATABASE_URL!
const sql = neon(url)

const run = async () => {
	const result = await sql`
		SELECT
			COUNT(*) AS total,
			COUNT(*) FILTER (WHERE indicators ? 'topos_fundos') AS with_pivot,
			COUNT(*) FILTER (WHERE indicators ? 'prev_15m_open') AS with_p15,
			COUNT(*) FILTER (WHERE indicators ? 'prev_60m_open') AS with_p60
		FROM price_candles pc
		JOIN timeframes t ON t.id = pc.timeframe_id
		JOIN assets a ON a.id = pc.asset_id
		WHERE a.symbol = 'WIN' AND t.code = '5m'
	`
	console.log("Coverage:", result[0])
	const sample = await sql`
		SELECT timestamp,
		  indicators->>'topos_fundos' AS pivot,
		  indicators->>'prev_15m_open' AS p15o,
		  indicators->>'prev_15m_close' AS p15c,
		  indicators->>'mme27_15m' AS m27_15,
		  indicators->>'mme55_15m' AS m55_15,
		  indicators->>'prev_60m_open' AS p60o,
		  indicators->>'prev_60m_close' AS p60c,
		  indicators->>'mme27_60m' AS m27_60,
		  indicators->>'mme55_60m' AS m55_60
		FROM price_candles pc
		JOIN timeframes t ON t.id = pc.timeframe_id
		JOIN assets a ON a.id = pc.asset_id
		WHERE a.symbol = 'WIN' AND t.code = '5m'
			AND pc.timestamp >= '2026-05-13' AND pc.timestamp < '2026-05-14'
			AND indicators ? 'topos_fundos'
		ORDER BY timestamp
		LIMIT 15
	`
	console.log("13/05 pivots in chronological order:")
	for (const row of sample) {
		console.log(JSON.stringify(row))
	}
}
void run()
