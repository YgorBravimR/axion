import type {
	AssetConfig,
	StrategyRecipe,
	BacktestResult,
	BacktestTrade,
	DayBreakdown,
	Position,
	Direction,
	EntrySignal,
} from "@/types/backtest"
import type { CandleRow } from "@/types/candle"
import { groupCandlesByDay, buildDayContext } from "./day-grouper"
import {
	checkHits,
	applySlippage,
	calculatePnlCents,
	getNextTargetPrice,
} from "./candle-utils"
import {
	processOrbCandle,
	createInitialOrbState,
	type OrbState,
	processDezkCandle,
	createInitialDezkState,
	resetDezkForNewDay,
	type DezkState,
	processHawksCandle,
	createInitialHawksState,
	type HawksState,
	processUserCatalogCandle,
	createInitialUserCatalogState,
	type UserCatalogState,
} from "./modules/entry"
import { createStopModule } from "./modules/stop"
import { createTargetModule } from "./modules/target"
import { createSizingModule } from "./modules/sizing"
import { createReversalModule } from "./modules/reversal"
import { computeMetrics, buildEquityCurve } from "./metrics"

/**
 * Compute the 1-indexed brick index (candle_index) where the entry occurred.
 * Searches the entry day's candles for a matching timestamp.
 */
const getEntryBrickIndex = (
	entryTimestamp: string,
	entryDayKey: string,
	days: Map<string, CandleRow[]>
): number | undefined => {
	const dayCandlesArr = days.get(entryDayKey)
	if (!dayCandlesArr) {
		return undefined
	}
	const candle = dayCandlesArr.find((c) => c.timestamp === entryTimestamp)
	if (!candle || candle.candleIndex === null) {
		return undefined
	}
	return candle.candleIndex + 1 // Convert 0-indexed DB to 1-indexed catalog
}

/**
 * Run a complete backtest over a candle dataset using the given strategy recipe.
 *
 * This is a pure function — no DB, no React, no side effects.
 * Receives candle data + configuration, returns results.
 *
 * Architecture note: This function is the Python migration boundary.
 * Today it runs in TypeScript. Tomorrow the server action can call
 * a Python service instead, using StrategyRecipe and BacktestResult as the API contract.
 */
