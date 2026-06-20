import type { Asset, Trade } from "@/db/schema"
import {
	calculateAssetPnL,
	calculateRMultiple,
	determineOutcome,
} from "@/lib/calculations"
import { fromCents } from "@/lib/money"

type Direction = "long" | "short"

interface DeriveInput {
	/** Pre-enrichment trade (DB row) */
	current: Trade
	/** Fields the enrichment passes accepted (subset of trade columns) */
	accepted: Record<string, unknown>
	/** Asset config (tickSize + tickValue) — required to derive R-math */
	asset: Asset | null
	/** Optional account-level breakeven threshold in ticks */
	breakevenTicks?: number
}

interface DeriveOutput {
	/** New numbers to merge into the trade row. Cents fields are returned as
	 *  strings so they line up with the DB's text/numeric columns. */
	patch: Record<string, unknown>
}

const num = (value: unknown): number | null => {
	if (value == null) {
		return null
	}
	const n = typeof value === "string" ? Number(value) : Number(value)
	return Number.isFinite(n) ? n : null
}

const toNumericString = (value: number | null | undefined): string | null => {
	if (value == null || !Number.isFinite(value)) {
		return null
	}
	return String(value)
}

/**
 * Recompute derived R-math + outcome after an enrichment write.
 *
 * Mirrors the derivation logic in `src/app/actions/trades.ts` so the journal
 * shows the same R value whether the trade was filed via the New Trade form,
 * imported via CSV, or filed thin and reconciled by the enrichment pipeline.
 *
 * Inputs that drive the output:
 *   - entryPrice, exitPrice, positionSize, direction (from accepted ∪ current)
 *   - stopLoss, takeProfit (from accepted ∪ current) — when present, drive
 *     plannedRiskAmount + plannedRMultiple + realizedRMultiple
 *   - asset.tickSize / asset.tickValue — required for accurate P&L in cents
 */
export const deriveTradeFieldsFromEnrichment = ({
	current,
	accepted,
	asset,
	breakevenTicks = 0,
}: DeriveInput): DeriveOutput => {
	// Resolve effective values: enrichment-accepted overrides current trade row.
	const get = <T = unknown>(key: string): T | null => {
		if (key in accepted) {
			return (accepted as Record<string, T>)[key] ?? null
		}
		return ((current as unknown as Record<string, T>)[key] ?? null) as T | null
	}

	const direction = (get<string>("direction") ?? current.direction) as Direction
	const entryPrice = num(get("entryPrice"))
	const exitPrice = num(get("exitPrice"))
	const stopLoss = num(get("stopLoss"))
	const takeProfit = num(get("takeProfit"))
	const positionSize = num(get("positionSize"))
	const pnlCents = num(get("pnl"))

	const patch: Record<string, unknown> = {}

	// plannedRiskAmount = |entry − stopLoss| × size × tickValue/tickSize
	let plannedRiskAmountCents: number | null = null
	if (entryPrice != null && stopLoss != null && positionSize != null) {
		const priceDiff = Math.abs(entryPrice - stopLoss)
		if (asset) {
			const tickSize = parseFloat(asset.tickSize)
			const tickValue = fromCents(asset.tickValue)
			if (tickSize > 0) {
				const ticksAtRisk = priceDiff / tickSize
				plannedRiskAmountCents = Math.round(
					ticksAtRisk * tickValue * positionSize * 100
				)
			}
		} else {
			// Asset-less fallback: treat price diff as currency units
			plannedRiskAmountCents = Math.round(priceDiff * positionSize * 100)
		}
	}
	if (plannedRiskAmountCents != null) {
		patch.plannedRiskAmount = toNumericString(plannedRiskAmountCents)
	}

	// plannedRMultiple = |reward| / |risk|
	if (entryPrice != null && stopLoss != null && takeProfit != null) {
		const riskPerUnit =
			direction === "long" ? entryPrice - stopLoss : stopLoss - entryPrice
		if (riskPerUnit !== 0) {
			const rewardPerUnit =
				direction === "long" ? takeProfit - entryPrice : entryPrice - takeProfit
			patch.plannedRMultiple = toNumericString(
				Math.abs(rewardPerUnit / riskPerUnit)
			)
		}
	}

	// Recalculate pnl from prices when both exist and we have asset config.
	// This is the same trust order the createTrade action uses: prices over
	// any pnl value, because pnl is a derived field.
	//
	// IMPORTANT: calculateAssetPnL returns netPnl in BRL (not cents) because
	// tickValue is passed as fromCents(asset.tickValue). All money columns in
	// the DB are cents, so multiply by 100 when comparing or storing.
	let resolvedPnlCents = pnlCents
	let ticksGained: number | null = null
	if (
		entryPrice != null &&
		exitPrice != null &&
		positionSize != null &&
		asset
	) {
		const result = calculateAssetPnL({
			entryPrice,
			exitPrice,
			positionSize,
			direction,
			tickSize: parseFloat(asset.tickSize),
			tickValue: fromCents(asset.tickValue),
			contractsExecuted: num(get("contractsExecuted")) ?? positionSize * 2,
		})
		resolvedPnlCents = Math.round(result.netPnl * 100)
		ticksGained = result.ticksGained
	}

	// If we recomputed pnl from prices, write the GROSS price-derived value
	// back so the journal renders match the R-math. Do NOT overwrite the
	// CSV-reconciled (net) pnl already on the trade — that's the canonical
	// number. Only fill pnl if accepted/current have no value yet.
	if (pnlCents == null && resolvedPnlCents != null) {
		patch.pnl = String(resolvedPnlCents)
	}

	// realizedRMultiple = pnl (cents) / plannedRiskAmount (cents)
	if (
		resolvedPnlCents != null &&
		plannedRiskAmountCents != null &&
		plannedRiskAmountCents > 0
	) {
		patch.realizedRMultiple = toNumericString(
			calculateRMultiple(resolvedPnlCents, plannedRiskAmountCents)
		)
	}

	// outcome (win/loss/breakeven) — only set if we have a pnl signal
	if (resolvedPnlCents != null) {
		patch.outcome = determineOutcome({
			pnl: resolvedPnlCents,
			ticksGained,
			breakevenTicks,
		})
	}

	return { patch }
}
