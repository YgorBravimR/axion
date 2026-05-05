"use server"

import { db } from "@/db/drizzle"
import { accountCapitalEvents, monthlyRiskConfig, tradingAccounts } from "@/db/schema"
import { eq, and, asc, gte, lte } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import { invalidateAggregates } from "@/lib/aggregation/invalidate"
import { getMonthAggregate, getWeekAggregate } from "@/lib/queries/period-queries"
import { getWeeksInYear } from "@/lib/calendar/iso-week"
import type { CapitalEvent } from "@/types/integration"

interface RecordCapitalEventParams {
	eventType: "deposit" | "withdrawal"
	amountCents: number
	eventDate: string // ISO "YYYY-MM-DD"
	notes?: string
}

interface ActionResult<T = void> {
	status: "success" | "error"
	data?: T
	message?: string
}

interface WeeklyMetaRow {
	isoWeek: number
	weekStart: string
	weekEnd: string
	metaBruto: number | null
	metaLiquido: number | null
	resultado: number
	autoRetirada: number
	disabled: boolean
}

interface WeeklyMetaVsRealData {
	year: number
	hasPlan: boolean
	withdrawalTargetPercent: number | null
	weeks: WeeklyMetaRow[]
}

interface AnnualRollupRow {
	month: number
	monthName: string
	disabled: boolean
	resultadoBruto: number | null
	resultadoLiquido: number | null
	pontos: number | null
	taxas: number | null
	imposto: number | null
	impostoEstimated: boolean
	aporteInicial: number | null
	mesAnterior: number | null
	diasGain: number
	diasLoss: number
	mensalEsperado: number | null
	mensalMaximo: number | null
	novoAporte: number
	retirada: number
	capitalInvestido: number | null
	patrimonio: number | null
	hasTrades: boolean
}

interface AnnualRollupTotals {
	resultadoBruto: number
	resultadoLiquido: number
	pontos: number
	taxas: number
	imposto: number
	diasGain: number
	diasLoss: number
	mensalEsperado: number
	mensalMaximo: number
	novoAporte: number
	retirada: number
	capitalInvestido: number
	patrimonio: number | null
}

interface AnnualRollupData {
	year: number
	rows: AnnualRollupRow[]
	totals: AnnualRollupTotals
	taxEstimated: boolean
	withdrawalTargetPercent: number | null
}

const MONTH_NAMES = [
	"Janeiro",
	"Fevereiro",
	"Março",
	"Abril",
	"Maio",
	"Junho",
	"Julho",
	"Agosto",
	"Setembro",
	"Outubro",
	"Novembro",
	"Dezembro",
] as const

const recordCapitalEvent = async (
	params: RecordCapitalEventParams,
): Promise<ActionResult<{ id: string }>> => {
	const { accountId } = await requireAuth()

	if (!["deposit", "withdrawal"].includes(params.eventType)) {
		return { status: "error", message: "Invalid event type" }
	}
	if (!Number.isInteger(params.amountCents) || params.amountCents <= 0) {
		return { status: "error", message: "Amount must be a positive integer (cents)" }
	}
	const eventDateObj = new Date(params.eventDate)
	if (Number.isNaN(eventDateObj.getTime())) {
		return { status: "error", message: "Invalid event date" }
	}
	if (eventDateObj > new Date()) {
		return { status: "error", message: "Event date cannot be in the future" }
	}

	const [inserted] = await db
		.insert(accountCapitalEvents)
		.values({
			accountId,
			eventType: params.eventType,
			amountCents: params.amountCents,
			eventDate: params.eventDate,
			notes: params.notes ?? null,
		})
		.returning({ id: accountCapitalEvents.id })

	await invalidateAggregates(accountId, eventDateObj)

	return { status: "success", data: { id: inserted.id } }
}

const deleteCapitalEvent = async (id: string): Promise<ActionResult> => {
	const { accountId } = await requireAuth()

	const rows = await db
		.select()
		.from(accountCapitalEvents)
		.where(and(eq(accountCapitalEvents.id, id), eq(accountCapitalEvents.accountId, accountId)))
		.limit(1)

	if (!rows[0]) {
		return { status: "error", message: "Event not found or access denied" }
	}

	const eventDate = new Date(rows[0].eventDate)
	await db.delete(accountCapitalEvents).where(eq(accountCapitalEvents.id, id))
	await invalidateAggregates(accountId, eventDate)

	return { status: "success" }
}

