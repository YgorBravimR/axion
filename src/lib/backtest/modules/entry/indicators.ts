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
	buffer: Float64Array
	head: number
	period: number
	count: number
}

const createWMA = (period: number): WMAState => ({
	buffer: new Float64Array(period),
	head: 0,
	period,
	count: 0,
})

/** Update WMA with a new price. Returns updated state + current WMA value. */
const updateWMA = (
	state: WMAState,
	price: number
): { state: WMAState; value: number } => {
	state.buffer[state.head] = price
	const newHead = (state.head + 1) % state.period
	const newCount = Math.min(state.count + 1, state.period)

	if (newCount < state.period) {
		return { state: { ...state, head: newHead, count: newCount }, value: price }
	}

	// WMA = sum(price[i] * weight[i]) / sum(weights)
	// Iterate from head (oldest) forward, wrapping around.
	let weightedSum = 0
	let weightSum = 0
	for (let i = 0; i < state.period; i++) {
		const idx = (state.head + i) % state.period
		const weight = i + 1
		weightedSum += state.buffer[idx]! * weight
		weightSum += weight
	}

	return {
		state: { ...state, head: newHead, count: newCount },
		value: weightedSum / weightSum,
	}
}

/** Compute WMA from ring buffer at given head position. */
const computeWMAFromRingBuffer = (
	buffer: Float64Array,
	head: number,
	period: number
): number => {
	let weightedSum = 0
	let weightSum = 0
	for (let i = 0; i < period; i++) {
		const idx = (head + i) % period
		const weight = i + 1
		weightedSum += buffer[idx]! * weight
		weightSum += weight
	}
	return weightedSum / weightSum
}

/** Get WMA value with offset (0 = current, 1 = previous bar, etc.) */
const getWMAWithOffset = (state: WMAState, offset: number): number | null => {
	if (state.count < state.period) {
		return null
	}

	// Current WMA (offset 0)
	if (offset === 0) {
		return computeWMAFromRingBuffer(state.buffer, state.head, state.period)
	}

	// For offset > 0, rewind head by offset positions
	const histHead =
		(state.head - offset + state.period * Math.ceil(offset / state.period)) %
		state.period
	return computeWMAFromRingBuffer(state.buffer, histHead, state.period)
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
