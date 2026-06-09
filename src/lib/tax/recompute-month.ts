// src/lib/tax/recompute-month.ts
import { db } from "@/db/drizzle"
import { trades, accountFeeRates, monthlyTaxLedger } from "@/db/schema"
import { eq, and, gte, lte, sql } from "drizzle-orm"
import { getBrtDateParts } from "@/lib/dates"
import { computeDayFees } from "./fee-allocator"
import { accumulateIrrf } from "./irrf-accumulator"
import { computeDarf } from "./darf-calculator"
import { asBasisPoints } from "./rate-conversion"

interface RecomputeInput {
	accountId: string
	year: number
	month: number // 1–12
	carryoverInCents: number
}

interface RecomputeOutput {
	grossGainCents: number
	totalTxCorretagemCents: number
	totalTxRegistroCents: number
	totalEmolumentosCents: number
	totalIssCents: number
	totalFeesCents: number
	totalContractsExecuted: number
	irrfCents: number
	netGainBeforeCarryoverCents: number
	carryoverInCents: number
	carryoverConsumedCents: number
	carryoverOutCents: number
	taxableGainCents: number
	irGrossCents: number
	darfDueCents: number
	deferredIrCents: number
	netLiquidCents: number
	tradeCount: number
	isDirty: false
	computedAt: Date
}

/**
 * Recomputes a single month's tax ledger row for an account.
 * Fetches all day-trade closes in the month, aggregates fees/IRRF,
 * runs darf-calculator with the provided carryoverIn, and upserts the result.
 * Returns the computed output so the caller can chain carryoverOut → next month.
 *
 * @param input - accountId, year, month (1-12), carryoverIn
 */
