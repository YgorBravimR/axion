"use server"

import { db } from "@/db/drizzle"
import { yearlyPlans, weeklyTargets, monthlyPlans } from "@/db/schema"
import type { YearlyPlan, WeeklyTarget } from "@/db/schema"
import type { ActionResponse } from "@/types"
import { eq, and, sql } from "drizzle-orm"
import { z } from "zod"
import { yearlyPlanSchema, weeklyTargetInputSchema } from "@/lib/validations/yearly-plan"
import type { YearlyPlanInput, WeeklyTargetInput } from "@/lib/validations/yearly-plan"
import { requireAuth } from "@/app/actions/auth"
import { toSafeErrorMessage } from "@/lib/error-utils"
import { buildCapitalLadder, contractsForBalance } from "@/lib/yearly-plan/capital-ladder"
import { getWeekNumber, getWeekYear, getWeeksInYear } from "@/lib/calendar/iso-week"
import { getServerEffectiveNow } from "@/lib/effective-date"

interface YearlyPlanWithWeeks {
	plan: YearlyPlan
	weeklyTargets: WeeklyTarget[]
}

const getIsoWeeksForYear = (year: number): { week: number; isoYear: number }[] => {
	const total = getWeeksInYear(year)
	const result: { week: number; isoYear: number }[] = []
	for (let week = 1; week <= total; week++) {
		// All weeks in the calendar year — isoYear matches `year` for the bulk; the
		// week-1/year boundary cases are handled by the caller (we seed weeks for
		// `year`, period). The trade-side ISO mapping (which can place Dec 29 in
		// week 1 of next year) is computed separately at sync time.
		result.push({ week, isoYear: year })
	}
	return result
}

const getYearlyPlan = async (
	year: number,
): Promise<ActionResponse<YearlyPlanWithWeeks | null>> => {
	try {
		const { accountId } = await requireAuth()

		const plan = await db.query.yearlyPlans.findFirst({
			where: and(
				eq(yearlyPlans.accountId, accountId),
				eq(yearlyPlans.year, year),
			),
			with: { weeklyTargets: true },
		})

		if (!plan) {
			return { status: "success", message: "No yearly plan found", data: null }
		}

		const { weeklyTargets: weeks, ...planOnly } = plan as YearlyPlan & {
			weeklyTargets: WeeklyTarget[]
		}

		return {
			status: "success",
			message: "Yearly plan retrieved",
			data: { plan: planOnly, weeklyTargets: weeks },
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to fetch yearly plan",
			errors: [{ code: "FETCH_FAILED", detail: toSafeErrorMessage(error, "getYearlyPlan") }],
		}
	}
}

