/**
 * Pure Renko brick generator.
 *
 * Consumes a chronologically-ordered stream of 1m OHLC bars and emits Renko
 * bricks of size R (in points). Algorithm — close-based, classic Renko with
 * the 2R reversal rule:
 *
 *  - Seed: no brick exists yet. We anchor at the first bar's open and emit
 *    the first brick as soon as |close − anchor| ≥ R.
 *  - Continuation: a new brick in the same direction forms when price moves
 *    R points beyond the last brick's close.
 *  - Reversal: when price moves 2R against the current direction, a single
 *    brick forms at distance 2R from the last close (skipping the immediate
 *    one against the trend — classic ProfitChart Renko semantics).
 *  - Multi-R bars: one 1m bar can emit several bricks if its close moved
 *    more than R from the last brick. We loop inside one bar until the
 *    residual move is below the trigger.
 *
 * Pure: no I/O, no clock, deterministic per input. All timestamps come from
 * the input bars; we attribute each brick to the close timestamp of the bar
 * that triggered it (a brick that was triggered "halfway through" a bar is
 * still attributed to that bar's close — there's no intra-bar price path).
 */

interface RawBar {
	readonly timestamp: Date
	readonly open: number
	readonly high: number
	readonly low: number
	readonly close: number
}

type BrickDirection = "up" | "down"

interface RenkoBrick {
	readonly openTimestamp: Date
	readonly closeTimestamp: Date
	readonly open: number
	readonly close: number
	readonly direction: BrickDirection
}

interface GenerateOptions {
	readonly sizeR: number
}

interface GenerateResult {
	readonly bricks: RenkoBrick[]
	readonly warnings: string[]
}

const generateRenkoBricks = (
	bars: readonly RawBar[],
	options: GenerateOptions
): GenerateResult => {
	const { sizeR } = options
	const warnings: string[] = []

	if (sizeR <= 0) {
		throw new Error(`Renko brick size must be positive; got ${sizeR}`)
	}

	if (bars.length === 0) {
		return { bricks: [], warnings }
	}

	const bricks: RenkoBrick[] = []

	const firstBar = bars[0]!
	const anchorPrice = firstBar.open
	let anchorTimestamp = firstBar.timestamp
	let lastBrickClose: number | null = null
	let direction: BrickDirection | null = null

	for (const bar of bars) {
		const close = bar.close
		const ts = bar.timestamp

		// Phase 1 — seed. No brick has formed yet. Wait for the first R move
		// from the initial anchor (firstBar.open).
		if (lastBrickClose === null) {
			const move = close - anchorPrice
			if (Math.abs(move) < sizeR) {
				continue
			}
			direction = move > 0 ? "up" : "down"
			const firstClose =
				direction === "up" ? anchorPrice + sizeR : anchorPrice - sizeR
			bricks.push({
				openTimestamp: anchorTimestamp,
				closeTimestamp: ts,
				open: anchorPrice,
				close: firstClose,
				direction,
			})
			lastBrickClose = firstClose
			anchorTimestamp = ts
			// Fall through to continuation loop in case the same bar moved
			// multiple R from the anchor.
		}

		// Phase 2 — continuation / reversal. Loop so a single bar that moved
		// many R points emits all the bricks it deserves.
		while (true) {
			const lastClose: number = lastBrickClose!
			const dir: BrickDirection = direction!

			if (dir === "up") {
				if (close >= lastClose + sizeR) {
					const newClose: number = lastClose + sizeR
					bricks.push({
						openTimestamp: anchorTimestamp,
						closeTimestamp: ts,
						open: lastClose,
						close: newClose,
						direction: "up",
					})
					lastBrickClose = newClose
					anchorTimestamp = ts
					continue
				}
				if (close <= lastClose - 2 * sizeR) {
					// Reversal up → down: skip one box, body spans 2R.
					const newOpen: number = lastClose - sizeR
					const newClose: number = lastClose - 2 * sizeR
					bricks.push({
						openTimestamp: anchorTimestamp,
						closeTimestamp: ts,
						open: newOpen,
						close: newClose,
						direction: "down",
					})
					lastBrickClose = newClose
					direction = "down"
					anchorTimestamp = ts
					continue
				}
				break
			}

			// dir === "down"
			if (close <= lastClose - sizeR) {
				const newClose: number = lastClose - sizeR
				bricks.push({
					openTimestamp: anchorTimestamp,
					closeTimestamp: ts,
					open: lastClose,
					close: newClose,
					direction: "down",
				})
				lastBrickClose = newClose
				anchorTimestamp = ts
				continue
			}
			if (close >= lastClose + 2 * sizeR) {
				const newOpen: number = lastClose + sizeR
				const newClose: number = lastClose + 2 * sizeR
				bricks.push({
					openTimestamp: anchorTimestamp,
					closeTimestamp: ts,
					open: newOpen,
					close: newClose,
					direction: "up",
				})
				lastBrickClose = newClose
				direction = "up"
				anchorTimestamp = ts
				continue
			}
			break
		}
	}

	if (lastBrickClose === null) {
		warnings.push(
			`No bricks emitted: price never moved ${sizeR} points across ${bars.length} bars`
		)
	}

	return { bricks, warnings }
}

export type {
	RawBar,
	RenkoBrick,
	BrickDirection,
	GenerateOptions,
	GenerateResult,
}
export { generateRenkoBricks }
