// src/lib/tax/recompute-month.ts
import { db } from "@/db/drizzle"
import { trades, accountFeeRates, monthlyTaxLedger, tradingAccounts } from "@/db/schema"
import { eq, and, gte, lte, isNull } from "drizzle-orm"
import { startOfMonth, endOfMonth } from "date-fns"
import { getUserDek, decryptTradeFields } from "@/lib/user-crypto"
import { computeDayFees } from "./fee-allocator"
import { accumulateIrrf } from "./irrf-accumulator"
import { computeDarf } from "./darf-calculator"

interface RecomputeInput {
	accountId: string
	year: number
	month: number        // 1–12
	carryoverInCents: number
	userId: string
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
 * @param input - accountId, year, month (1-12), carryoverIn, userId for decryption
 */
const recomputeAccountMonth = async (input: RecomputeInput): Promise<RecomputeOutput> => {
	const { accountId, year, month, carryoverInCents, userId } = input

	const monthDate = new Date(year, month - 1, 1)
	const monthStart = startOfMonth(monthDate)
	const monthEnd = endOfMonth(monthDate)

	// Replay accounts: tax engine disabled entirely. Replay trades are simulated
	// against historical data and have no real-world tax obligation.
	const accountRow = await db
		.select({ accountType: tradingAccounts.accountType })
		.from(tradingAccounts)
		.where(eq(tradingAccounts.id, accountId))
		.then((rows) => rows[0])

	if (accountRow?.accountType === "replay") {
		return {
			grossGainCents: 0,
			totalTxCorretagemCents: 0,
			totalTxRegistroCents: 0,
			totalEmolumentosCents: 0,
			totalIssCents: 0,
			totalFeesCents: 0,
			totalContractsExecuted: 0,
			irrfCents: 0,
			netGainBeforeCarryoverCents: 0,
			carryoverInCents: 0,
			carryoverConsumedCents: 0,
			carryoverOutCents: 0,
			taxableGainCents: 0,
			irGrossCents: 0,
			darfDueCents: 0,
			netLiquidCents: 0,
			tradeCount: 0,
			isDirty: false,
			computedAt: new Date(),
		}
	}

	// Fetch fee rates for this account (NULL assetSymbol = catch-all default)
	const feeRatesRows = await db
		.select()
		.from(accountFeeRates)
		.where(
			and(
				eq(accountFeeRates.accountId, accountId),
				isNull(accountFeeRates.assetSymbol),
			),
		)

	const feeRates = feeRatesRows[0] ?? {
		txCorretagemCents: 5,
		txRegistroCents: 74,
		emolumentosCents: 40,
		issRatePercent: "5.00",
		irrfRateBps: 100,
		irRateBps: 2000,
		subjectToPersonalIr: true,
	}

	// Fetch all closed trades in the month window
	const rawTrades = await db
		.select({
			id: trades.id,
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
				lte(trades.exitDate, monthEnd),
			),
		)
		.orderBy(trades.exitDate)

	// Encryption is currently disabled (getUserDek always returns null).
	// When dek is null, pnl is already plaintext string-encoded cents.
	const dek = await getUserDek(userId)
	const decryptedTrades = dek ? rawTrades.map((t) => decryptTradeFields(t, dek)) : rawTrades

	// Group trades by exit day; only count same-day entries (day-trades)
	const dayMap = new Map<string, { pnlCents: number; contracts: number }>()
	let tradeCount = 0

	for (const trade of decryptedTrades) {
		// Skip trades with no exit date
		if (!trade.exitDate) continue

		// Skip swing trades — entry and exit must be on the same calendar day.
		// Use year/month/date components to avoid toISOString() timezone drift.
		const entry = trade.entryDate
		const exit = trade.exitDate
		const sameDay =
			entry.getFullYear() === exit.getFullYear() &&
			entry.getMonth() === exit.getMonth() &&
			entry.getDate() === exit.getDate()
		if (!sameDay) continue

		// Fail loudly on corrupted numeric fields — silently propagating NaN
		// into aggregates would poison every dependent tax calculation.
		const pnlCents = Number(trade.pnl ?? 0)
		if (Number.isNaN(pnlCents)) {
			throw new Error(`recompute-month: non-numeric pnl on trade ${trade.id}`)
		}

		const contracts = parseFloat(String(trade.contractsExecuted ?? 0))

		// Day key derived from local date components, not toISOString(), to avoid
		// UTC midnight boundary issues on non-UTC servers.
		const dayKey = `${exit.getFullYear()}-${exit.getMonth()}-${exit.getDate()}`

		const existing = dayMap.get(dayKey) ?? { pnlCents: 0, contracts: 0 }
		dayMap.set(dayKey, {
			pnlCents: existing.pnlCents + pnlCents,
			contracts: existing.contracts + contracts,
		})
		tradeCount++
	}

	// Aggregate fees and build dailyResults for IRRF accumulation
	let grossGainCents = 0
	let totalTxCorretagemCents = 0
	let totalTxRegistroCents = 0
	let totalEmolumentosCents = 0
	let totalIssCents = 0
	let totalContractsExecuted = 0

	const dailyResults: Array<{ date: Date; grossPnlCents: number }> = []

	for (const [, { pnlCents, contracts }] of dayMap.entries()) {
		grossGainCents += pnlCents
		totalContractsExecuted += contracts
		dailyResults.push({ date: monthDate, grossPnlCents: pnlCents })

		const fees = computeDayFees({
			contractsExecuted: contracts,
			rates: {
				txCorretagemCents: feeRates.txCorretagemCents,
				txRegistroCents: feeRates.txRegistroCents,
				emolumentosCents: feeRates.emolumentosCents,
				issRatePercent: parseFloat(String(feeRates.issRatePercent)),
			},
		})
		totalTxCorretagemCents += fees.txCorretagem
		totalTxRegistroCents   += fees.txRegistro
		totalEmolumentosCents  += fees.emolumentos
		totalIssCents          += fees.iss
	}

	const totalFeesCents = totalTxCorretagemCents + totalTxRegistroCents + totalEmolumentosCents + totalIssCents

	const irrfResult = accumulateIrrf(dailyResults, feeRates.irrfRateBps)

	const darf = computeDarf({
		grossGainCents,
		totalFeesCents,
		irrfCents: irrfResult.totalIrrfCents,
		carryoverInCents,
		irRateBps: feeRates.irRateBps,
		subjectToPersonalIr: feeRates.subjectToPersonalIr,
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
		netLiquidCents,
		tradeCount,
		isDirty: false,
		computedAt,
	}

	// Upsert monthly tax ledger — conflict on (accountId, month) → update all fields
	await db
		.insert(monthlyTaxLedger)
		.values({
			accountId,
			month: monthDate,
			...output,
			updatedAt: computedAt,
		} as typeof monthlyTaxLedger.$inferInsert)
		.onConflictDoUpdate({
			target: [monthlyTaxLedger.accountId, monthlyTaxLedger.month],
			set: {
				...output,
				updatedAt: computedAt,
			},
		})

	return output
}

export type { RecomputeInput, RecomputeOutput }
export { recomputeAccountMonth }
