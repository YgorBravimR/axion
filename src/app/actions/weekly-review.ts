"use server"

import { z } from "zod"
import { db } from "@/db/drizzle"
import { trades, weeklyReview, tags, tradeTags } from "@/db/schema"
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm"
import {
	setISOWeek,
	setISOWeekYear,
	startOfISOWeek,
	endOfISOWeek,
} from "date-fns"
import { fromCents } from "@/lib/money"
import { formatDateKey } from "@/lib/dates"
import { requireAuth } from "@/app/actions/auth"
import { getServerEffectiveNow } from "@/lib/effective-date"
import { getIsoWeekOfDate, getIsoYearOfDate } from "@/lib/calendar/iso-week"
import {
	detectAllPatterns,
	type TradeForCoaching,
} from "@/lib/coaching/pattern-detector"
import { isFrameworkSignal } from "@/lib/error-utils"
import { revalidatePath } from "next/cache"
import type { ActionResponse } from "@/types"
import type {
	DayBucket,
	MistakeRollup,
	ReviewTrade,
	WeeklyReviewPayload,
} from "./weekly-review.types"

const computeIsoWeekRange = (isoYear: number, isoWeek: number) => {
	const anchor = setISOWeekYear(
		setISOWeek(new Date(isoYear, 5, 1), isoWeek),
		isoYear
	)
	return {
		start: startOfISOWeek(anchor),
		end: endOfISOWeek(anchor),
	}
}

const computeDeviationRate = (followed: number, deviated: number): number => {
	const decided = followed + deviated
	if (decided === 0) {
		return 0
	}
	return (deviated / decided) * 100
}

