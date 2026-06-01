/**
 * peek-aggression-sign.ts — sanity check the sign convention of
 * aggression_balance against the daily direction (close vs open).
 *
 * Hypothesis: positive aggression_balance correlates with up-moves
 * (buy pressure) and vice versa. If true, sign convention is buy-side.
 */
import "dotenv/config"
import { neon } from "@neondatabase/serverless"
import { isNeonUrl } from "@/db/url"
import postgres from "postgres"

const ASSET_SYMBOL = "WIN"

const run = async () => {
	const url = process.env.DATABASE_URL
	if (!url) {
		throw new Error("DATABASE_URL missing")
	}
	const sql = isNeonUrl(url) ? neon(url) : postgres(url)

	const rows = (await sql`
		SELECT pc.timestamp, pc.open, pc.close,
		       (pc.indicators->>'aggression_balance')::numeric AS agg
		FROM price_candles pc
		JOIN timeframes t ON t.id = pc.timeframe_id
		JOIN assets a ON a.id = pc.asset_id
		WHERE a.symbol = ${ASSET_SYMBOL} AND t.code = '5m'
		ORDER BY pc.timestamp DESC
		LIMIT 5000
	`) as { timestamp: string; open: string; close: string; agg: string }[]

	let bullishBricks = 0
	let bearishBricks = 0
	let aggPosCloseUp = 0
	let aggPosCloseDn = 0
	let aggNegCloseUp = 0
	let aggNegCloseDn = 0
	const aggs: number[] = []

	for (const r of rows) {
		const o = Number(r.open)
		const c = Number(r.close)
		const a = Number(r.agg)
		if (!Number.isFinite(a)) {
			continue
		}
		aggs.push(a)
		const up = c > o
		const dn = c < o
		if (up) {
			bullishBricks++
		}
		if (dn) {
			bearishBricks++
		}
		if (a > 0 && up) {
			aggPosCloseUp++
		}
		if (a > 0 && dn) {
			aggPosCloseDn++
		}
		if (a < 0 && up) {
			aggNegCloseUp++
		}
		if (a < 0 && dn) {
			aggNegCloseDn++
		}
	}

	aggs.sort((x, y) => x - y)
	const p = (q: number) => aggs[Math.floor((aggs.length - 1) * q)]

	console.log(`Sample bricks: ${rows.length}`)
	console.log()
	console.log("aggression_balance distribution (5000 most-recent 5m bricks):")
	console.log(`  min     = ${p(0)}`)
	console.log(`  p10     = ${p(0.1)}`)
	console.log(`  median  = ${p(0.5)}`)
	console.log(`  p90     = ${p(0.9)}`)
	console.log(`  max     = ${p(1)}`)
	console.log(
		`  |agg|>10K  ${aggs.filter((a) => Math.abs(a) > 10000).length} bricks (${((aggs.filter((a) => Math.abs(a) > 10000).length / aggs.length) * 100).toFixed(1)}%)`
	)
	console.log(
		`  |agg|>15K  ${aggs.filter((a) => Math.abs(a) > 15000).length} bricks (${((aggs.filter((a) => Math.abs(a) > 15000).length / aggs.length) * 100).toFixed(1)}%)`
	)
	console.log(
		`  |agg|>20K  ${aggs.filter((a) => Math.abs(a) > 20000).length} bricks (${((aggs.filter((a) => Math.abs(a) > 20000).length / aggs.length) * 100).toFixed(1)}%)`
	)
	console.log()
	console.log("Sign correlation with brick direction (close vs open):")
	console.log(`  agg>0 + close>open (up):    ${aggPosCloseUp}`)
	console.log(`  agg>0 + close<open (down):  ${aggPosCloseDn}`)
	console.log(`  agg<0 + close>open (up):    ${aggNegCloseUp}`)
	console.log(`  agg<0 + close<open (down):  ${aggNegCloseDn}`)
	console.log()
	const agreePos = aggPosCloseUp + aggNegCloseDn // agg>0+up OR agg<0+down
	const disagreePos = aggPosCloseDn + aggNegCloseUp
	console.log(
		`  HYPOTHESIS A (agg>0 = buy pressure): agree ${agreePos}, disagree ${disagreePos}, ` +
			`ratio ${(agreePos / Math.max(disagreePos, 1)).toFixed(2)}`
	)
}

run().then(() => process.exit(0))