const upsertYearlyPlan = async (
	input: YearlyPlanInput,
): Promise<ActionResponse<YearlyPlan>> => {
	try {
		const { accountId } = await requireAuth()
		const validated = yearlyPlanSchema.parse(input)

		const existing = await db.query.yearlyPlans.findFirst({
			where: and(
				eq(yearlyPlans.accountId, accountId),
				eq(yearlyPlans.year, validated.year),
			),
		})

		const ladderRules = validated.ladderRules
		const ladder = buildCapitalLadder(ladderRules, validated.valorPorContratoCents)

		if (existing) {
			const [updated] = await db
				.update(yearlyPlans)
				.set({
					initialCapitalCents: validated.initialCapitalCents,
					valorPorContratoCents: validated.valorPorContratoCents,
					irTaxRate: String(validated.irTaxRate),
					tradingDaysPerWeek: validated.tradingDaysPerWeek,
					ladderRules,
					exitParcialPts: String(validated.exitParcialPts),
					exitFinalPts: String(validated.exitFinalPts),
					exitStopPts: String(validated.exitStopPts),
					exitProtPts: String(validated.exitProtPts),
					exitParcialProportion: String(validated.exitParcialProportion),
					exitFinalProportion: String(validated.exitFinalProportion),
					startWeek: validated.startWeek,
					notes: validated.notes ?? null,
					updatedAt: new Date(),
				})
				.where(eq(yearlyPlans.id, existing.id))
				.returning()

			// Recalculate future weekly targets' contracts + valorOperacionalCents.
			// Bulk update via SQL OR predicate is one round-trip vs N+1 selects-then-updates.
			// Future = current ISO week of current ISO year, plus everything in later ISO years.
			const effectiveNow = await getServerEffectiveNow()
			const currentIsoWeek = getWeekNumber(effectiveNow)
			const currentIsoYear = getWeekYear(effectiveNow)
			const newContracts = contractsForBalance(validated.initialCapitalCents, ladder)

			await db
				.update(weeklyTargets)
				.set({
					contracts: newContracts,
					valorOperacionalCents: newContracts * validated.valorPorContratoCents,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(weeklyTargets.yearlyPlanId, existing.id),
						sql`(${weeklyTargets.isoYear} > ${currentIsoYear}
							OR (${weeklyTargets.isoYear} = ${currentIsoYear} AND ${weeklyTargets.isoWeek} >= ${currentIsoWeek}))`,
					),
				)

			return { status: "success", message: "Yearly plan updated", data: updated }
		}

		// Create new plan
		const [newPlan] = await db
			.insert(yearlyPlans)
			.values({
				accountId,
				year: validated.year,
				initialCapitalCents: validated.initialCapitalCents,
				valorPorContratoCents: validated.valorPorContratoCents,
				irTaxRate: String(validated.irTaxRate),
				tradingDaysPerWeek: validated.tradingDaysPerWeek,
				ladderRules,
				exitParcialPts: String(validated.exitParcialPts),
				exitFinalPts: String(validated.exitFinalPts),
				exitStopPts: String(validated.exitStopPts),
				exitProtPts: String(validated.exitProtPts),
				exitParcialProportion: String(validated.exitParcialProportion),
				exitFinalProportion: String(validated.exitFinalProportion),
				startWeek: validated.startWeek,
				notes: validated.notes ?? null,
			})
			.returning()

		// Seed weekly_targets for all ISO weeks in the year (>= startWeek)
		const isoWeeks = getIsoWeeksForYear(validated.year)
		const contracts = contractsForBalance(validated.initialCapitalCents, ladder)

		const weekRows = isoWeeks
			.filter((w) => w.week >= validated.startWeek)
			.map((w) => ({
				yearlyPlanId: newPlan.id,
				isoWeek: w.week,
				isoYear: w.isoYear,
				contracts,
				valorOperacionalCents: contracts * validated.valorPorContratoCents,
				ptsAlvo: null,
				ptsFeito: null,
				ptsSource: "auto" as const,
			}))

		if (weekRows.length > 0) {
			await db.insert(weeklyTargets).values(weekRows)
		}

		return { status: "success", message: "Yearly plan created", data: newPlan }
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				status: "error",
				message: "Validation error",
				errors: error.issues.map((i) => ({
					code: "VALIDATION_ERROR",
					detail: `${i.path.join(".")}: ${i.message}`,
				})),
			}
		}
		return {
			status: "error",
			message: "Failed to save yearly plan",
			errors: [{ code: "SAVE_FAILED", detail: toSafeErrorMessage(error, "upsertYearlyPlan") }],
		}
	}
}

/**
 * Upserts weekly target overrides for a yearly plan.
 * Only updates rows that already exist (seeded at plan creation time).
 * Skips insert to prevent orphan rows outside the plan's ISO week range.
 *
 * @param yearlyPlanId - UUID of the parent yearly plan
 * @param weeks - Array of weekly target inputs (isoWeek + isoYear required)
 */
