"use server"

import { getTranslations } from "next-intl/server"
import { requireAuth } from "@/app/actions/auth"
import { db } from "@/db/drizzle"
import { accountFeeRates, monthlyTaxLedger, tradingAccounts } from "@/db/schema"
import { isMonthFinalized } from "@/lib/tax/month-status"
import { recomputeAccountMonth } from "@/lib/tax/recompute-month"
import type {
	FeeRatesEntry,
	FeeRatesRow,
	MonthlyDarfRow,
	YearTaxSummary,
} from "@/lib/tax/types"
import type { DarfAlertEntry, DarfAlertSummary } from "./tax-engine.types"
import type { ActionResponse } from "@/types"
import { recomputeLedgerSchema } from "@/lib/validations/tax-engine"
import { and, asc, eq, gte, isNull, lte } from "drizzle-orm"

// ─── Internal: verify account ownership ──────────────────────────────────────

const verifyAccountOwnership = async (
	accountId: string,
	userId: string
): Promise<{ id: string; showTaxEstimates: boolean } | null> => {
	const account = await db
		.select({
			id: tradingAccounts.id,
			showTaxEstimates: tradingAccounts.showTaxEstimates,
		})
		.from(tradingAccounts)
		.where(
			and(eq(tradingAccounts.id, accountId), eq(tradingAccounts.userId, userId))
		)
		.then((rows) => rows[0])

	return account ?? null
}

// ─── Internal: recomputeFromMonth ─────────────────────────────────────────────

/**
 * Recomputes all months from (year, month) to present in chronological order.
 * Threads carryoverOut → carryoverIn to maintain chain integrity.
 * Returns count of months recomputed.
 */
const recomputeFromMonth = async (params: {
	accountId: string
	year: number
	month: number
}): Promise<number> => {
	const { accountId } = params
	// timestamptz: ledger.month stored as UTC first-of-month. Iterate integer
	// year/month so we never feed local-TZ Dates into eq() matchers, and we
	// avoid date-fns addMonths DST drift around UTC-anchored instants.
	const toUtcMonth = (y: number, m: number): Date =>
		new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0))

	let year = params.year
	let month = params.month

	const prevYear = month === 1 ? year - 1 : year
	const prevMonthIdx = month === 1 ? 12 : month - 1
	const prevRow = await db
		.select({ carryoverOutCents: monthlyTaxLedger.carryoverOutCents })
		.from(monthlyTaxLedger)
		.where(
			and(
				eq(monthlyTaxLedger.accountId, accountId),
				eq(monthlyTaxLedger.month, toUtcMonth(prevYear, prevMonthIdx))
			)
		)
		.then((rows) => rows[0])

	let carryoverIn = prevRow?.carryoverOutCents ?? 0
	let recomputedCount = 0

	const now = new Date()
	const nowYear = now.getUTCFullYear()
	const nowMonth = now.getUTCMonth() + 1
	const reachedFuture = (): boolean =>
		year > nowYear || (year === nowYear && month > nowMonth)

	while (!reachedFuture()) {
		// eslint-disable-next-line no-await-in-loop -- tax months must be computed sequentially; carryoverIn depends on previous month's carryoverOut
		const result = await recomputeAccountMonth({
			accountId,
			year,
			month,
			carryoverInCents: carryoverIn,
		})

		carryoverIn = result.carryoverOutCents
		recomputedCount++

		if (month === 12) {
			year += 1
			month = 1
		} else {
			month += 1
		}
	}

	return recomputedCount
}

// ─── getMonthlyDarf ───────────────────────────────────────────────────────────

/**
 * Returns the monthly DARF ledger row for a given account + month.
 * Lazy-recomputes if the row is missing or dirty (propagates carryover chain).
 */
