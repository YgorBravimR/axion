import { neon } from "@neondatabase/serverless"
import { readFileSync } from "fs"

const envContent = readFileSync(".env", "utf-8")
const url =
	envContent.match(/DATABASE_URL\s*=\s*['"]?([^'"\n]+)/)?.[1] ??
	process.env.DATABASE_URL!
const sql = neon(url)

interface SpacingRow {
	timestamp: string | Date
	open: number
	high: number
	low: number
	close: number
	pivot: string | null
}

const run = async () => {
	const day13 = (await sql`
		SELECT pc.timestamp, pc.open, pc.high, pc.low, pc.close,
		  indicators->>'topos_fundos' AS pivot
		FROM price_candles pc
		JOIN timeframes t ON t.id = pc.timeframe_id
		JOIN assets a ON a.id = pc.asset_id
		WHERE a.symbol = 'WIN' AND t.code = '5m'
			AND pc.timestamp >= '2026-05-13T12:00:00Z'
			AND pc.timestamp < '2026-05-13T14:00:00Z'
		ORDER BY timestamp
		LIMIT 60
	`) as SpacingRow[]
	console.log(`Rows between 09:00-11:00 BRT on 13/05 (count=${day13.length}):`)
	for (let i = 0; i < day13.length; i++) {
		const d = day13[i]!
		const t = new Date(d.timestamp)
		const brt = new Date(t.getTime() - 3 * 3600 * 1000)
			.toISOString()
			.slice(11, 19)
		const prevT = i > 0 ? new Date(day13[i - 1]!.timestamp) : null
		const gapMs = prevT ? t.getTime() - prevT.getTime() : 0
		console.log(
			`${i.toString().padStart(2)} brt=${brt} o=${d.open} h=${d.high} l=${d.low} c=${d.close} gap=${gapMs / 1000}s ${d.pivot ? `PIVOT=${d.pivot}` : ""}`
		)
	}
}
void run()
