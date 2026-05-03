"use server"

import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { and, eq, gte, sql } from "drizzle-orm"
import { db } from "@/db/drizzle"
import {
	accountModes,
	hawksMentorInsights,
	trades,
	users,
} from "@/db/schema"
import { getCurrentUser } from "@/app/actions/auth"
import type { ActionResponse } from "@/types"

interface MentorInsightInput {
	id?: string
	date: string
	assetSymbol?: string | null
	biasCalled?: string | null
	setupCalled?: string | null
	outcome?: string | null
	bodyMarkdown: string
	sourcePath?: string | null
}

interface MentorInsightRow {
	id: string
	date: string
	assetSymbol: string | null
	biasCalled: string | null
	setupCalled: string | null
	outcome: string | null
	bodyMarkdown: string
	sourcePath: string | null
}

const guardAdmin = async () => {
	const user = await getCurrentUser()
	if (!user) return { admin: false as const, user: null }
	const row = await db.query.users.findFirst({
		where: eq(users.id, user.id),
		columns: { id: true, isAdmin: true, role: true },
	})
	if (!row || !(row.isAdmin || row.role === "admin")) {
		return { admin: false as const, user }
	}
	return { admin: true as const, user }
}

const upsertHawksMentorInsight = async (
	input: MentorInsightInput
): Promise<ActionResponse<MentorInsightRow>> => {
	const t = await getTranslations("hawksMentor")
	try {
		const guard = await guardAdmin()
		if (!guard.admin) return { status: "error", message: t("errors.adminOnly") }

		const date = new Date(input.date)
		const payload = {
			date,
			assetSymbol: input.assetSymbol ?? null,
			biasCalled: input.biasCalled ?? null,
			setupCalled: input.setupCalled ?? null,
			outcome: input.outcome ?? null,
			bodyMarkdown: input.bodyMarkdown,
			sourcePath: input.sourcePath ?? null,
		}

		let row
		if (input.id) {
			const [updated] = await db
				.update(hawksMentorInsights)
				.set(payload)
				.where(eq(hawksMentorInsights.id, input.id))
				.returning()
			row = updated
		} else {
			const [inserted] = await db
				.insert(hawksMentorInsights)
				.values(payload)
				.returning()
			row = inserted
		}

		revalidatePath("/hawks/learning")
		revalidatePath("/hawks/mentor")

		return {
			status: "success",
			message: t("actions.saved"),
			data: {
				id: row.id,
				date: row.date.toISOString(),
				assetSymbol: row.assetSymbol,
				biasCalled: row.biasCalled,
				setupCalled: row.setupCalled,
				outcome: row.outcome,
				bodyMarkdown: row.bodyMarkdown,
				sourcePath: row.sourcePath,
			},
		}
	} catch (error) {
		console.error("Failed to upsert mentor insight:", error)
		return { status: "error", message: t("errors.saveFailed") }
	}
}

interface HawksCohortStats {
	hawksAccounts: number
	tradesLast90: number
	avgWinRate: number
	avgProfitFactor: number | null
	avgExpectancyR: number
}

const fetchHawksCohortStats = async (): Promise<ActionResponse<HawksCohortStats>> => {
	const t = await getTranslations("hawksMentor")
	try {
		const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 90)

		const hawksAccountIds = await db
			.select({ accountId: accountModes.accountId })
			.from(accountModes)
			.where(eq(accountModes.mode, "hawks"))

		if (hawksAccountIds.length === 0) {
			return {
				status: "success",
				message: t("actions.cohortLoaded"),
				data: {
					hawksAccounts: 0,
					tradesLast90: 0,
					avgWinRate: 0,
					avgProfitFactor: null,
					avgExpectancyR: 0,
				},
			}
		}

		const idList = hawksAccountIds.map((row) => row.accountId)

		const aggregateRows = await db
			.select({
				realizedRMultiple: trades.realizedRMultiple,
			})
			.from(trades)
			.where(
				and(
					gte(trades.entryDate, since),
					sql`${trades.accountId} = ANY(${idList})`
				)
			)

		let wins = 0
		let losses = 0
		let totalR = 0
		let grossWinR = 0
		let grossLossR = 0

		for (const row of aggregateRows) {
			const r = Number(row.realizedRMultiple)
			if (!Number.isFinite(r)) continue
			totalR += r
			if (r > 0) {
				wins += 1
				grossWinR += r
			} else if (r < 0) {
				losses += 1
				grossLossR += Math.abs(r)
			}
		}

		const closed = wins + losses
		const tradesLast90 = aggregateRows.length

		return {
			status: "success",
			message: t("actions.cohortLoaded"),
			data: {
				hawksAccounts: hawksAccountIds.length,
				tradesLast90,
				avgWinRate: closed > 0 ? wins / closed : 0,
				avgProfitFactor: grossLossR > 0 ? grossWinR / grossLossR : null,
				avgExpectancyR: closed > 0 ? totalR / closed : 0,
			},
		}
	} catch (error) {
		console.error("Failed to fetch hawks cohort stats:", error)
		return { status: "error", message: t("errors.cohortFailed") }
	}
}

const isCurrentUserAdmin = async (): Promise<boolean> => {
	const guard = await guardAdmin()
	return guard.admin
}

export {
	upsertHawksMentorInsight,
	fetchHawksCohortStats,
	isCurrentUserAdmin,
}
export type { MentorInsightInput, MentorInsightRow, HawksCohortStats }