const runBacktest = (
	candles: CandleRow[],
	recipe: StrategyRecipe,
	assetConfig: AssetConfig
): BacktestResult => {
	const days = groupCandlesByDay(candles)
	const sortedDayKeys = [...days.keys()].sort()

	const stopModule = createStopModule()
	const targetModule = createTargetModule()
	const sizingModule = createSizingModule()
	const reversalModule = createReversalModule()

	const trades: BacktestTrade[] = []
	const dayBreakdowns: DayBreakdown[] = []
	let tradeCounter = 0

	// Get valuePerPointCents from sizing config (for P&L calculation)
	const valuePerPointCents =
		recipe.sizing.type === "monetary_risk"
			? recipe.sizing.valuePerPointCents
			: assetConfig.tickValueCents / assetConfig.tickSize

	// For indicator-based strategies (10K), state carries across days for warmup.
	// ORB resets fresh each day (only cares about current day's opening range).
	let persistentEntryState: DezkState | null =
		recipe.entry.type === "macd_wma_alignment"
			? createInitialDezkState(recipe.entry.config)
			: null

	// Hawks carries the full structural state (pivots, anchors, phase) across
	// days. The user's "TOPO ANTERIOR" for the morning's first setup is
	// yesterday's last indicator-marked TOPO, so the engine must not reset
	// on day boundary.
	let persistentHawksState: HawksState | null =
		recipe.entry.type === "hawks_triple_screen"
			? createInitialHawksState()
			: null

	for (const dayKey of sortedDayKeys) {
		const dayCandlesArr = days.get(dayKey)!
		let position: Position | null = null
		let reversalState = reversalModule.init()
		let entryState: OrbState | DezkState | HawksState | UserCatalogState =
			recipe.entry.type === "orb_breakout"
				? createInitialOrbState()
				: recipe.entry.type === "hawks_triple_screen"
					? persistentHawksState!
					: recipe.entry.type === "user_catalog"
						? createInitialUserCatalogState()
						: resetDezkForNewDay(persistentEntryState!)
		let dayRangeHigh: number | null = null
		let dayRangeLow: number | null = null
		const dayTrades: BacktestTrade[] = []

		for (let i = 0; i < dayCandlesArr.length; i++) {
			const candle = dayCandlesArr[i]!
			const ctx = buildDayContext(candle, dayKey, i)

			// ═══ Position exists: check stop/target hits ═══
			if (position) {
				const pos = position

				// Check stop
				const stopResult = stopModule.onCandle(
					candle,
					pos.stopState,
					recipe.stop
				)
				const updatedPos: Position = { ...pos, stopState: stopResult.state }

				// Check targets
				const targetResult = targetModule.onCandle(
					candle,
					pos.targetState,
					recipe.target,
					pos.direction,
					ctx,
					recipe.stop.triggerMode
				)
				const currentPos: Position = {
					...updatedPos,
					targetState: targetResult.state,
				}
				position = currentPos

				// Determine what hit and in what order
				const nextTargetPrice = getNextTargetPrice(currentPos)
				const hitResult = checkHits(
					candle,
					stopResult.currentStopPrice,
					nextTargetPrice,
					currentPos.direction,
					recipe.stop.triggerMode
				)

				if (hitResult.stopHit && hitResult.targetHit) {
					if (hitResult.stopHitFirst) {
						const exitReason = stopResult.state.breakevenTriggered
							? "breakeven_stop"
							: "stop"
						position = handleStopHit(
							currentPos,
							stopResult.currentStopPrice,
							candle,
							exitReason,
							recipe,
							assetConfig,
							valuePerPointCents,
							dayTrades,
							trades,
							dayKey,
							reversalModule,
							reversalState,
							stopModule,
							targetModule,
							sizingModule,
							entryState,
							dayRangeHigh,
							dayRangeLow,
							tradeCounter,
							days
						)
						tradeCounter =
							dayTrades.length > 0
								? dayTrades[dayTrades.length - 1]!.id
								: tradeCounter
					} else {
						position = handleTargetHit(
							currentPos,
							targetResult,
							candle,
							recipe,
							assetConfig,
							valuePerPointCents,
							dayTrades,
							tradeCounter,
							stopModule,
							days
						)
						tradeCounter =
							dayTrades.length > 0
								? dayTrades[dayTrades.length - 1]!.id
								: tradeCounter
					}
				} else if (hitResult.stopHit) {
					const exitReason = stopResult.state.breakevenTriggered
						? "breakeven_stop"
						: "stop"
					const result = processStopHit(
						currentPos,
						stopResult.currentStopPrice,
						candle,
						exitReason,
						recipe,
						assetConfig,
						valuePerPointCents,
						reversalModule,
						reversalState,
						stopModule,
						targetModule,
						sizingModule,
						entryState,
						tradeCounter,
						days
					)
					dayTrades.push(result.trade)
					tradeCounter = result.trade.id
					position = result.newPosition
					reversalState = result.reversalState
				} else if (targetResult.exits.length > 0) {
					position = handleTargetHit(
						currentPos,
						targetResult,
						candle,
						recipe,
						assetConfig,
						valuePerPointCents,
						dayTrades,
						tradeCounter,
						stopModule,
						days
					)
					tradeCounter =
						dayTrades.length > 0
							? dayTrades[dayTrades.length - 1]!.id
							: tradeCounter
				}

				// Same-brick re-entry: when a user-catalog position closes on
				// this brick, the catalog may have ANOTHER entry indexed to
				// the same brick (in reality the close + new entry happen at
				// different ticks within the OHLC bar; with OHLC-only data we
				// approximate by allowing the entry pipeline to run on the
				// same brick). For autonomous strategies (Hawks, ORB, dezK),
				// the entry state machine doesn't see bricks while a position
				// is open, so a same-brick re-entry would fire off stale
				// state — keep them on next-brick semantics.
				if (position || recipe.entry.type !== "user_catalog") {
					continue
				}
			}

			// ═══ No position: check for entry signal ═══
			let entrySignal: EntrySignal | null = null

			if (recipe.entry.type === "orb_breakout") {
				const result = processOrbCandle(
					candle,
					entryState as OrbState,
					ctx,
					assetConfig.tickSize,
					recipe.entry.config
				)
				entryState = result.state
				entrySignal = result.signal

				// Track range for day breakdown
				if ((result.state as OrbState).rangeHigh !== -Infinity) {
					dayRangeHigh = (result.state as OrbState).rangeHigh
					dayRangeLow = (result.state as OrbState).rangeLow
				}
			} else if (recipe.entry.type === "macd_wma_alignment") {
				const result = processDezkCandle(
					candle,
					entryState as DezkState,
					ctx,
					assetConfig.tickSize,
					recipe.entry.config
				)
				entryState = result.state
				entrySignal = result.signal
			} else if (recipe.entry.type === "hawks_triple_screen") {
				const result = processHawksCandle(
					candle,
					entryState as HawksState,
					ctx,
					assetConfig.tickSize,
					recipe.entry.config
				)
				entryState = result.state
				entrySignal = result.signal
			} else if (recipe.entry.type === "user_catalog") {
				const result = processUserCatalogCandle(
					candle,
					entryState as UserCatalogState,
					ctx,
					assetConfig.tickSize,
					recipe.entry.config
				)
				entryState = result.state
				entrySignal = result.signal
			}

			if (entrySignal) {
				position = openPosition(
					entrySignal,
					recipe,
					assetConfig,
					valuePerPointCents,
					candle,
					dayKey,
					stopModule,
					targetModule,
					sizingModule
				)
			}
		}

		// Force-close any remaining position at EOD (if not already closed)
		if (position) {
			const lastCandle = dayCandlesArr[dayCandlesArr.length - 1]!
			const exitPrice = applySlippage(
				lastCandle.close,
				position.direction,
				false,
				recipe.slippageTicks,
				assetConfig.tickSize
			)
			const trade = closeTrade(
				position,
				exitPrice,
				lastCandle.timestamp,
				"eod",
				valuePerPointCents,
				recipe.slippageTicks,
				assetConfig.tickSize,
				days
			)
			trade.id = ++tradeCounter
			dayTrades.push(trade)
		}

		// Carry indicator state to next day for MACD/WMA strategies
		if (recipe.entry.type === "macd_wma_alignment") {
			persistentEntryState = entryState as DezkState
		}
		// Carry structural state across days for Hawks — yesterday's last
		// TOPO/FUNDO anchors today's first setup ("TOPO ANTERIOR").
		if (recipe.entry.type === "hawks_triple_screen") {
			persistentHawksState = entryState as HawksState
		}

		trades.push(...dayTrades)
		dayBreakdowns.push({
			dayKey,
			trades: dayTrades.length,
			pnlCents: dayTrades.reduce((sum, t) => sum + t.netPnlCents, 0),
			rangeHigh: dayRangeHigh,
			rangeLow: dayRangeLow,
		})
	}

	return {
		trades,
		equityCurve: buildEquityCurve(trades),
		summary: computeMetrics(trades, sortedDayKeys.length),
		dayBreakdown: dayBreakdowns,
		engineVersion: getEngineVersionForRecipe(recipe),
	}
}