export const getMonthlyDarf = async (params: {
	accountId: string
	year: number
	month: number
}): Promise<ActionResponse<MonthlyDarfRow>> => {
	const t = await getTranslations("tax.errors")
	const { userId } = await requireAuth()
	const { accountId, year, month } = params

	const account = await verifyAccountOwnership(accountId, userId)

	if (!account) {
		return {
			status: "error",
			message: t("accountNotFound"),
			errors: [{ code: "ACCOUNT_NOT_FOUND", detail: "Account not found." }],
		}
	}

	if (!account.showTaxEstimates) {
		return {
			status: "error",
			message: t("taxDisabled"),
			errors: [
				{
					code: "TAX_DISABLED",
					detail: "Tax estimates are disabled for this account.",
				},
			],
		}
	}

	// timestamptz: align matcher with UTC-stored first-of-month.
	const monthDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))

	const existing = await db
		.select()
		.from(monthlyTaxLedger)
		.where(
			and(
				eq(monthlyTaxLedger.accountId, accountId),
				eq(monthlyTaxLedger.month, monthDate)
			)
		)
		.then((rows) => rows[0])

	if (!existing || existing.isDirty) {
		await recomputeFromMonth({ accountId, year, month })
	}

	const row = await db
		.select()
		.from(monthlyTaxLedger)
		.where(
			and(
				eq(monthlyTaxLedger.accountId, accountId),
				eq(monthlyTaxLedger.month, monthDate)
			)
		)
		.then((rows) => rows[0])

	if (!row) {
		return {
			status: "error",
			message: t("ledgerNotFound"),
			errors: [
				{ code: "LEDGER_NOT_FOUND", detail: "Could not compute ledger row." },
			],
		}
	}

	return {
		status: "success",
		message: t("ledgerRowRetrieved"),
		data: row as MonthlyDarfRow,
	}
}

// ─── getCarryoverState ────────────────────────────────────────────────────────

/**
 * Returns the current outstanding carryover balance and full monthly history.
 */
export const getCarryoverState = async (params: {
	accountId: string
}): Promise<
	ActionResponse<{
		currentBalanceCents: number
		history: Array<{
			month: Date
			balanceCents: number
			consumed: number
			netGainCents: number
		}>
	}>
> => {
	const t = await getTranslations("tax.errors")
	const { userId } = await requireAuth()
	const { accountId } = params

	const account = await verifyAccountOwnership(accountId, userId)

	if (!account) {
		return {
			status: "error",
			message: t("accountNotFound"),
			errors: [{ code: "ACCOUNT_NOT_FOUND", detail: "Account not found." }],
		}
	}

	const rows = await db
		.select({
			month: monthlyTaxLedger.month,
			carryoverOutCents: monthlyTaxLedger.carryoverOutCents,
			carryoverConsumedCents: monthlyTaxLedger.carryoverConsumedCents,
			netGainBeforeCarryoverCents: monthlyTaxLedger.netGainBeforeCarryoverCents,
		})
		.from(monthlyTaxLedger)
		.where(eq(monthlyTaxLedger.accountId, accountId))
		.orderBy(asc(monthlyTaxLedger.month))

	const history = rows.map((row) => ({
		month: row.month,
		balanceCents: row.carryoverOutCents,
		consumed: row.carryoverConsumedCents,
		netGainCents: row.netGainBeforeCarryoverCents,
	}))

	const currentBalanceCents = history.at(-1)?.balanceCents ?? 0

	return {
		status: "success",
		message: t("carryoverStateRetrieved"),
		data: { currentBalanceCents, history },
	}
}

// ─── recomputeLedger ──────────────────────────────────────────────────────────

/**
 * Force-recomputes all ledger rows from fromYear/fromMonth to present.
 * Threads carryoverOut → carryoverIn across months.
 */
