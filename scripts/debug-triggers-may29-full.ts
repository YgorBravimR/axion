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
	const bodies = rows
		.map((r) => Math.abs((r.close as number) - (r.open as number)))
		.filter((b) => b > 0)
	bodies.sort((a, b) => a - b)
	const buf = Math.round(bodies[Math.floor(bodies.length / 2)] ?? 50)
	console.log(`Buffer: ${buf}, brick count: ${rows.length}`)

	const APPROACH_BRICKS = 3
	const RESOLUTION_BRICKS = 2
	const BREAK_CONFIRM_BRICKS = 3
	const COOLDOWN_BRICKS = 3
	const COOLDOWN_DISTANCE_MUL = 5
	const APPROACH_DISTANCE_MUL = 5
	const RETEST_TRAVEL_MUL = 3
	const approachBand = buf * APPROACH_DISTANCE_MUL
	type SideTag = "fresh" | "broken_pending" | "broken"
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
	let fires = 0,
		arms = 0,
		tagFlips = 0

	for (let i = 0; i < rows.length; i++) {
		const c = rows[i]!
		const level = c.vwap_d as number
		const lo = level - buf,
			hi = level + buf
		if (!seeded) {
			state =
				(c.close as number) >= level
					? { name: "above", tag: "fresh" }
					: { name: "below", tag: "fresh" }
			seeded = true
		}
		const wasFarBelow = farBelowStreak,
			wasFarAbove = farAboveStreak
		const wasConfirmAbove = confirmAboveStreak,
			wasConfirmBelow = confirmBelowStreak
		farBelowStreak =
			(c.high as number) < level - approachBand ? farBelowStreak + 1 : 0
		farAboveStreak =
			(c.low as number) > level + approachBand ? farAboveStreak + 1 : 0
		if ((c.close as number) > hi) {
			confirmAboveStreak++
			confirmBelowStreak = 0
		} else if ((c.close as number) < lo) {
			confirmBelowStreak++
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
				state.tag === "fresh" &&
				wasConfirmBelow < BREAK_CONFIRM_BRICKS &&
				confirmBelowStreak >= BREAK_CONFIRM_BRICKS
			) {
				state = { name: "below", tag: "broken_pending" }
				tagFlips++
				console.log(
					`[${i}] BREAK below pending @ close=${(c.close as number).toFixed(0)} level=${level.toFixed(0)}`
				)
			} else if (
				onSide === "above" &&
				state.tag === "fresh" &&
				wasConfirmAbove < BREAK_CONFIRM_BRICKS &&
				confirmAboveStreak >= BREAK_CONFIRM_BRICKS
			) {
				state = { name: "above", tag: "broken_pending" }
				tagFlips++
				console.log(
					`[${i}] BREAK above pending @ close=${(c.close as number).toFixed(0)} level=${level.toFixed(0)}`
				)
			}
			if (state.name === "below" && state.tag === "broken_pending") {
				const travelTarget = level - buf * RETEST_TRAVEL_MUL
				if ((c.low as number) <= travelTarget) {
					state = { name: "below", tag: "broken" }
					console.log(`[${i}]   broken_pending → broken (travel ok)`)
				} else if ((c.close as number) >= lo) {
					state = { name: "below", tag: "fresh" }
					console.log(`[${i}]   broken_pending → fresh (fake break)`)
				}
			} else if (state.name === "above" && state.tag === "broken_pending") {
				const travelTarget = level + buf * RETEST_TRAVEL_MUL
				if ((c.high as number) >= travelTarget) {
					state = { name: "above", tag: "broken" }
					console.log(`[${i}]   broken_pending → broken (travel ok)`)
				} else if ((c.close as number) <= hi) {
					state = { name: "above", tag: "fresh" }
					console.log(`[${i}]   broken_pending → fresh (fake break)`)
				}
			}
			const tag = state.tag
			if (state.name === "below") {
				const touched = (c.high as number) >= lo
				if (touched && tag === "broken") {
					arms++
					console.log(`[${i}] ARM retest from below`)
					state = {
						name: "armed_from_below",
						archetype: "retest",
						countdown: RESOLUTION_BRICKS,
						level,
					}
				} else if (
					touched &&
					tag === "fresh" &&
					wasFarBelow >= APPROACH_BRICKS
				) {
					arms++
					console.log(`[${i}] ARM reversal from below`)
					state = {
						name: "armed_from_below",
						archetype: "reversal",
						countdown: RESOLUTION_BRICKS,
						level,
					}
				}
			} else {
				const touched = (c.low as number) <= hi
				if (touched && tag === "broken") {
					arms++
					console.log(`[${i}] ARM retest from above`)
					state = {
						name: "armed_from_above",
						archetype: "retest",
						countdown: RESOLUTION_BRICKS,
						level,
					}
				} else if (
					touched &&
					tag === "fresh" &&
					wasFarAbove >= APPROACH_BRICKS
				) {
					arms++
					console.log(`[${i}] ARM reversal from above`)
					state = {
						name: "armed_from_above",
						archetype: "reversal",
						countdown: RESOLUTION_BRICKS,
						level,
					}
				}
			}
		} else if (state.name === "armed_from_below") {
			if ((c.close as number) < lo) {
				fires++
				console.log(`[${i}] FIRE rejection_short (${state.archetype})`)
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
				console.log(`[${i}] FIRE rejection_long (${state.archetype})`)
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
		`\nvwap_d totals on May 29: tagFlips=${tagFlips} arms=${arms} fires=${fires}`
	)
	process.exit(0)
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