const getEngineVersionForRecipe = (
	recipe: StrategyRecipe
): string | undefined => {
	if (recipe.entry.type === "hawks_triple_screen") {
		return "hawks-v0.6"
	}
	if (recipe.entry.type === "user_catalog") {
		return "user-catalog-v1"
	}
	return undefined
}

export { getEngineVersionForRecipe }

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

const openPosition = (
	signal: EntrySignal,
	recipe: StrategyRecipe,
	assetConfig: AssetConfig,
	valuePerPointCents: number,
	candle: CandleRow,
	dayKey: string,
	stopMod: ReturnType<typeof createStopModule>,
	targetMod: ReturnType<typeof createTargetModule>,
	sizingMod: ReturnType<typeof createSizingModule>
): Position => {
	const entryPrice = applySlippage(
		signal.price,
		signal.direction,
		true,
		recipe.slippageTicks,
		assetConfig.tickSize
	)

	// Initialize stop module
	const stopState = stopMod.init(
		entryPrice,
		signal.direction,
		signal,
		recipe.stop,
		assetConfig.tickSize
	)
	const stopDistance = stopState.initialStopDistance

	// Calculate position size
	const contracts = sizingMod.calculate(stopDistance, recipe.sizing)

	// Initialize target module (pass stopDistance for R-multiple and pct_stop modes)
	const targetState = targetMod.init(
		entryPrice,
		signal.direction,
		signal,
		recipe.target,
		stopDistance
	)

	// Calculate initial risk for R-multiple
	const riskCents = Math.round(stopDistance * contracts * valuePerPointCents)

	return {
		direction: signal.direction,
		entryPrice,
		contracts,
		contractsRemaining: contracts,
		stopState,
		targetState,
		riskCents,
		entryTimestamp: candle.timestamp,
		entryDayKey: dayKey,
		label: signal.label,
		quality: signal.quality,
	}
}