const upsertWeeklyTargets = async (
	yearlyPlanId: string,
	weeks: WeeklyTargetInput[],
): Promise<ActionResponse<WeeklyTarget[]>> => {
	try {
		await requireAuth()
		const validated = weeks.map((w) => weeklyTargetInputSchema.parse(w))

		const results: WeeklyTarget[] = []

		for (const week of validated) {
			const existing = await db.query.weeklyTargets.findFirst({
				where: and(
					eq(weeklyTargets.yearlyPlanId, yearlyPlanId),
					eq(weeklyTargets.isoWeek, week.isoWeek),
					eq(weeklyTargets.isoYear, week.isoYear),
				),
			})

			if (existing) {
				const [updated] = await db
					.update(weeklyTargets)
					.set({
						...(week.contracts != null && { contracts: week.contracts }),
						...(week.valorOperacionalCents != null && {
							valorOperacionalCents: week.valorOperacionalCents,
						}),
						...(week.ptsAlvo !== undefined && {
							ptsAlvo: week.ptsAlvo != null ? String(week.ptsAlvo) : null,
						}),
						...(week.ptsFeito !== undefined && {
							ptsFeito: week.ptsFeito != null ? String(week.ptsFeito) : null,
						}),
						ptsSource: week.ptsSource,
						...(week.metaBrutoCents !== undefined && { metaBrutoCents: week.metaBrutoCents }),
						...(week.metaLiquidoCents !== undefined && { metaLiquidoCents: week.metaLiquidoCents }),
						updatedAt: new Date(),
					})
					.where(eq(weeklyTargets.id, existing.id))
					.returning()
				results.push(updated)
			}
		}

		return {
			status: "success",
			message: `Updated ${results.length} weekly targets`,
			data: results,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to update weekly targets",
			errors: [{ code: "UPDATE_FAILED", detail: toSafeErrorMessage(error, "upsertWeeklyTargets") }],
		}
	}
}

/**
 * Syncs ptsFeito (actual points) from raw trades into weekly_targets rows.
 * Skips weeks where ptsSource === "manual" to preserve user overrides.
 * Uses EXTRACT(WEEK/YEAR) — matches the ISO week seeding convention.
 *
 * @param yearlyPlanId - UUID of the parent yearly plan
 * @param isoWeeks - ISO week numbers to sync (all matched against plan.year)
 */
const syncWeeklyActuals = async (
	yearlyPlanId: string,
	isoWeeks: number[],
): Promise<ActionResponse<{ synced: number; weeks: WeeklyTarget[] }>> => {
	try {
		const { accountId } = await requireAuth()

		const plan = await db.query.yearlyPlans.findFirst({
			where: eq(yearlyPlans.id, yearlyPlanId),
		})
		if (!plan) {
			return {
				status: "error",
				message: "Plan not found",
				errors: [{ code: "NOT_FOUND", detail: "Yearly plan not found" }],
			}
		}

		const synced: WeeklyTarget[] = []

		for (const isoWeek of isoWeeks) {
			const targetRow = await db.query.weeklyTargets.findFirst({
				where: and(
					eq(weeklyTargets.yearlyPlanId, yearlyPlanId),
					eq(weeklyTargets.isoWeek, isoWeek),
					eq(weeklyTargets.isoYear, plan.year),
				),
			})

			if (!targetRow || targetRow.ptsSource === "manual") continue

			const result = await db.execute<{ total: string | null }>(
				sql`SELECT SUM(points_pnl) as total
					FROM trades
					WHERE account_id = ${accountId}
					  AND EXTRACT(WEEK FROM entry_date) = ${isoWeek}
					  AND EXTRACT(YEAR FROM entry_date) = ${plan.year}
					  AND is_archived = false`,
			)

			const total = result.rows[0]?.total
			const ptsFeito = total != null ? String(parseFloat(total)) : null

			const [updated] = await db
				.update(weeklyTargets)
				.set({ ptsFeito, ptsSource: "auto", updatedAt: new Date() })
				.where(eq(weeklyTargets.id, targetRow.id))
				.returning()

			synced.push(updated)
		}

		return {
			status: "success",
			message: `Synced ${synced.length} weeks`,
			data: { synced: synced.length, weeks: synced },
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to sync weekly actuals",
			errors: [{ code: "SYNC_FAILED", detail: toSafeErrorMessage(error, "syncWeeklyActuals") }],
		}
	}
}