const getCapitalSnapshot = async (): Promise<
	ActionResult<{ balanceCents: number; events: CapitalEvent[] }>
> => {
	const { accountId } = await requireAuth()

	const accountRows = await db
		.select({ startingBalanceCents: tradingAccounts.startingBalanceCents })
		.from(tradingAccounts)
		.where(eq(tradingAccounts.id, accountId))
		.limit(1)

	const starting = accountRows[0]?.startingBalanceCents ?? 0

	const events = await db
		.select()
		.from(accountCapitalEvents)
		.where(eq(accountCapitalEvents.accountId, accountId))
		.orderBy(asc(accountCapitalEvents.eventDate))

	let balanceCents = starting
	const mappedEvents: CapitalEvent[] = events.map((e) => {
		if (e.eventType === "deposit") {
			balanceCents += e.amountCents
		} else {
			balanceCents -= e.amountCents
		}
		return {
			id: e.id,
			eventType: e.eventType,
			amountCents: e.amountCents,
			eventDate: e.eventDate,
			notes: e.notes ?? undefined,
		}
	})

	return {
		status: "success",
		data: { balanceCents, events: mappedEvents },
	}
}

/**
 * Mensal Máximo derivation. When yearlyPlans data is available, the full formula
 * applies (maxContracts × pointValue × hitRate × dailyPoints × sessions). That table
 * doesn't exist yet, so the current implementation always uses the fallback:
 *   mensalMaximo = round(mensalEsperado × 1.5)
 * Returns isEstimate: true to flag the fallback for the UI footnote.
 */
const getMensalMaximo = (params: {
	mensalEsperado: number | null
}): { value: number | null; isEstimate: boolean } => {
	const { mensalEsperado } = params
	if (mensalEsperado === null) return { value: null, isEstimate: true }
	return { value: Math.round(mensalEsperado * 1.5), isEstimate: true }
}

/**
 * Returns all ISO weeks for `year` with Meta Bruto, Meta Líquido, Resultado, and
 * auto-withdrawal projection. Weeks before account start are disabled (resultado=0).
 *
 * UTC-anchored week boundaries via the canonical "Jan 4 always lives in ISO week 1"
 * rule, matching period-queries' aggregate boundaries. date-fns weekStart/weekEnd
 * are local-tz and would drift on non-UTC servers.
 *
 * Meta fields stay null — fractal cascade owns plan/target data; this view
 * surfaces actuals only.
 */
const getWeeklyMetaVsReal = async (
	year: number,
): Promise<ActionResult<WeeklyMetaVsRealData>> => {
	const { accountId } = await requireAuth()

	const accountRows = await db
		.select({
			accountStartMonth: tradingAccounts.accountStartMonth,
			accountStartYear: tradingAccounts.accountStartYear,
			withdrawalTargetPercent: tradingAccounts.withdrawalTargetPercent,
		})
		.from(tradingAccounts)
		.where(eq(tradingAccounts.id, accountId))
		.limit(1)

	const account = accountRows[0]
	if (!account) return { status: "error", message: "Account not found" }

	const withdrawalTarget = account.withdrawalTargetPercent
		? parseFloat(account.withdrawalTargetPercent.toString())
		: null
	const effectiveWithdrawal = withdrawalTarget && withdrawalTarget > 0 ? withdrawalTarget : null

	const accountStartUtc =
		account.accountStartYear && account.accountStartMonth
			? new Date(Date.UTC(account.accountStartYear, account.accountStartMonth - 1, 1))
			: null

	const hasPlan = false

	const totalWeeks = getWeeksInYear(year)
	const weeks: WeeklyMetaRow[] = []

	for (let isoWeek = 1; isoWeek <= totalWeeks; isoWeek++) {
		const jan4Utc = new Date(Date.UTC(year, 0, 4))
		const someDayInWeekUtc = new Date(jan4Utc)
		someDayInWeekUtc.setUTCDate(jan4Utc.getUTCDate() + (isoWeek - 1) * 7)
		const dayOfWeek = someDayInWeekUtc.getUTCDay()
		const mondayOffset = (dayOfWeek + 6) % 7
		const wStart = new Date(someDayInWeekUtc)
		wStart.setUTCDate(someDayInWeekUtc.getUTCDate() - mondayOffset)
		wStart.setUTCHours(0, 0, 0, 0)
		const wEnd = new Date(wStart)
		wEnd.setUTCDate(wStart.getUTCDate() + 6)

		const isDisabled = accountStartUtc !== null && wStart < accountStartUtc

		let resultado = 0
		if (!isDisabled) {
			const agg = await getWeekAggregate(accountId, year, isoWeek)
			resultado = agg.netCents
		}

		const autoRetirada =
			effectiveWithdrawal && resultado > 0
				? Math.round(resultado * (effectiveWithdrawal / 100))
				: 0

		weeks.push({
			isoWeek,
			weekStart: wStart.toISOString().slice(0, 10),
			weekEnd: wEnd.toISOString().slice(0, 10),
			metaBruto: null,
			metaLiquido: null,
			resultado,
			autoRetirada,
			disabled: isDisabled,
		})
	}

	return {
		status: "success",
		data: { year, hasPlan, withdrawalTargetPercent: effectiveWithdrawal, weeks },
	}
}