const closeTrade = (
	position: Position,
	exitPrice: number,
	exitTimestamp: string,
	exitReason: BacktestTrade["exitReason"],
	valuePerPointCents: number,
	slippageTicks: number,
	tickSize: number,
	days: Map<string, CandleRow[]>
): BacktestTrade => {
	const contracts = position.contractsRemaining
	const grossPnlCents = calculatePnlCents(
		position.entryPrice,
		exitPrice,
		position.direction,
		contracts,
		valuePerPointCents
	)
	const slippageCostCents = Math.round(
		slippageTicks * tickSize * valuePerPointCents * contracts * 2
	) // entry + exit slippage
	const netPnlCents = grossPnlCents
	const rMultiple =
		position.riskCents > 0
			? Math.round((netPnlCents / position.riskCents) * 100) / 100
			: 0

	return {
		id: 0, // set by caller
		dayKey: position.entryDayKey,
		direction: position.direction,
		entryPrice: position.entryPrice,
		entryTime: position.entryTimestamp,
		exitPrice,
		exitTime: exitTimestamp,
		exitReason,
		contracts,
		grossPnlCents,
		slippageCostCents,
		netPnlCents,
		rMultiple,
		label: position.label,
		quality: position.quality,
		entryBrickIndex: getEntryBrickIndex(
			position.entryTimestamp,
			position.entryDayKey,
			days
		),
	}
}

const processStopHit = (
	position: Position,
	stopPrice: number,
	candle: CandleRow,
	exitReason: "stop" | "breakeven_stop",
	recipe: StrategyRecipe,
	assetConfig: AssetConfig,
	valuePerPointCents: number,
	reversalMod: ReturnType<typeof createReversalModule>,
	reversalState: ReturnType<
		typeof createReversalModule
	>["init"] extends () => infer R
		? R
		: never,
	stopMod: ReturnType<typeof createStopModule>,
	targetMod: ReturnType<typeof createTargetModule>,
	sizingMod: ReturnType<typeof createSizingModule>,
	entryState: unknown,
	tradeCounter: number,
	days: Map<string, CandleRow[]>
): {
	trade: BacktestTrade
	newPosition: Position | null
	reversalState: typeof reversalState
} => {
	const exitPrice = applySlippage(
		stopPrice,
		position.direction,
		false,
		recipe.slippageTicks,
		assetConfig.tickSize
	)
	const trade = closeTrade(
		position,
		exitPrice,
		candle.timestamp,
		exitReason,
		valuePerPointCents,
		recipe.slippageTicks,
		assetConfig.tickSize,
		days
	)
	trade.id = tradeCounter + 1

	// Check reversal
	const reversalResult = reversalMod.check(
		exitReason,
		reversalState,
		recipe.reversal
	)

	if (reversalResult.shouldReverse) {
		// Create a mirrored signal for the reverse position
		const reverseDirection: Direction =
			position.direction === "long" ? "short" : "long"
		const reverseSignal: EntrySignal = {
			direction: reverseDirection,
			price: candle.close,
			rangeHigh: position.targetState.targetPrices[0] ?? candle.high, // use existing range reference
			rangeLow: position.stopState.currentStopPrice,
			rangeWidth: Math.abs(
				(position.targetState.targetPrices[0] ?? candle.high) -
					position.stopState.currentStopPrice
			),
			label: `Reversal ${reverseDirection} after ${exitReason}`,
		}

		const newPosition = openPosition(
			reverseSignal,
			recipe,
			assetConfig,
			valuePerPointCents,
			candle,
			position.entryDayKey,
			stopMod,
			targetMod,
			sizingMod
		)

		return {
			trade,
			newPosition,
			reversalState: reversalResult.state,
		}
	}

	return {
		trade,
		newPosition: null,
		reversalState: reversalResult.state,
	}
}