export const recomputeLedger = async (params: {
	accountId: string
	fromYear?: number
	fromMonth?: number
}): Promise<ActionResponse<{ recomputedMonths: number }>> => {
	const t = await getTranslations("tax.errors")
	const parsed = recomputeLedgerSchema.safeParse(params)
	if (!parsed.success) {
		return {
			status: "error",
			message: t("invalidInput"),
			errors: parsed.error.issues.map((issue) => ({
				code: "INVALID_INPUT",
				detail: issue.message,
			})),
		}
	}

	const { userId } = await requireAuth()
	const { accountId } = parsed.data

	const account = await verifyAccountOwnership(accountId, userId)

	if (!account) {
		return {
			status: "error",
			message: t("accountNotFound"),
			errors: [{ code: "ACCOUNT_NOT_FOUND", detail: "Account not found." }],
		}
	}

	let startYear = parsed.data.fromYear
	let startMonth = parsed.data.fromMonth

	if (!startYear || !startMonth) {
		const earliest = await db
			.select({ month: monthlyTaxLedger.month })
			.from(monthlyTaxLedger)
			.where(eq(monthlyTaxLedger.accountId, accountId))
			.orderBy(asc(monthlyTaxLedger.month))
			.limit(1)
			.then((rows) => rows[0])

		if (earliest) {
			startYear = earliest.month.getFullYear()
			startMonth = earliest.month.getMonth() + 1
		} else {
			return {
				status: "success",
				message: t("noLedgerRowsToRecompute"),
				data: { recomputedMonths: 0 },
			}
		}
	}

	const recomputedMonths = await recomputeFromMonth({
		accountId,
		year: startYear,
		month: startMonth,
	})

	return {
		status: "success",
		message: t("ledgerRecomputedMonths", { months: recomputedMonths }),
		data: { recomputedMonths },
	}
}

// ─── getYearTaxSummary ────────────────────────────────────────────────────────

/**
 * Returns year-to-date tax rollup for annual reporting integration.
 */
export const getYearTaxSummary = async (params: {
	accountId: string
	year: number
}): Promise<ActionResponse<YearTaxSummary>> => {
	const t = await getTranslations("tax.errors")
	const { userId } = await requireAuth()
	const { accountId, year } = params

	const account = await verifyAccountOwnership(accountId, userId)

	if (!account) {
		return {
			status: "error",
			message: t("accountNotFound"),
			errors: [{ code: "ACCOUNT_NOT_FOUND", detail: "Account not found." }],
		}
	}

	// timestamptz: ledger.month is UTC first-of-month. Use UTC bounds so the
	// gte/lte window aligns exactly with stored instants on every host TZ.
	const yearStart = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0))
	const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999))

	const rows = await db
		.select()
		.from(monthlyTaxLedger)
		.where(
			and(
				eq(monthlyTaxLedger.accountId, accountId),
				gte(monthlyTaxLedger.month, yearStart),
				lte(monthlyTaxLedger.month, yearEnd)
			)
		)

	const summary = rows.reduce(
		(acc, row) => ({
			grossGainCents: acc.grossGainCents + row.grossGainCents,
			totalFeesCents: acc.totalFeesCents + row.totalFeesCents,
			totalIrrfCents: acc.totalIrrfCents + row.irrfCents,
			totalDarfPaidCents:
				acc.totalDarfPaidCents + (row.darfPaidAmountCents ?? 0),
			totalDarfPendingCents:
				acc.totalDarfPendingCents +
				(row.darfStatus === "pending" || row.darfStatus === "overdue"
					? row.darfDueCents
					: 0),
			netLiquidCents: acc.netLiquidCents + row.netLiquidCents,
		}),
		{
			grossGainCents: 0,
			totalFeesCents: 0,
			totalIrrfCents: 0,
			totalDarfPaidCents: 0,
			totalDarfPendingCents: 0,
			netLiquidCents: 0,
		}
	)

	const irBurdenPercent =
		summary.grossGainCents > 0
			? ((summary.totalFeesCents +
					summary.totalDarfPaidCents +
					summary.totalDarfPendingCents) /
					summary.grossGainCents) *
				100
			: 0

	return {
		status: "success",
		message: t("yearTaxSummaryRetrieved"),
		data: {
			...summary,
			irBurdenPercent: Math.round(irBurdenPercent * 100) / 100,
			heuristicWarning: irBurdenPercent > 30,
		},
	}
}

// ─── getDarfAlertSummary ──────────────────────────────────────────────────────

