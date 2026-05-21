"use server"

import { db } from "@/db/drizzle"
import { strategies, trades } from "@/db/schema"
import type { ActionResponse } from "@/types"
import { eq, and, sql } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import { toSafeErrorMessage } from "@/lib/error-utils"
import { getCurrentVersionId } from "@/lib/strategy-versions"
import { getTranslations } from "next-intl/server"
import type { ComplianceTrendPoint } from "./strategy-compliance-trend.types"

/**
 * Get 26-week weekly compliance trend for a strategy version.
 * Each week bucket includes: weekStart (ISO date), tradeCount, trackedCount, followedCount, compliance (0-100).
 *
 * Last 26 weeks = filter trading_day >= current_date - interval '26 weeks' (PG date arithmetic).
 * Compliance formula: followedCount / trackedCount * 100 (same as `trades.followedPlan` logic).
 */
export const getStrategyComplianceTrend = async (
	strategyId: string,
	versionId?: string
): Promise<ActionResponse<ComplianceTrendPoint[]>> => {
	const t = await getTranslations("playbook")

	try {
		const { userId } = await requireAuth()

		const strategy = await db.query.strategies.findFirst({
			where: and(eq(strategies.id, strategyId), eq(strategies.userId, userId)),
			columns: { id: true, currentVersion: true },
		})
		if (!strategy) {
			return {
				status: "error",
				message: t("actionErrors.strategyNotFound"),
				errors: [{ code: "NOT_FOUND", detail: "Strategy does not exist" }],
			}
		}

		const resolvedVersionId =
			versionId ??
			(await getCurrentVersionId(strategy.id, strategy.currentVersion))
		if (!resolvedVersionId) {
			return {
				status: "error",
				message: t("actionErrors.strategyNotFound"),
				errors: [
					{
						code: "MISSING_VERSION",
						detail: `Strategy ${strategyId} is missing a v${strategy.currentVersion} row`,
					},
				],
			}
		}

		const rows = await db
			.select({
				weekStart: sql<string>`to_char(date_trunc('week', ${trades.entryDate})::date, 'YYYY-MM-DD')`,
				tradeCount: sql<number>`count(*)::int`,
				trackedCount: sql<number>`count(*) filter (where ${trades.followedPlan} is not null)::int`,
				followedCount: sql<number>`count(*) filter (where ${trades.followedPlan} = true)::int`,
			})
			.from(trades)
			.where(
				and(
					eq(trades.strategyVersionId, resolvedVersionId),
					sql`${trades.entryDate}::date >= current_date - interval '26 weeks'`
				)
			)
			.groupBy(sql`date_trunc('week', ${trades.entryDate})`)
			.orderBy(sql`date_trunc('week', ${trades.entryDate}) asc`)

		const points: ComplianceTrendPoint[] = rows.map((row) => ({
			weekStart: row.weekStart,
			tradeCount: row.tradeCount,
			trackedCount: row.trackedCount,
			followedCount: row.followedCount,
			compliance:
				row.trackedCount > 0 ? (row.followedCount / row.trackedCount) * 100 : 0,
		}))

		return {
			status: "success",
			message: t("actionErrors.conditionsRetrieved"),
			data: points,
		}
	} catch (error) {
		return {
			status: "error",
			message: t("actionErrors.retrieveFailed"),
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getStrategyComplianceTrend"),
				},
			],
		}
	}
}
