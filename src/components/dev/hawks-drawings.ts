// Drawing primitives for the Hawks audit sandbox. Stored as a flat array in
// React state on the inspector; each pane (5m / 15m / 60m) renders the same
// drawings projected onto its own brick-index space via
// `projectDrawingsForPane`.

type DrawingTool = "cursor" | "hline" | "trendline"

interface HLineDrawing {
	readonly id: string
	readonly type: "hline"
	readonly price: number
	readonly color: string
}

interface TrendlineDrawing {
	readonly id: string
	readonly type: "trendline"
	readonly startTimeMs: number
	readonly startPrice: number
	readonly endTimeMs: number
	readonly endPrice: number
	readonly color: string
}

type Drawing = HLineDrawing | TrendlineDrawing

// Per-pane projection. Hlines are timeframe-agnostic so they pass through
// untouched. Trendlines carry wall-clock timestamps that have to be mapped to
// each pane's local brick-index axis.
interface ProjectedTrendline {
	readonly id: string
	readonly startBrickIdx: number
	readonly startPrice: number
	readonly endBrickIdx: number
	readonly endPrice: number
	readonly color: string
}

interface ProjectedDrawings {
	readonly hlines: ReadonlyArray<HLineDrawing>
	readonly trendlines: ReadonlyArray<ProjectedTrendline>
}

// Largest index whose times[i] <= target. Returns -1 if target precedes all
// bricks.
const floorBrickIdx = (
	times: ReadonlyArray<number>,
	targetMs: number
): number => {
	let lo = 0
	let hi = times.length - 1
	let result = -1
	while (lo <= hi) {
		const mid = (lo + hi) >>> 1
		if (times[mid]! <= targetMs) {
			result = mid
			lo = mid + 1
		} else {
			hi = mid - 1
		}
	}
	return result
}

const projectDrawingsForPane = (
	drawings: ReadonlyArray<Drawing>,
	paneTimes: ReadonlyArray<number>
): ProjectedDrawings => {
	const hlines: HLineDrawing[] = []
	const trendlines: ProjectedTrendline[] = []
	for (const d of drawings) {
		if (d.type === "hline") {
			hlines.push(d)
			continue
		}
		// Trendline. Skip if either endpoint falls outside this pane's range.
		// A trendline drawn at the start of the 5m visible window may not yet
		// have a 60m brick that covers it — render only when both endpoints
		// have a valid index, otherwise the LineSeries gets nonsensical data.
		const startIdx = floorBrickIdx(paneTimes, d.startTimeMs)
		const endIdx = floorBrickIdx(paneTimes, d.endTimeMs)
		if (startIdx < 0 || endIdx < 0 || startIdx === endIdx) {
			// startIdx === endIdx would crash Lightweight Charts (strictly
			// ascending times required in setData).
			continue
		}
		const [lo, hi] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx]
		const [loPrice, hiPrice] =
			startIdx < endIdx
				? [d.startPrice, d.endPrice]
				: [d.endPrice, d.startPrice]
		trendlines.push({
			id: d.id,
			startBrickIdx: lo,
			startPrice: loPrice,
			endBrickIdx: hi,
			endPrice: hiPrice,
			color: d.color,
		})
	}
	return { hlines, trendlines }
}

const makeId = (): string => Math.random().toString(36).slice(2, 10)

export type {
	Drawing,
	DrawingTool,
	HLineDrawing,
	TrendlineDrawing,
	ProjectedDrawings,
	ProjectedTrendline,
}
export { floorBrickIdx, makeId, projectDrawingsForPane }
