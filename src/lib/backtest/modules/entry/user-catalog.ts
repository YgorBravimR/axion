import type { CandleRow } from "@/types/candle"
import type {
	EntrySignal,
	DayContext,
	UserCatalogConfig,
	UserEntry,
} from "@/types/backtest"

// ─── State ────────────────────────────────────────────────────────────────────

export interface UserCatalogState {
	// Tracks fired (dayKey, brickIndex) pairs to avoid double-fire if the engine
	// somehow revisits the same candle (defensive, not normally needed).
	fired: Set<string>
}

export const createInitialUserCatalogState = (): UserCatalogState => ({
	fired: new Set(),
})

// ─── Lookup helper ────────────────────────────────────────────────────────────

// Build a lookup key from day + brick for the fired-set.
const makeKey = (dayKey: string, brickIndex: number): string =>
	`${dayKey}:${brickIndex}`

// Find catalog entry matching the current candle. Returns undefined if no match.
const findEntry = (
	catalog: UserEntry[],
	dayKey: string,
	brickIndex: number | null
): UserEntry | undefined => {
	if (brickIndex === null) {
		return undefined
	}
	return catalog.find((e) => e.date === dayKey && e.brickIndex === brickIndex)
}

// ─── Main processor ───────────────────────────────────────────────────────────

export const processUserCatalogCandle = (
	candle: CandleRow,
	state: UserCatalogState,
	ctx: DayContext,
	tickSize: number,
	config: UserCatalogConfig
): { state: UserCatalogState; signal: EntrySignal | null } => {
	// Optional time-window gate
	if (config.startTime !== undefined && ctx.brtHHMM < config.startTime) {
		return { state, signal: null }
	}
	if (config.endTime !== undefined && ctx.brtHHMM >= config.endTime) {
		return { state, signal: null }
	}

	const entry = findEntry(config.catalog, ctx.dayKey, candle.candleIndex)
	if (!entry) {
		return { state, signal: null }
	}

	const key = makeKey(ctx.dayKey, entry.brickIndex)
	if (state.fired.has(key)) {
		return { state, signal: null }
	}

	const newFired = new Set(state.fired)
	newFired.add(key)

	// Entry fill = exact close of the entry brick (no tick offset; deferred).
	// Reference: docs/hawks-strategy/renko-and-be-explanation-1.png shows entry
	// at exact brick close (e.g., box 10 close = 185200 → entry = 185200).
	void tickSize
	const entryPrice = candle.close

	// Stop = 1 against-brick close, anchored to entry brick close.
	// In Renko, an against brick closes only after a 2×brickSize move (a reversal
	// brick close requires twice the brick-size movement). So stop = close ±
	// 2×brickSize regardless of the entry brick's own direction.
	const brickSize = Math.abs(candle.close - candle.open)
	const stopReference =
		entry.direction === "short"
			? candle.close + 2 * brickSize
			: candle.close - 2 * brickSize

	// BE activates when price closes 2 bricks in favor (fixed, not %risk).
	const breakevenReference =
		entry.direction === "short"
			? candle.close - 2 * brickSize
			: candle.close + 2 * brickSize

	const signal: EntrySignal = {
		direction: entry.direction,
		price: entryPrice,
		stopReference,
		breakevenReference,
		label: entry.label ?? `catalog:${ctx.dayKey}:${entry.brickIndex}`,
	}

	return { state: { ...state, fired: newFired }, signal }
}
