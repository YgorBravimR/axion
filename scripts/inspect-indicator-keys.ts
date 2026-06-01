/**
 * inspect-indicator-keys.ts
 *
 * Dumps the union of keys present in price_candles.indicators across a
 * sample of WIN/5m bricks, plus per-key fill rate (non-null %).
 * Used to inventory what's actually stored so we can decide which keys
 * to clean up vs. keep.
 */
import "dotenv/config"
import { neon } from "@neondatabase/serverless"
import { isNeonUrl } from "@/db/url"
import postgres from "postgres"

const ASSET_SYMBOL = "WIN"
const TIMEFRAME_CODE = "5m"

const run = async () => {
	const url = process.env.DATABASE_URL
	if (!url) {
		throw new Error("DATABASE_URL missing")
	}
	const sql = isNeonUrl(url) ? neon(url) : postgres(url)

	const rows = (await sql`
		SELECT pc.indicators
		FROM price_candles pc
		JOIN timeframes t ON t.id = pc.timeframe_id
		JOIN assets a ON a.id = pc.asset_id
		WHERE a.symbol = ${ASSET_SYMBOL} AND t.code = ${TIMEFRAME_CODE}
		ORDER BY pc.timestamp DESC
		LIMIT 5000
	`) as { indicators: Record<string, unknown> }[]

	const counts = new Map<string, { total: number; nonNull: number }>()
	for (const row of rows) {
		const ind = row.indicators ?? {}
		for (const [k, v] of Object.entries(ind)) {
			const c = counts.get(k) ?? { total: 0, nonNull: 0 }
			c.total++
			if (v !== null && v !== undefined && v !== "") {
				c.nonNull++
			}
			counts.set(k, c)
		}
	}

	const totalRows = rows.length
	const sorted = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
	console.log(`Sample: ${totalRows} bricks`)
	console.log()
	console.log("KEY".padEnd(28) + "PRESENT  FILL%")
	console.log("─".repeat(50))
	for (const [k, c] of sorted) {
		const presentPct = ((c.total / totalRows) * 100).toFixed(1)
		const fillPct =
			c.total > 0 ? ((c.nonNull / c.total) * 100).toFixed(1) : "0.0"
		console.log(
			`${k.padEnd(28)}${presentPct.padStart(5)}%  ${fillPct.padStart(5)}%`
		)
	}

	if (!isNeonUrl(url)) {
		await (sql as ReturnType<typeof postgres>).end()
	}
}

run().then(() => process.exit(0))
