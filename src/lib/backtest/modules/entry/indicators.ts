/**
 * Reusable indicator computation helpers for backtest entry modules.
 * All functions work with running state (O(1) per candle update).
 */

// ═══════════════════════════════════════════════════════════════════
// EMA — Exponential Moving Average
// ═══════════════════════════════════════════════════════════════════

interface EMAState {
	value: number
	multiplier: number
	initialized: boolean
	count: number
	sum: number // used for SMA seed during warmup
}

const createEMA = (period: number): EMAState => ({
	value: 0,
	multiplier: 2 / (period + 1),
	initialized: false,
	count: 0,
	sum: 0,
})

/** Update EMA with a new price. Returns the updated state. */
const updateEMA = (
	state: EMAState,
	price: number,
	period: number
): EMAState => {
	if (!state.initialized) {
		const newCount = state.count + 1
		const newSum = state.sum + price
		if (newCount >= period) {
			// Seed with SMA then switch to EMA
			return {
				...state,
				value: newSum / newCount,
				initialized: true,
				count: newCount,
				sum: newSum,
			}
		}
		return { ...state, count: newCount, sum: newSum, value: price }
	}

	const newValue = (price - state.value) * state.multiplier + state.value
	return { ...state, value: newValue }
}

// ═══════════════════════════════════════════════════════════════════
// WMA — Weighted Moving Average
// ═══════════════════════════════════════════════════════════════════

interface WMAState {
	buffer: number[]
	period: number
}

const createWMA = (period: number): WMAState => ({
	buffer: [],
	period,
})

/** Update WMA with a new price. Returns updated state + current WMA value. */
const updateWMA = (
	state: WMAState,
	price: number
): { state: WMAState; value: number } => {
	const buffer = [...state.buffer, price]
	if (buffer.length > state.period) {
		buffer.shift()
	}

	if (buffer.length < state.period) {
		return { state: { ...state, buffer }, value: price }
	}

	// WMA = sum(price[i] * weight[i]) / sum(weights)
	// weight[0] = 1, weight[1] = 2, ..., weight[n-1] = n
	let weightedSum = 0
	let weightSum = 0
	for (let i = 0; i < buffer.length; i++) {
		const weight = i + 1
		weightedSum += buffer[i]! * weight
		weightSum += weight
	}

	return { state: { ...state, buffer }, value: weightedSum / weightSum }
}

/** Compute WMA from a fixed-length buffer slice. */
const computeWMAFromSlice = (slice: number[]): number => {
	let weightedSum = 0
	let weightSum = 0
	for (let i = 0; i < slice.length; i++) {
		const weight = i + 1
		weightedSum += slice[i]! * weight
		weightSum += weight
	}
	return weightedSum / weightSum
}

/** Get WMA value with offset (0 = current, 1 = previous bar, etc.) */
const getWMAWithOffset = (state: WMAState, offset: number): number | null => {
	if (offset === 0) {
		if (state.buffer.length < state.period) {
			return null
		}
		return computeWMAFromSlice(state.buffer)
	}

	// For offset > 0, compute WMA on a shorter slice
	const end = state.buffer.length - offset
	if (end < state.period) {
		return null
	}
	return computeWMAFromSlice(state.buffer.slice(end - state.period, end))
}

// ═══════════════════════════════════════════════════════════════════
// MACD — Moving Average Convergence Divergence
// ═══════════════════════════════════════════════════════════════════

interface MACDState {
	fastEMA: EMAState
	slowEMA: EMAState
	signalEMA: EMAState
	histogram: number
	prevHistograms: number[] // rolling history for color classification
}

const createMACD = (fast: number, slow: number, signal: number): MACDState => ({
	fastEMA: createEMA(fast),
	slowEMA: createEMA(slow),
	signalEMA: createEMA(signal),
	histogram: 0,
	prevHistograms: [],
})

/** Update MACD with a new close price. Returns updated state + histogram. */
const updateMACD = (
	state: MACDState,
	close: number,
	fast: number,
	slow: number,
	signal: number
): MACDState => {
	const fastEMA = updateEMA(state.fastEMA, close, fast)
	const slowEMA = updateEMA(state.slowEMA, close, slow)

	const macdLine = fastEMA.value - slowEMA.value
	const signalEMA = updateEMA(state.signalEMA, macdLine, signal)
	const histogram = macdLine - signalEMA.value

	// Keep last 4 histograms for color classification
	const prevHistograms = [...state.prevHistograms, histogram].slice(-4)

	return { fastEMA, slowEMA, signalEMA, histogram, prevHistograms }
}

/**
 * Classify MACD histogram color (Diego TAT style).
 * 1 = strong green (positive and growing)
 * 2 = weak green (positive but declining)
 * -1 = strong red (negative and declining)
 * -2 = weak red (negative but recovering)
 * 0 = neutral (zero)
 */
const classifyMACDColor = (current: number, previous: number): number => {
	if (current > 0) {
		return current > previous ? 1 : 2
	}
	if (current < 0) {
		return current < previous ? -1 : -2
	}
	return 0
}

// ═══════════════════════════════════════════════════════════════════
// Highest / Lowest over N bars
// ═══════════════════════════════════════════════════════════════════

interface HighLowTracker {
	highs: number[]
	lows: number[]
	period: number
}

const createHighLowTracker = (period: number): HighLowTracker => ({
	highs: [],
	lows: [],
	period,
})

const updateHighLowTracker = (
	state: HighLowTracker,
	high: number,
	low: number
): HighLowTracker => {
	const highs = [...state.highs, high].slice(-state.period)
	const lows = [...state.lows, low].slice(-state.period)
	return { ...state, highs, lows }
}

const getHighest = (state: HighLowTracker): number =>
	state.highs.length > 0 ? Math.max(...state.highs) : 0

const getLowest = (state: HighLowTracker): number =>
	state.lows.length > 0 ? Math.min(...state.lows) : Infinity

export {
	// EMA
	createEMA,
	updateEMA,
	type EMAState,
	// WMA
	createWMA,
	updateWMA,
	computeWMAFromSlice,
	getWMAWithOffset,
	type WMAState,
	// MACD
	createMACD,
	updateMACD,
	classifyMACDColor,
	type MACDState,
	// High/Low
	createHighLowTracker,
	updateHighLowTracker,
	getHighest,
	getLowest,
	type HighLowTracker,
}