/**
 * Returns months that need the user's attention: overdue DARF (status pending
 * AND darfDueDate < now) and still-pending DARF (status pending AND
 * darfDueDate >= now or null). recompute-month never writes "overdue" itself,
 * so we derive it on read from darfDueDate. Window is last 24 months — long
 * enough to surface anything still unfiled, short enough to keep the query
 * trivially indexed.
 */
export const getDarfAlertSummary = async (params: {
	accountId: string
}): Promise<ActionResponse<DarfAlertSummary>> => {
	const t = await getTranslations("tax.errors")
	const { userId } = await requireAuth()
	const { accountId } = params

	const account = await verifyAccountOwnership(accountId, userId)

	if (!account) {
		return {
			status: "error",
			message: t("accountNotFound"),
			errors: [{ code: "ACCOUNT_NOT_FOUND", detail: "Account not found." }],
		}
	}

	const now = new Date()
	const windowStart = new Date(
		Date.UTC(now.getUTCFullYear() - 2, now.getUTCMonth(), 1, 0, 0, 0, 0)
	)

	const rows = await db
		.select()
		.from(monthlyTaxLedger)
		.where(
			and(
				eq(monthlyTaxLedger.accountId, accountId),
				eq(monthlyTaxLedger.darfStatus, "pending"),
				gte(monthlyTaxLedger.month, windowStart)
			)
		)
		.orderBy(asc(monthlyTaxLedger.month))

	const overdue: DarfAlertEntry[] = []
	const pending: DarfAlertEntry[] = []

	for (const row of rows) {
		if (row.darfDueCents <= 0) {
			continue
		}
		const entry: DarfAlertEntry = {
			year: row.month.getUTCFullYear(),
			month: row.month.getUTCMonth() + 1,
			darfDueCents: row.darfDueCents,
			darfDueDate: row.darfDueDate ?? null,
			derivedStatus:
				row.darfDueDate !== null && row.darfDueDate < now
					? "overdue"
					: "pending",
		}
		if (entry.derivedStatus === "overdue") {
			overdue.push(entry)
		} else {
			pending.push(entry)
		}
	}

	return {
		status: "success",
		message: "ok",
		data: {
			overdueCount: overdue.length,
			pendingCount: pending.length,
			overdueTotalCents: overdue.reduce((s, e) => s + e.darfDueCents, 0),
			pendingTotalCents: pending.reduce((s, e) => s + e.darfDueCents, 0),
			overdue,
			pending,
		},
	}
}

// ─── getEffectiveTaxRate ──────────────────────────────────────────────────────

/**
 * Returns the effective combined tax rate for a month.
 * Used by Yearly Plan for accurate net liquid projections.
 */
export const getEffectiveTaxRate = async (params: {
	accountId: string
	month: string // ISO date string "YYYY-MM-DD"
}): Promise<
	ActionResponse<{
		ratePercent: number
		breakdown: { feesPercent: number; irPercent: number }
	}>
> => {
	const t = await getTranslations("tax.errors")
	const { userId } = await requireAuth()
	const { accountId } = params

	const account = await verifyAccountOwnership(accountId, userId)

	if (!account) {
		return {
			status: "error",
			message: t("accountNotFound"),
			errors: [{ code: "ACCOUNT_NOT_FOUND", detail: "Account not found." }],
		}
	}

	const [y, m] = params.month.split("-").map(Number)
	if (y === undefined || m === undefined) {
		return {
			status: "error",
			message: t("invalidMonthFormat"),
			errors: [
				{
					code: "INVALID_MONTH",
					detail: `Expected YYYY-MM, got ${params.month}`,
				},
			],
		}
	}
	// timestamptz: monthlyTaxLedger.month stored as UTC first-of-month
	const monthDate = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0))

	const row = await db
		.select({
			grossGainCents: monthlyTaxLedger.grossGainCents,
			totalFeesCents: monthlyTaxLedger.totalFeesCents,
			irGrossCents: monthlyTaxLedger.irGrossCents,
		})
		.from(monthlyTaxLedger)
		.where(
			and(
				eq(monthlyTaxLedger.accountId, accountId),
				eq(monthlyTaxLedger.month, monthDate)
			)
		)
		.then((rows) => rows[0])

	if (!row || row.grossGainCents <= 0) {
		return {
			status: "success",
			message: t("noTaxableGainThisMonth"),
			data: { ratePercent: 0, breakdown: { feesPercent: 0, irPercent: 0 } },
		}
	}

	const feesPercent = (row.totalFeesCents / row.grossGainCents) * 100
	const irPercent = (row.irGrossCents / row.grossGainCents) * 100
	const ratePercent = feesPercent + irPercent

	return {
		status: "success",
		message: t("effectiveTaxRateRetrieved"),
		data: {
			ratePercent: Math.round(ratePercent * 100) / 100,
			breakdown: {
				feesPercent: Math.round(feesPercent * 100) / 100,
				irPercent: Math.round(irPercent * 100) / 100,
			},
		},
	}
}

