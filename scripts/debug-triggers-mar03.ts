import "dotenv/config"
import { DuckDBInstance } from "@duckdb/node-api"

const main = async () => {
	const instance = await DuckDBInstance.create(":memory:")
	const conn = await instance.connect()
	// Pull just Mar 3 BRT (UTC = day + 3h)
	const reader = await conn.runAndReadAll(
		`SELECT timestamp, open, high, low, close, vwap_d, vwap_w, vwap_m, mme27_15m, mme55_15m, mme27_60m, mme55_60m
		 FROM 'data/parquet/candles/hawk_5m_win/WIN.parquet'
		 WHERE timestamp >= TIMESTAMP '2026-03-03 09:00:00' AND timestamp < TIMESTAMP '2026-03-04 00:00:00'
		 ORDER BY timestamp`
	)
	const rows = reader.getRowObjects() as Array<Record<string, number | string>>
	console.log(`Brick count: ${rows.length}`)
	// Median body
	const bodies = rows
		.map((r) => Math.abs((r.close as number) - (r.open as number)))
		.filter((b) => b > 0)
	bodies.sort((a, b) => a - b)
	const buf = Math.round(bodies[Math.floor(bodies.length / 2)] ?? 50)
	console.log(`Buffer (median body): ${buf}`)
	const approachBand = buf * 5
	console.log(`Approach band: ±${approachBand} (5 brick bodies)`)

	// Replicate state machine for vwap_d
	type SideTag = "fresh" | "broken"
	type State =
		| { name: "below"; tag: SideTag }
		| { name: "above"; tag: SideTag }
		| {
				name: "armed_from_below"
				archetype: "reversal" | "retest"
				countdown: number
				level: number
		  }
		| {
				name: "armed_from_above"
				archetype: "reversal" | "retest"
				countdown: number
				level: number
		  }
		| {
				name: "cooldown"
				side: "above" | "below"
				bricksLeft: number
				level: number
		  }
	let state: State = { name: "below", tag: "fresh" }
	let seeded = false
	let farBelowStreak = 0,
		farAboveStreak = 0
	let confirmAboveStreak = 0,
		confirmBelowStreak = 0
	const APPROACH_BRICKS = 3
	const RESOLUTION_BRICKS = 2
	const BREAK_CONFIRM_BRICKS = 3
	const COOLDOWN_BRICKS = 3
	const COOLDOWN_DISTANCE_MUL = 5
	let fires = 0
	let tagFlipCount = 0
	let armCount = 0
	for (let i = 0; i < rows.length; i++) {
		const c = rows[i]!
		const lv = c.vwap_d as number
		const level = lv
		const lo = level - buf
		const hi = level + buf
		if (!seeded) {
			state =
				(c.close as number) >= level
					? { name: "above", tag: "fresh" }
					: { name: "below", tag: "fresh" }
			seeded = true
		}
		const wasFarBelow = farBelowStreak
		const wasFarAbove = farAboveStreak
		const wasConfirmAbove = confirmAboveStreak
		const wasConfirmBelow = confirmBelowStreak
		farBelowStreak =
			(c.high as number) < level - approachBand ? farBelowStreak + 1 : 0
		farAboveStreak =
			(c.low as number) > level + approachBand ? farAboveStreak + 1 : 0
		if ((c.close as number) > hi) {
			confirmAboveStreak += 1
			confirmBelowStreak = 0
		} else if ((c.close as number) < lo) {
			confirmBelowStreak += 1
			confirmAboveStreak = 0
		} else {
			confirmAboveStreak = 0
			confirmBelowStreak = 0
		}

		if (state.name === "cooldown") {
			const isFarBelow =
				(c.high as number) < level - buf * COOLDOWN_DISTANCE_MUL
			const isFarAbove = (c.low as number) > level + buf * COOLDOWN_DISTANCE_MUL
			if (
				(state.side === "below" && isFarBelow) ||
				(state.side === "above" && isFarAbove)
			) {
				state = { ...state, bricksLeft: state.bricksLeft - 1 }
				if (state.bricksLeft <= 0) {
					state = { name: state.side, tag: "fresh" }
				}
			} else {
				state = { ...state, bricksLeft: COOLDOWN_BRICKS }
			}
		} else if (state.name === "below" || state.name === "above") {
			const onSide = state.name
			if (
				onSide === "below" &&
				wasConfirmBelow < BREAK_CONFIRM_BRICKS &&
				confirmBelowStreak >= BREAK_CONFIRM_BRICKS
			) {
				state = { name: "below", tag: "broken" }
				tagFlipCount++
				console.log(
					`[brick ${i}] vwap_d TAG FLIP → below/broken (close=${(c.close as number).toFixed(0)} level=${level.toFixed(0)})`
				)
			} else if (
				onSide === "above" &&
				wasConfirmAbove < BREAK_CONFIRM_BRICKS &&
				confirmAboveStreak >= BREAK_CONFIRM_BRICKS
			) {
				state = { name: "above", tag: "broken" }
				tagFlipCount++
				console.log(
					`[brick ${i}] vwap_d TAG FLIP → above/broken (close=${(c.close as number).toFixed(0)} level=${level.toFixed(0)})`
				)
			}
			const tag = state.tag
			if (state.name === "below") {
				const touched = (c.high as number) >= lo
				const approachOk =
					tag === "broken" ? true : wasFarBelow >= APPROACH_BRICKS
				if (touched && approachOk) {
					armCount++
					console.log(
						`[brick ${i}] vwap_d ARM (${tag === "broken" ? "retest" : "reversal"}) from below — wasFarBelow=${wasFarBelow}`
					)
					state = {
						name: "armed_from_below",
						archetype: tag === "broken" ? "retest" : "reversal",
						countdown: RESOLUTION_BRICKS,
						level,
					}
				}
			} else {
				const touched = (c.low as number) <= hi
				const approachOk =
					tag === "broken" ? true : wasFarAbove >= APPROACH_BRICKS
				if (touched && approachOk) {
					armCount++
					console.log(
						`[brick ${i}] vwap_d ARM (${tag === "broken" ? "retest" : "reversal"}) from above — wasFarAbove=${wasFarAbove}`
					)
					state = {
						name: "armed_from_above",
						archetype: tag === "broken" ? "retest" : "reversal",
						countdown: RESOLUTION_BRICKS,
						level,
					}
				}
			}
		} else if (state.name === "armed_from_below") {
			if ((c.close as number) < lo) {
				fires++
				console.log(
					`[brick ${i}] vwap_d FIRE rejection_short (${state.archetype})`
				)
				state = {
					name: "cooldown",
					side: "below",
					bricksLeft: COOLDOWN_BRICKS,
					level,
				}
			} else if ((c.close as number) > hi) {
				state = { name: "above", tag: "fresh" }
			} else {
				state = { ...state, countdown: state.countdown - 1 }
				if (state.countdown <= 0) {
					state =
						(c.close as number) >= level
							? { name: "above", tag: "fresh" }
							: { name: "below", tag: "fresh" }
				}
			}
		} else {
			if ((c.close as number) > hi) {
				fires++
				console.log(
					`[brick ${i}] vwap_d FIRE rejection_long (${state.archetype})`
				)
				state = {
					name: "cooldown",
					side: "above",
					bricksLeft: COOLDOWN_BRICKS,
					level,
				}
			} else if ((c.close as number) < lo) {
				state = { name: "below", tag: "fresh" }
			} else {
				state = { ...state, countdown: state.countdown - 1 }
				if (state.countdown <= 0) {
					state =
						(c.close as number) >= level
							? { name: "above", tag: "fresh" }
							: { name: "below", tag: "fresh" }
				}
			}
		}
	}
	console.log(
		`\nSummary vwap_d: tag flips=${tagFlipCount}, arms=${armCount}, fires=${fires}`
	)
	process.exit(0)
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