/**
 * Two-way capital sync between a monthly plan and the yearly plan for the same year.
 * Direction logic: explicit `source` param wins; on tie, monthlyPlan timestamp wins
 * (monthly plan owns risk params; yearly plan owns trajectory).
 *
 * @param monthlyPlanId - UUID of the monthly plan to sync from/to
 * @param source - Explicit direction override ("monthly" → push to yearly; "yearly" → push to monthly)
 */
const syncCapitalBetweenPlans = async (
	monthlyPlanId: string,
	source: "monthly" | "yearly",
): Promise<ActionResponse<void>> => {
	try {
		const { accountId } = await requireAuth()

		const monthlyPlan = await db.query.monthlyPlans.findFirst({
			where: and(eq(monthlyPlans.id, monthlyPlanId), eq(monthlyPlans.accountId, accountId)),
		})
		if (!monthlyPlan) {
			return {
				status: "error",
				message: "Monthly plan not found",
				errors: [{ code: "NOT_FOUND", detail: "Monthly plan not found" }],
			}
		}

		const yearlyPlan = await db.query.yearlyPlans.findFirst({
			where: and(eq(yearlyPlans.accountId, accountId), eq(yearlyPlans.year, monthlyPlan.year)),
		})
		if (!yearlyPlan) {
			return {
				status: "success",
				message: "No yearly plan found for this year — sync skipped",
				data: undefined,
			}
		}

		const monthlyTs = monthlyPlan.updatedAt.getTime()
		const yearlyTs = yearlyPlan.updatedAt.getTime()

		if (source === "monthly" || monthlyTs >= yearlyTs) {
			await db
				.update(yearlyPlans)
				.set({
					initialCapitalCents: Math.round(parseFloat(String(monthlyPlan.accountBalance))),
					updatedAt: new Date(),
				})
				.where(eq(yearlyPlans.id, yearlyPlan.id))
		} else {
			await db
				.update(monthlyPlans)
				.set({
					accountBalance: String(yearlyPlan.initialCapitalCents),
					updatedAt: new Date(),
				})
				.where(eq(monthlyPlans.id, monthlyPlan.id))
		}

		return { status: "success", message: "Capital synced", data: undefined }
	} catch (error) {
		return {
			status: "error",
			message: "Failed to sync capital",
			errors: [{ code: "SYNC_FAILED", detail: toSafeErrorMessage(error, "syncCapitalBetweenPlans") }],
		}
	}
}

/**
 * Deletes a yearly plan and cascades to all weekly_targets via the DB constraint.
 * Ownership check ensures callers can only delete their own account's plan.
 *
 * @param yearlyPlanId - UUID of the yearly plan to delete
 */
const deleteYearlyPlan = async (
	yearlyPlanId: string,
): Promise<ActionResponse<void>> => {
	try {
		const { accountId } = await requireAuth()

		const plan = await db.query.yearlyPlans.findFirst({
			where: and(eq(yearlyPlans.id, yearlyPlanId), eq(yearlyPlans.accountId, accountId)),
		})
		if (!plan) {
			return {
				status: "error",
				message: "Plan not found",
				errors: [{ code: "NOT_FOUND", detail: "Yearly plan not found" }],
			}
		}

		await db.delete(yearlyPlans).where(eq(yearlyPlans.id, yearlyPlanId))

		return { status: "success", message: "Yearly plan deleted", data: undefined }
	} catch (error) {
		return {
			status: "error",
			message: "Failed to delete yearly plan",
			errors: [{ code: "DELETE_FAILED", detail: toSafeErrorMessage(error, "deleteYearlyPlan") }],
		}
	}
}

export {
	getYearlyPlan,
	upsertYearlyPlan,
	upsertWeeklyTargets,
	syncWeeklyActuals,
	syncCapitalBetweenPlans,
	deleteYearlyPlan,
}
export type { YearlyPlanWithWeeks }
