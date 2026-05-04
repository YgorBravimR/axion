"use server"

import { db } from "@/db/drizzle"
import { accountCapitalEvents, tradingAccounts } from "@/db/schema"
import { eq, and, asc } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import { invalidateAggregates } from "@/lib/aggregation/invalidate"
import { getWeekAggregate } from "@/lib/queries/period-queries"
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
 * yearlyPlans / weeklyTargets tables don't exist yet (Yearly Plan sub-project).
 * hasPlan is forced false until that lands; Meta fields stay null.
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

export { recordCapitalEvent, deleteCapitalEvent, getCapitalSnapshot, getWeeklyMetaVsReal, MONTH_NAMES }
export type { WeeklyMetaRow, WeeklyMetaVsRealData }