/**
 * Returns 12 monthly rows + totals for the annual rollup table.
 * Months before accountStartMonth/Year are disabled with null numeric values.
 *
 * Tax handling: encryption is currently disabled, so account.dayTradeTaxRate is
 * the plaintext "20.00" string (default). parseFloat directly. When encryption
 * is re-enabled, this needs the dek/decryptField path.
 *
 * UTC month extraction for capital events: eventDate is Postgres `date` → "YYYY-MM-DD".
 * `new Date("YYYY-MM-DD")` parses as UTC midnight; `.getUTCMonth()` keeps us aligned
 * with the UTC-anchored month boundaries in period-queries.
 */
const getAnnualRollup = async (
	year: number,
): Promise<ActionResult<AnnualRollupData>> => {
	const { accountId } = await requireAuth()

	const accountRows = await db
		.select({
			accountStartMonth: tradingAccounts.accountStartMonth,
			accountStartYear: tradingAccounts.accountStartYear,
			startingBalanceCents: tradingAccounts.startingBalanceCents,
			withdrawalTargetPercent: tradingAccounts.withdrawalTargetPercent,
			dayTradeTaxRate: tradingAccounts.dayTradeTaxRate,
		})
		.from(tradingAccounts)
		.where(eq(tradingAccounts.id, accountId))
		.limit(1)

	const account = accountRows[0]
	if (!account) return { status: "error", message: "Account not found" }

	const taxRatePct = parseFloat(account.dayTradeTaxRate) || 0
	const taxRate = taxRatePct / 100

	const withdrawalTarget = account.withdrawalTargetPercent
		? parseFloat(account.withdrawalTargetPercent.toString())
		: null
	const effectiveWithdrawal = withdrawalTarget && withdrawalTarget > 0 ? withdrawalTarget : null

	const startYear = account.accountStartYear ?? null
	const startMonth = account.accountStartMonth ?? null

	const capitalEventsRows = await db
		.select()
		.from(accountCapitalEvents)
		.where(
			and(
				eq(accountCapitalEvents.accountId, accountId),
				gte(accountCapitalEvents.eventDate, `${year}-01-01`),
				lte(accountCapitalEvents.eventDate, `${year}-12-31`),
			),
		)
		.orderBy(asc(accountCapitalEvents.eventDate))

	const depositsByMonth = new Map<number, number>()
	const withdrawalsByMonth = new Map<number, number>()
	for (const ev of capitalEventsRows) {
		const evMonth = new Date(ev.eventDate).getUTCMonth() + 1
		if (ev.eventType === "deposit") {
			depositsByMonth.set(evMonth, (depositsByMonth.get(evMonth) ?? 0) + ev.amountCents)
		} else {
			withdrawalsByMonth.set(evMonth, (withdrawalsByMonth.get(evMonth) ?? 0) + ev.amountCents)
		}
	}

	const plansRows = await db
		.select({
			month: monthlyRiskConfig.month,
			dailyProfitTargetCents: monthlyRiskConfig.dailyProfitTargetCents,
			accountBalance: monthlyRiskConfig.accountBalance,
		})
		.from(monthlyRiskConfig)
		.where(and(eq(monthlyRiskConfig.accountId, accountId), eq(monthlyRiskConfig.year, year)))

	const planByMonth = new Map(plansRows.map((p) => [p.month, p]))

	let runningPatrimonio: number | null = account.startingBalanceCents ?? null
	const rows: AnnualRollupRow[] = []

	for (let month = 1; month <= 12; month++) {
		const isDisabled =
			startYear !== null && startMonth !== null
				? year < startYear || (year === startYear && month < startMonth)
				: false

		if (isDisabled) {
			rows.push({
				month,
				monthName: MONTH_NAMES[month - 1],
				disabled: true,
				resultadoBruto: null,
				resultadoLiquido: null,
				pontos: null,
				taxas: null,
				imposto: null,
				impostoEstimated: false,
				aporteInicial: null,
				mesAnterior: null,
				diasGain: 0,
				diasLoss: 0,
				mensalEsperado: null,
				mensalMaximo: null,
				novoAporte: 0,
				retirada: 0,
				capitalInvestido: null,
				patrimonio: null,
				hasTrades: false,
			})
			continue
		}

		const agg = await getMonthAggregate(accountId, year, month)
		const plan = planByMonth.get(month)
		const novoAporte = depositsByMonth.get(month) ?? 0
		const retirada = withdrawalsByMonth.get(month) ?? 0
		const mesAnterior = runningPatrimonio

		const mensalEsperado = plan?.dailyProfitTargetCents ? plan.dailyProfitTargetCents * 20 : null
		const { value: mensalMaximo } = getMensalMaximo({ mensalEsperado })

		// Tax estimation — Tax Engine sub-project not deployed; uses account's tax rate.
		const imposto = agg.netCents > 0 ? Math.round(agg.netCents * taxRate) : 0
		const taxas = agg.grossCents - agg.netCents

		const capitalInvestido = mesAnterior !== null ? mesAnterior + novoAporte : null
		const patrimonio =
			capitalInvestido !== null ? capitalInvestido + agg.netCents - retirada : null
		runningPatrimonio = patrimonio

		// monthlyRiskConfig.accountBalance is text-encrypted but plaintext while encryption disabled.
		const aporteInicial = plan?.accountBalance ? parseInt(plan.accountBalance, 10) || null : null

		rows.push({
			month,
			monthName: MONTH_NAMES[month - 1],
			disabled: false,
			resultadoBruto: agg.grossCents,
			resultadoLiquido: agg.netCents,
			pontos: agg.points,
			taxas,
			imposto,
			impostoEstimated: true,
			aporteInicial,
			mesAnterior,
			diasGain: agg.gainDays,
			diasLoss: agg.lossDays,
			mensalEsperado,
			mensalMaximo,
			novoAporte,
			retirada,
			capitalInvestido,
			patrimonio,
			hasTrades: agg.tradingDays > 0,
		})
	}

	const activeRows = rows.filter((r) => !r.disabled)
	const totals: AnnualRollupTotals = {
		resultadoBruto: activeRows.reduce((s, r) => s + (r.resultadoBruto ?? 0), 0),
		resultadoLiquido: activeRows.reduce((s, r) => s + (r.resultadoLiquido ?? 0), 0),
		pontos: activeRows.reduce((s, r) => s + (r.pontos ?? 0), 0),
		taxas: activeRows.reduce((s, r) => s + (r.taxas ?? 0), 0),
		imposto: activeRows.reduce((s, r) => s + (r.imposto ?? 0), 0),
		diasGain: activeRows.reduce((s, r) => s + r.diasGain, 0),
		diasLoss: activeRows.reduce((s, r) => s + r.diasLoss, 0),
		mensalEsperado: activeRows.reduce((s, r) => s + (r.mensalEsperado ?? 0), 0),
		mensalMaximo: activeRows.reduce((s, r) => s + (r.mensalMaximo ?? 0), 0),
		novoAporte: activeRows.reduce((s, r) => s + r.novoAporte, 0),
		retirada: activeRows.reduce((s, r) => s + r.retirada, 0),
		capitalInvestido: activeRows.reduce((s, r) => s + (r.capitalInvestido ?? 0), 0),
		patrimonio: activeRows[activeRows.length - 1]?.patrimonio ?? null,
	}

	return {
		status: "success",
		data: {
			year,
			rows,
			totals,
			taxEstimated: true,
			withdrawalTargetPercent: effectiveWithdrawal,
		},
	}
}

export {
	recordCapitalEvent,
	deleteCapitalEvent,
	getCapitalSnapshot,
	getWeeklyMetaVsReal,
	getAnnualRollup,
	MONTH_NAMES,
}
export type { WeeklyMetaRow, WeeklyMetaVsRealData, AnnualRollupRow, AnnualRollupTotals, AnnualRollupData }