const recomputeAccountMonth = async (
	input: RecomputeInput
): Promise<RecomputeOutput> => {
	const { accountId, year, month, carryoverInCents } = input

	// timestamptz columns: build UTC range bounds, never local-tz date-fns helpers
	const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
	const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))

	// Fetch all fee rate rows for this account.
	// One row may have NULL assetSymbol (catch-all default); zero or more rows
	// override per-asset (e.g. WDO, WIN). Build a lookup keyed by assetSymbol.
	const feeRatesRows = await db
		.select()
		.from(accountFeeRates)
		.where(eq(accountFeeRates.accountId, accountId))

	const DEFAULT_FEES = {
		txCorretagemCents: 5,
		txRegistroCents: 74,
		emolumentosCents: 40,
		issRatePercent: "5.00",
		irrfRateBps: 100,
		irRateBps: 2000,
		subjectToPersonalIr: true,
	}

	const feeRatesByAsset = new Map<string | null, typeof DEFAULT_FEES>()
	for (const row of feeRatesRows) {
		feeRatesByAsset.set(row.assetSymbol, {
			txCorretagemCents: row.txCorretagemCents,
			txRegistroCents: row.txRegistroCents,
			emolumentosCents: row.emolumentosCents,
			issRatePercent: String(row.issRatePercent),
			irrfRateBps: row.irrfRateBps,
			irRateBps: row.irRateBps,
			subjectToPersonalIr: row.subjectToPersonalIr,
		})
	}
	const defaultFeeRates = feeRatesByAsset.get(null) ?? DEFAULT_FEES
	const resolveFeeRates = (assetSymbol: string) =>
		feeRatesByAsset.get(assetSymbol) ?? defaultFeeRates

	// Fetch previous month's deferred IR balance (if it exists).
	// For the first month with no prior row, start with deferredIrInCents = 0.
	const priorMonthStart = new Date(Date.UTC(year, month - 2, 1, 0, 0, 0, 0))
	const priorMonthEnd = new Date(Date.UTC(year, month - 1, 0, 23, 59, 59, 999))
	let deferredIrInCents = 0

	if (month > 1) {
		// Prior month exists within the same year
		const priorRows = await db
			.select({ deferredIrCents: monthlyTaxLedger.deferredIrCents })
			.from(monthlyTaxLedger)
			.where(
				and(
					eq(monthlyTaxLedger.accountId, accountId),
					gte(monthlyTaxLedger.month, priorMonthStart),
					lte(monthlyTaxLedger.month, priorMonthEnd)
				)
			)
			.limit(1)

		if (priorRows.length > 0 && priorRows[0]) {
			deferredIrInCents = Number(priorRows[0].deferredIrCents) || 0
		}
	}

	// Fetch all closed trades in the month window
	const rawTrades = await db
		.select({
			id: trades.id,
			asset: trades.asset,
			entryDate: trades.entryDate,
			exitDate: trades.exitDate,
			pnl: trades.pnl,
			contractsExecuted: trades.contractsExecuted,
		})
		.from(trades)
		.where(
			and(
				eq(trades.accountId, accountId),
				gte(trades.exitDate, monthStart),
				lte(trades.exitDate, monthEnd)
			)
		)
		.orderBy(trades.exitDate)

	// Group trades by (exit day, asset). Same-day entry+exit only (day-trades).
	// Per-asset bucketing is required because fee rates differ by contract type
	// (e.g. WDO vs WIN have different B3 emolumentos and tx_registro).
	type Bucket = { pnlCents: number; contracts: number }
	const dayAssetMap = new Map<string, Bucket>()
	const dayPnlMap = new Map<string, number>()
	let tradeCount = 0

	for (const trade of rawTrades) {
		// Skip trades with no exit date
		if (!trade.exitDate) {
			continue
		}

		// Skip swing trades — entry and exit must be on the same calendar day in BRT.
		// Tax rule (Lei 11.033/2004) defines day-trades by BRT calendar day, not UTC.
		const entry = trade.entryDate
		const exit = trade.exitDate
		const entryBrt = getBrtDateParts(entry)
		const exitBrt = getBrtDateParts(exit)
		const sameDay =
			entryBrt.year === exitBrt.year &&
			entryBrt.month === exitBrt.month &&
			entryBrt.day === exitBrt.day
		if (!sameDay) {
			continue
		}

		// Fail loudly on corrupted numeric fields — silently propagating NaN
		// into aggregates would poison every dependent tax calculation.
		const pnlCents = Number(trade.pnl ?? 0)
		if (Number.isNaN(pnlCents)) {
			throw new Error(`recompute-month: non-numeric pnl on trade ${trade.id}`)
		}

		const contracts = parseFloat(String(trade.contractsExecuted ?? 0))

		const dayKey = `${exit.getFullYear()}-${exit.getMonth()}-${exit.getDate()}`
		const dayAssetKey = `${dayKey}|${trade.asset}`

		const existing = dayAssetMap.get(dayAssetKey) ?? {
			pnlCents: 0,
			contracts: 0,
		}
		dayAssetMap.set(dayAssetKey, {
			pnlCents: existing.pnlCents + pnlCents,
			contracts: existing.contracts + contracts,
		})
		dayPnlMap.set(dayKey, (dayPnlMap.get(dayKey) ?? 0) + pnlCents)
		tradeCount++
	}

	// Aggregate fees per (day, asset) bucket using each asset's resolved rate.
	let grossGainCents = 0
	let totalTxCorretagemCents = 0
	let totalTxRegistroCents = 0
	let totalEmolumentosCents = 0
	let totalIssCents = 0
	let totalContractsExecuted = 0

	for (const [key, { pnlCents, contracts }] of dayAssetMap.entries()) {
		const asset = key.split("|")[1] ?? ""
		const rates = resolveFeeRates(asset)
		grossGainCents += pnlCents
		totalContractsExecuted += contracts

		const fees = computeDayFees({
			contractsExecuted: contracts,
			rates: {
				txCorretagemCents: rates.txCorretagemCents,
				txRegistroCents: rates.txRegistroCents,
				emolumentosCents: rates.emolumentosCents,
				issRatePercent: parseFloat(rates.issRatePercent),
			},
		})
		totalTxCorretagemCents += fees.txCorretagem
		totalTxRegistroCents += fees.txRegistro
		totalEmolumentosCents += fees.emolumentos
		totalIssCents += fees.iss
	}

	// IRRF accumulates on day-level gross PnL (asset-agnostic). Use default
	// rate row's irrfRateBps — IRRF is a federal withholding rate that does
	// not vary per asset.
	const dailyResults: Array<{ date: Date; grossPnlCents: number }> = []
	for (const [, pnl] of dayPnlMap.entries()) {
		dailyResults.push({ date: monthStart, grossPnlCents: pnl })
	}

	const totalFeesCents =
		totalTxCorretagemCents +
		totalTxRegistroCents +
		totalEmolumentosCents +
		totalIssCents

	const irrfResult = accumulateIrrf(
		dailyResults,
		asBasisPoints(defaultFeeRates.irrfRateBps)
	)

	const darf = computeDarf({
		grossGainCents,
		totalFeesCents,
		irrfCents: irrfResult.totalIrrfCents,
		carryoverInCents,
		deferredIrInCents,
		irRateBps: asBasisPoints(defaultFeeRates.irRateBps),
		subjectToPersonalIr: defaultFeeRates.subjectToPersonalIr,
	})

	const netLiquidCents = grossGainCents - totalFeesCents - darf.darfDue

	const computedAt = new Date()

	const output: RecomputeOutput = {
		grossGainCents,
		totalTxCorretagemCents,
		totalTxRegistroCents,
		totalEmolumentosCents,
		totalIssCents,
		totalFeesCents,
		totalContractsExecuted,
		irrfCents: irrfResult.totalIrrfCents,
		netGainBeforeCarryoverCents: darf.netGainBeforeCarryover,
		carryoverInCents,
		carryoverConsumedCents: darf.carryoverConsumed,
		carryoverOutCents: darf.carryoverOut,
		taxableGainCents: darf.taxableGain,
		irGrossCents: darf.irGross,
		darfDueCents: darf.darfDue,
		deferredIrCents: darf.deferredIrOutCents,
		netLiquidCents,
		tradeCount,
		isDirty: false,
		computedAt,
	}

	const persistable = {
		...output,
		totalContractsExecuted: String(output.totalContractsExecuted),
	}

	// Status derives from darfDueCents: zero-due months are "exempt" (no DARF
	// emission required), positive-due are "pending" until user confirms payment.
	// On conflict we must preserve "paid" — payment records are immutable user
	// truth, never overwritten by recompute.
	const derivedStatus: "exempt" | "pending" =
		output.darfDueCents === 0 ? "exempt" : "pending"

	await db
		.insert(monthlyTaxLedger)
		.values({
			accountId,
			month: monthStart,
			...persistable,
			darfStatus: derivedStatus,
			updatedAt: computedAt,
		})
		.onConflictDoUpdate({
			target: [monthlyTaxLedger.accountId, monthlyTaxLedger.month],
			set: {
				...persistable,
				darfStatus: sql`CASE WHEN ${monthlyTaxLedger.darfStatus} = 'paid' THEN 'paid'::darf_status ELSE ${derivedStatus}::darf_status END`,
				updatedAt: computedAt,
			},
		})

	return output
}

export type { RecomputeInput, RecomputeOutput }
export { recomputeAccountMonth }