export const getWeeklyReviewPayload = async (
	isoYear: number,
	isoWeek: number
): Promise<ActionResponse<WeeklyReviewPayload>> => {
	try {
		const authContext = await requireAuth()
		const { start, end } = computeIsoWeekRange(isoYear, isoWeek)

		const accountCondition = authContext.showAllAccounts
			? inArray(trades.accountId, authContext.allAccountIds)
			: eq(trades.accountId, authContext.accountId)

		const weekTrades = await db.query.trades.findMany({
			where: and(
				accountCondition,
				eq(trades.isArchived, false),
				gte(trades.entryDate, start),
				lte(trades.entryDate, end)
			),
			orderBy: [asc(trades.entryDate)],
		})

		// 90-day window for mistake recurrence comparison
		const ninetyDaysAgo = new Date(end)
		ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

		const tradeIdsThisWeek = weekTrades.map((t) => t.id)

		const mistakeTagsForUser = await db.query.tags.findMany({
			where: and(eq(tags.userId, authContext.userId), eq(tags.type, "mistake")),
		})

		const mistakeTagIds = mistakeTagsForUser.map((t) => t.id)

		const weekMistakeLinks =
			tradeIdsThisWeek.length > 0 && mistakeTagIds.length > 0
				? await db.query.tradeTags.findMany({
						where: and(
							inArray(tradeTags.tradeId, tradeIdsThisWeek),
							inArray(tradeTags.tagId, mistakeTagIds)
						),
						with: { tag: true, trade: true },
					})
				: []

		const last90MistakeLinks =
			mistakeTagIds.length > 0
				? await db.query.tradeTags.findMany({
						where: inArray(tradeTags.tagId, mistakeTagIds),
						with: { trade: true },
					})
				: []

		const last90InWindow = last90MistakeLinks.filter((link) => {
			if (!link.trade || !link.trade.accountId) {
				return false
			}
			const accountOk = authContext.showAllAccounts
				? authContext.allAccountIds.includes(link.trade.accountId)
				: link.trade.accountId === authContext.accountId
			if (!accountOk) {
				return false
			}
			const entry = new Date(link.trade.entryDate)
			return entry >= ninetyDaysAgo && entry <= end
		})

		const last90CountByTag = new Map<string, number>()
		for (const link of last90InWindow) {
			last90CountByTag.set(
				link.tagId,
				(last90CountByTag.get(link.tagId) ?? 0) + 1
			)
		}

		const weekStatsByTag = new Map<
			string,
			{ count: number; lossCents: number }
		>()
		const mistakeTagsByTradeId = new Map<string, string[]>()
		for (const link of weekMistakeLinks) {
			const list = mistakeTagsByTradeId.get(link.tradeId) ?? []
			list.push(link.tag.name)
			mistakeTagsByTradeId.set(link.tradeId, list)

			const pnl = fromCents(link.trade.pnl)
			const lossCents = pnl < 0 ? Math.abs(pnl) : 0
			const current = weekStatsByTag.get(link.tagId) ?? {
				count: 0,
				lossCents: 0,
			}
			weekStatsByTag.set(link.tagId, {
				count: current.count + 1,
				lossCents: current.lossCents + lossCents,
			})
		}

		const mistakes: MistakeRollup[] = Array.from(weekStatsByTag.entries())
			.map(([tagId, data]) => {
				const tag = mistakeTagsForUser.find((t) => t.id === tagId)
				return {
					tagId,
					tagName: tag?.name ?? "—",
					color: tag?.color ?? null,
					weekCount: data.count,
					weekLossCents: data.lossCents,
					last90Count: last90CountByTag.get(tagId) ?? data.count,
				}
			})
			.toSorted((a, b) => b.weekCount - a.weekCount)

		const reviewTrades: ReviewTrade[] = weekTrades.map((t) => ({
			id: t.id,
			asset: t.asset,
			direction: t.direction,
			entryDate: t.entryDate.toISOString(),
			pnl: fromCents(t.pnl),
			r: t.realizedRMultiple ? parseFloat(t.realizedRMultiple) : null,
			outcome: t.outcome,
			rating: t.rating,
			followedPlan: t.followedPlan,
			lessonLearned: t.lessonLearned,
			postTradeReflection: t.postTradeReflection,
			disciplineNotes: t.disciplineNotes,
			mistakeTags: mistakeTagsByTradeId.get(t.id) ?? [],
		}))

		// Daily breakdown + risco computation in single pass (weekTrades is sorted by entryDate)
		const dayMap = new Map<string, DayBucket>()
		let prevDay = ""
		let lossRun = 0
		let maxConsecutiveLossesInDay = 0
		let worstDayPnl = 0
		let worstDayDate: string | null = null

		for (const t of weekTrades) {
			const day = formatDateKey(new Date(t.entryDate))

			// Detect day boundary to reset loss streak counter
			if (day !== prevDay && prevDay !== "") {
				lossRun = 0
			}
			prevDay = day

			// Update day bucket
			const bucket = dayMap.get(day) ?? {
				date: day,
				tradeCount: 0,
				pnl: 0,
				winCount: 0,
				lossCount: 0,
			}
			bucket.tradeCount += 1
			bucket.pnl += fromCents(t.pnl)
			if (t.outcome === "win") {
				bucket.winCount += 1
			} else if (t.outcome === "loss") {
				bucket.lossCount += 1
				lossRun += 1
				maxConsecutiveLossesInDay = Math.max(maxConsecutiveLossesInDay, lossRun)
			} else {
				lossRun = 0
			}
			dayMap.set(day, bucket)
		}

		// Track worst day after all buckets are finalized
		for (const bucket of dayMap.values()) {
			if (bucket.pnl < worstDayPnl) {
				worstDayPnl = bucket.pnl
				worstDayDate = bucket.date
			}
		}

		const dailyBreakdown = Array.from(dayMap.values()).toSorted((a, b) =>
			a.date.localeCompare(b.date)
		)

		// Adherence
		let followedCount = 0
		let deviatedCount = 0
		let uncategorizedCount = 0
		const deviatingTradeIds: string[] = []
		for (const t of weekTrades) {
			if (t.followedPlan === true) {
				followedCount += 1
			} else if (t.followedPlan === false) {
				deviatedCount += 1
				deviatingTradeIds.push(t.id)
			} else {
				uncategorizedCount += 1
			}
		}

		// Summary aggregates (single pass)
		let winCount = 0
		let decidedCount = 0
		let netPnl = 0
		let grossProfit = 0
		let grossLossNegative = 0
		let rSum = 0
		let rCount = 0
		let bestTrade = 0
		let worstTrade = 0

		for (const t of weekTrades) {
			const tPnl = fromCents(t.pnl)
			netPnl += tPnl
			if (tPnl > bestTrade) {
				bestTrade = tPnl
			}
			if (tPnl < worstTrade) {
				worstTrade = tPnl
			}

			if (t.outcome === "win") {
				winCount += 1
				decidedCount += 1
				grossProfit += tPnl
			} else if (t.outcome === "loss") {
				decidedCount += 1
				grossLossNegative += tPnl
			}

			if (t.realizedRMultiple !== null) {
				rSum += parseFloat(t.realizedRMultiple)
				rCount += 1
			}
		}

		const winRate = decidedCount > 0 ? (winCount / decidedCount) * 100 : 0
		const grossLoss = Math.abs(grossLossNegative)
		const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0
		const avgR = rCount > 0 ? rSum / rCount : 0

		// Pattern detector scoped to this week
		const coachingTrades: TradeForCoaching[] = weekTrades.map((t) => ({
			entryDate: new Date(t.entryDate),
			exitDate: t.exitDate ? new Date(t.exitDate) : null,
			pnl: t.pnl,
			outcome: t.outcome as "win" | "loss" | "breakeven" | null,
			realizedRMultiple: t.realizedRMultiple,
			asset: t.asset,
			direction: t.direction,
			strategyName: null,
			setupRank: t.setupRank,
			rating: t.rating,
			followedPlan: t.followedPlan,
			commission: t.commission,
			fees: t.fees,
		}))
		const insights = detectAllPatterns(coachingTrades)

		// Saved review (per-account; defaults to the user's primary account when "showAllAccounts" is on)
		const accountIdForReview: string | undefined = authContext.showAllAccounts
			? authContext.allAccountIds[0]
			: authContext.accountId
		const saved =
			accountIdForReview !== undefined
				? await db.query.weeklyReview.findFirst({
						where: and(
							eq(weeklyReview.accountId, accountIdForReview),
							eq(weeklyReview.isoYear, isoYear),
							eq(weeklyReview.isoWeek, isoWeek)
						),
					})
				: null

		return {
			status: "success",
			message: "ok",
			data: {
				isoYear,
				isoWeek,
				weekStart: formatDateKey(start),
				weekEnd: formatDateKey(end),
				hasTrades: weekTrades.length > 0,
				summary: {
					totalTrades: weekTrades.length,
					netPnl,
					winRate,
					profitFactor,
					avgR,
					bestTrade,
					worstTrade,
				},
				trades: reviewTrades,
				dailyBreakdown,
				adherence: {
					totalDecided: weekTrades.length,
					followedCount,
					deviatedCount,
					uncategorizedCount,
					deviationRate: computeDeviationRate(followedCount, deviatedCount),
					deviatingTradeIds,
				},
				insights,
				mistakes,
				risco: {
					hasConsecutiveLossDay: maxConsecutiveLossesInDay >= 3,
					maxConsecutiveLossesInDay,
					worstDayPnl,
					worstDayDate,
				},
				saved: {
					lesson: saved?.lesson ?? "",
					ruleChange: saved?.ruleChange ?? "",
					focusNextWeek: saved?.focusNextWeek ?? "",
					completedAt: saved?.completedAt
						? saved.completedAt.toISOString()
						: null,
				},
			},
		}
	} catch (error) {
		if (!isFrameworkSignal(error)) {
			console.error("getWeeklyReviewPayload failed:", error)
		}
		return { status: "error", message: "Failed to load weekly review" }
	}
}

