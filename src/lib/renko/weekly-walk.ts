/**
 * Multi-week Renko generator.
 *
 * Walks chronologically-sorted 1m OHLC bars and emits Renko bricks while
 * honoring per-ISO-week brick sizes from `hawksRenkoSizes`. The R can
 * change every Monday; on each change we **hard-reset** the brick chain
 * (new anchor at the first bar of the new week's open). Hard reset is
 * the conservative choice — it costs a handful of bricks at each
 * boundary but is simple, explainable, and matches how the desk
 * historically reads ProfitChart Renkos (each week is "its own series").
 *
 * Caller supplies `sizeByEffectiveDate`: a Map keyed by the Monday-anchor
 * YYYY-MM-DD string of each ISO week. We pick the most recent entry
 * with effectiveDate ≤ bar.timestamp; bars before the earliest entry
 * are dropped (no R to use → can't generate a brick).
 */

import {
	generateRenkoBricks,
	type RawBar,
	type RenkoBrick,
} from "@/lib/renko/brick-generator"

interface WeeklyWalkOptions {
	/** Map from "YYYY-MM-DD" (Monday) → brick size R. */
	readonly sizeByEffectiveDate: ReadonlyMap<string, number>
}

interface WeeklyWalkResult {
	readonly bricks: RenkoBrick[]
	readonly warnings: string[]
	/** Bars dropped because no R entry covered their date. */
	readonly droppedBarsBeforeFirstSize: number
}

/**
 * ISO-week Monday anchor (UTC) for a given Date, formatted as YYYY-MM-DD.
 * ISO weeks start Monday. For Sunday we go back 6 days.
 */
const isoWeekMondayKey = (d: Date): string => {
	const date = new Date(
		Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
	)
	const day = date.getUTCDay() // 0..6 (Sun..Sat)
	const offset = day === 0 ? -6 : 1 - day
	date.setUTCDate(date.getUTCDate() + offset)
	const y = date.getUTCFullYear().toString().padStart(4, "0")
	const m = (date.getUTCMonth() + 1).toString().padStart(2, "0")
	const dd = date.getUTCDate().toString().padStart(2, "0")
	return `${y}-${m}-${dd}`
}

/**
 * Pick the brick size for a given bar by finding the most recent
 * effectiveDate ≤ bar's ISO-week Monday. Returns null if none qualifies.
 */
const pickSizeForBar = (
	bar: RawBar,
	sortedKeys: readonly string[],
	sizes: ReadonlyMap<string, number>
): { key: string; size: number } | null => {
	const wk = isoWeekMondayKey(bar.timestamp)
	// Binary search for the largest key ≤ wk.
	let lo = 0
	let hi = sortedKeys.length - 1
	let pick = -1
	while (lo <= hi) {
		const mid = (lo + hi) >>> 1
		const k = sortedKeys[mid]!
		if (k <= wk) {
			pick = mid
			lo = mid + 1
		} else {
			hi = mid - 1
		}
	}
	if (pick < 0) {
		return null
	}
	const key = sortedKeys[pick]!
	return { key, size: sizes.get(key)! }
}

const generateRenkoBricksWeekly = (
	bars: readonly RawBar[],
	options: WeeklyWalkOptions
): WeeklyWalkResult => {
	const sortedKeys = [...options.sizeByEffectiveDate.keys()].sort()
	if (sortedKeys.length === 0) {
		return {
			bricks: [],
			warnings: ["No weekly sizes provided"],
			droppedBarsBeforeFirstSize: bars.length,
		}
	}

	const allBricks: RenkoBrick[] = []
	const warnings: string[] = []
	let droppedBarsBeforeFirstSize = 0

	// Group bars into runs where the picked size key is constant.
	let runStart = 0
	let runKey: string | null = null
	let runSize: number | null = null

	const flushRun = (endExclusive: number): void => {
		if (runKey === null || runSize === null) {
			return
		}
		const slice = bars.slice(runStart, endExclusive)
		if (slice.length === 0) {
			return
		}
		const { bricks, warnings: w } = generateRenkoBricks(slice, {
			sizeR: runSize,
		})
		for (const wi of w) {
			warnings.push(`[week ${runKey}, size ${runSize}] ${wi}`)
		}
		allBricks.push(...bricks)
	}

	for (let i = 0; i < bars.length; i++) {
		const bar = bars[i]!
		const pick = pickSizeForBar(bar, sortedKeys, options.sizeByEffectiveDate)
		if (pick === null) {
			droppedBarsBeforeFirstSize++
			continue
		}
		if (runKey === null) {
			runStart = i
			runKey = pick.key
			runSize = pick.size
			continue
		}
		if (pick.key !== runKey) {
			flushRun(i)
			runStart = i
			runKey = pick.key
			runSize = pick.size
		}
	}
	flushRun(bars.length)

	if (droppedBarsBeforeFirstSize > 0) {
		warnings.push(
			`${droppedBarsBeforeFirstSize} bars dropped: timestamps fall before the earliest weekly size entry`
		)
	}

	return { bricks: allBricks, warnings, droppedBarsBeforeFirstSize }
}

export type { WeeklyWalkOptions, WeeklyWalkResult }
export { generateRenkoBricksWeekly, isoWeekMondayKey }