const handleStopHit = (
	position: Position,
	stopPrice: number,
	candle: CandleRow,
	exitReason: "stop" | "breakeven_stop",
	recipe: StrategyRecipe,
	assetConfig: AssetConfig,
	valuePerPointCents: number,
	dayTrades: BacktestTrade[],
	_allTrades: BacktestTrade[],
	_dayKey: string,
	reversalMod: ReturnType<typeof createReversalModule>,
	reversalState: ReturnType<
		typeof createReversalModule
	>["init"] extends () => infer R
		? R
		: never,
	stopMod: ReturnType<typeof createStopModule>,
	targetMod: ReturnType<typeof createTargetModule>,
	sizingMod: ReturnType<typeof createSizingModule>,
	_entryState: unknown,
	_dayRangeHigh: number | null,
	_dayRangeLow: number | null,
	tradeCounter: number,
	days: Map<string, CandleRow[]>
): Position | null => {
	const result = processStopHit(
		position,
		stopPrice,
		candle,
		exitReason,
		recipe,
		assetConfig,
		valuePerPointCents,
		reversalMod,
		reversalState,
		stopMod,
		targetMod,
		sizingMod,
		_entryState,
		tradeCounter,
		days
	)
	dayTrades.push(result.trade)
	return result.newPosition
}

const handleTargetHit = (
	position: Position,
	targetResult: {
		exits: Array<{ price: number; fraction: number; reason: string }>
		state: Position["targetState"]
	},
	candle: CandleRow,
	recipe: StrategyRecipe,
	assetConfig: AssetConfig,
	valuePerPointCents: number,
	dayTrades: BacktestTrade[],
	tradeCounter: number,
	stopMod: ReturnType<typeof createStopModule>,
	days: Map<string, CandleRow[]>
): Position | null => {
	let updatedPosition = { ...position, targetState: targetResult.state }

	for (const exit of targetResult.exits) {
		if (updatedPosition.contractsRemaining <= 0) {
			break
		}

		// Determine contracts to exit based on allocation
		const exitContracts =
			exit.fraction >= 1.0
				? updatedPosition.contractsRemaining
				: Math.floor(updatedPosition.contracts * exit.fraction)

		if (exitContracts <= 0) {
			continue
		}

		const actualExitContracts = Math.min(
			exitContracts,
			updatedPosition.contractsRemaining
		)
		const exitPrice = applySlippage(
			exit.price,
			updatedPosition.direction,
			false,
			recipe.slippageTicks,
			assetConfig.tickSize
		)

		const grossPnlCents = calculatePnlCents(
			updatedPosition.entryPrice,
			exitPrice,
			updatedPosition.direction,
			actualExitContracts,
			valuePerPointCents
		)
		const slippageCostCents = Math.round(
			recipe.slippageTicks *
				assetConfig.tickSize *
				valuePerPointCents *
				actualExitContracts *
				2
		)

		const trade: BacktestTrade = {
			id: ++tradeCounter,
			dayKey: updatedPosition.entryDayKey,
			direction: updatedPosition.direction,
			entryPrice: updatedPosition.entryPrice,
			entryTime: updatedPosition.entryTimestamp,
			exitPrice,
			exitTime: candle.timestamp,
			exitReason: exit.reason as BacktestTrade["exitReason"],
			contracts: actualExitContracts,
			grossPnlCents,
			slippageCostCents,
			netPnlCents: grossPnlCents,
			rMultiple:
				updatedPosition.riskCents > 0
					? Math.round((grossPnlCents / updatedPosition.riskCents) * 100) / 100
					: 0,
			label: updatedPosition.label,
			quality: updatedPosition.quality,
			entryBrickIndex: getEntryBrickIndex(
				updatedPosition.entryTimestamp,
				updatedPosition.entryDayKey,
				days
			),
		}

		dayTrades.push(trade)
		updatedPosition = {
			...updatedPosition,
			contractsRemaining:
				updatedPosition.contractsRemaining - actualExitContracts,
		}

		// Notify stop module of partial exit (for breakeven trigger)
		if (updatedPosition.contractsRemaining > 0) {
			updatedPosition = {
				...updatedPosition,
				stopState: stopMod.notifyPartialExit(
					updatedPosition.stopState,
					recipe.stop
				),
			}
		}
	}

	return updatedPosition.contractsRemaining > 0 ? updatedPosition : null
}

export { runBacktest }