// ─── markDarfPaid ─────────────────────────────────────────────────────────────

/**
 * Marks a DARF as paid. Does NOT trigger recompute — paid records are immutable.
 */
export const markDarfPaid = async (params: {
	accountId: string
	year: number
	month: number
	paidAmountCents: number
}): Promise<ActionResponse<void>> => {
	const t = await getTranslations("tax.errors")
	const { userId } = await requireAuth()
	const { accountId } = params

	const account = await verifyAccountOwnership(accountId, userId)

	if (!account) {
		return {
			status: "error",
			message: t("accountNotFound"),
			errors: [{ code: "ACCOUNT_NOT_FOUND", detail: "Account not found." }],
		}
	}

	if (!isMonthFinalized(params.year, params.month)) {
		return {
			status: "error",
			message: t("monthInProgress"),
			errors: [
				{
					code: "MONTH_NOT_FINALIZED",
					detail: `Month ${params.year}-${String(params.month).padStart(2, "0")} has not ended yet.`,
				},
			],
		}
	}

	// timestamptz: monthlyTaxLedger.month stored as UTC first-of-month. Build the
	// matcher with Date.UTC — local-time `new Date(year, m-1, 1)` shifts by the
	// host TZ offset and silently matches zero rows on non-UTC machines.
	const monthDate = new Date(
		Date.UTC(params.year, params.month - 1, 1, 0, 0, 0, 0)
	)

	const result = await db
		.update(monthlyTaxLedger)
		.set({
			darfStatus: "paid",
			darfPaidAt: new Date(),
			darfPaidAmountCents: params.paidAmountCents,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(monthlyTaxLedger.accountId, accountId),
				eq(monthlyTaxLedger.month, monthDate)
			)
		)
		.returning({ id: monthlyTaxLedger.id })

	if (result.length === 0) {
		return {
			status: "error",
			message: t("ledgerRowNotFoundForMonth"),
			errors: [
				{
					code: "LEDGER_ROW_NOT_FOUND",
					detail: `No ledger row for account ${accountId} on ${monthDate.toISOString().slice(0, 7)}.`,
				},
			],
		}
	}

	return { status: "success", message: t("darfMarkedAsPaid") }
}

// ─── getFeeRates ─────────────────────────────────────────────────────────────

const DEFAULT_FEE_RATES: FeeRatesRow = {
	txCorretagemCents: 5,
	txRegistroCents: 74,
	emolumentosCents: 40,
	issRatePercent: "5.00",
	irrfRateBps: 100,
	irRateBps: 2000,
	subjectToPersonalIr: true,
}