const saveSchema = z.object({
	isoYear: z.number().int().min(2000).max(2100),
	isoWeek: z.number().int().min(1).max(53),
	lesson: z.string().max(2000).optional().default(""),
	ruleChange: z.string().max(2000).optional().default(""),
	focusNextWeek: z.string().max(2000).optional().default(""),
	markCompleted: z.boolean().optional().default(false),
})

export const saveWeeklyReview = async (
	input: z.infer<typeof saveSchema>
): Promise<ActionResponse<{ id: string }>> => {
	try {
		const parsed = saveSchema.parse(input)
		const authContext = await requireAuth()
		const accountId = authContext.showAllAccounts
			? authContext.allAccountIds[0]
			: authContext.accountId
		if (!accountId) {
			return { status: "error", message: "No account context" }
		}

		const completedAt = parsed.markCompleted ? new Date() : null

		const result = await db
			.insert(weeklyReview)
			.values({
				accountId,
				isoYear: parsed.isoYear,
				isoWeek: parsed.isoWeek,
				lesson: parsed.lesson,
				ruleChange: parsed.ruleChange,
				focusNextWeek: parsed.focusNextWeek,
				completedAt,
			})
			.onConflictDoUpdate({
				target: [
					weeklyReview.accountId,
					weeklyReview.isoYear,
					weeklyReview.isoWeek,
				],
				set: {
					lesson: parsed.lesson,
					ruleChange: parsed.ruleChange,
					focusNextWeek: parsed.focusNextWeek,
					completedAt: parsed.markCompleted
						? new Date()
						: sql`${weeklyReview.completedAt}`,
					updatedAt: new Date(),
				},
			})
			.returning({ id: weeklyReview.id })

		revalidatePath(`/review/weekly/${parsed.isoYear}/${parsed.isoWeek}`)

		return {
			status: "success",
			message: "Review saved",
			data: { id: result[0]!.id },
		}
	} catch (error) {
		if (!isFrameworkSignal(error)) {
			console.error("saveWeeklyReview failed:", error)
		}
		return { status: "error", message: "Failed to save review" }
	}
}

export const getLatestReviewableWeek = async (): Promise<{
	isoYear: number
	isoWeek: number
}> => {
	const now = await getServerEffectiveNow()
	const lastWeek = new Date(now)
	lastWeek.setDate(lastWeek.getDate() - 7)
	return {
		isoYear: getIsoYearOfDate(lastWeek),
		isoWeek: getIsoWeekOfDate(lastWeek),
	}
}