export const getFeeRates = async (
	assetSymbol: string | null = null
): Promise<ActionResponse<FeeRatesRow>> => {
	const t = await getTranslations("tax.errors")
	const { accountId } = await requireAuth()

	const matcher =
		assetSymbol === null
			? isNull(accountFeeRates.assetSymbol)
			: eq(accountFeeRates.assetSymbol, assetSymbol)

	const row = await db
		.select({
			txCorretagemCents: accountFeeRates.txCorretagemCents,
			txRegistroCents: accountFeeRates.txRegistroCents,
			emolumentosCents: accountFeeRates.emolumentosCents,
			issRatePercent: accountFeeRates.issRatePercent,
			irrfRateBps: accountFeeRates.irrfRateBps,
			irRateBps: accountFeeRates.irRateBps,
			subjectToPersonalIr: accountFeeRates.subjectToPersonalIr,
		})
		.from(accountFeeRates)
		.where(and(eq(accountFeeRates.accountId, accountId), matcher))
		.then((rows) => rows[0])

	return {
		status: "success",
		message: t("feeRatesRetrieved"),
		data: row ?? DEFAULT_FEE_RATES,
	}
}

// ─── listFeeRates ────────────────────────────────────────────────────────────

export const listFeeRates = async (): Promise<
	ActionResponse<FeeRatesEntry[]>
> => {
	const t = await getTranslations("tax.errors")
	const { accountId } = await requireAuth()

	const rows = await db
		.select({
			assetSymbol: accountFeeRates.assetSymbol,
			txCorretagemCents: accountFeeRates.txCorretagemCents,
			txRegistroCents: accountFeeRates.txRegistroCents,
			emolumentosCents: accountFeeRates.emolumentosCents,
			issRatePercent: accountFeeRates.issRatePercent,
			irrfRateBps: accountFeeRates.irrfRateBps,
			irRateBps: accountFeeRates.irRateBps,
			subjectToPersonalIr: accountFeeRates.subjectToPersonalIr,
		})
		.from(accountFeeRates)
		.where(eq(accountFeeRates.accountId, accountId))

	return {
		status: "success",
		message: t("feeRatesListRetrieved"),
		data: rows,
	}
}

// ─── upsertFeeRates ──────────────────────────────────────────────────────────

export const upsertFeeRates = async (params: {
	assetSymbol?: string | null
	txCorretagemCents: number
	txRegistroCents: number
	emolumentosCents: number
	issRatePercent: string
	irrfRateBps: number
	irRateBps: number
	subjectToPersonalIr: boolean
}): Promise<ActionResponse<void>> => {
	const t = await getTranslations("tax.errors")
	const { accountId } = await requireAuth()
	const { assetSymbol = null, ...rates } = params

	const matcher =
		assetSymbol === null
			? isNull(accountFeeRates.assetSymbol)
			: eq(accountFeeRates.assetSymbol, assetSymbol)

	const existing = await db
		.select({ id: accountFeeRates.id })
		.from(accountFeeRates)
		.where(and(eq(accountFeeRates.accountId, accountId), matcher))
		.then((rows) => rows[0])

	if (existing) {
		await db
			.update(accountFeeRates)
			.set({ ...rates, updatedAt: new Date() })
			.where(eq(accountFeeRates.id, existing.id))
	} else {
		await db.insert(accountFeeRates).values({
			accountId,
			assetSymbol,
			...rates,
		})
	}

	// Rate change retroactively affects all past computations — mark all dirty
	await db
		.update(monthlyTaxLedger)
		.set({ isDirty: true })
		.where(eq(monthlyTaxLedger.accountId, accountId))

	return { status: "success", message: t("feeRatesSaved") }
}

// ─── deleteFeeRates ──────────────────────────────────────────────────────────

export const deleteFeeRates = async (
	assetSymbol: string
): Promise<ActionResponse<void>> => {
	const t = await getTranslations("tax.errors")
	const { accountId } = await requireAuth()

	await db
		.delete(accountFeeRates)
		.where(
			and(
				eq(accountFeeRates.accountId, accountId),
				eq(accountFeeRates.assetSymbol, assetSymbol)
			)
		)

	await db
		.update(monthlyTaxLedger)
		.set({ isDirty: true })
		.where(eq(monthlyTaxLedger.accountId, accountId))

	return { status: "success", message: t("feeRatesOverrideRemoved") }
}

// ─── Exports ──────────────────────────────────────────────────────────────────
