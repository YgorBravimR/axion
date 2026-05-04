/**
 * Hawks coaching detectors.
 *
 * Pure post-trade rules that flag deviations from Pedro's protocol. Each
 * detector returns zero or more `CoachInsight` rows scoped to a date range.
 *
 * Nine detectors:
 * 1. bias_mismatch        — trade direction != bias for the day/asset
 * 2. lateral_traded       — bias was "lateral" but a trade was taken
 * 3. over_cap             — > 3 trades in a single session
 * 4. stop_against         — stop moved against position (audit violation)
 * 5. low_mfe_capture      — realizedR < 50 % of mfeR
 * 6. missing_scenario     — no scenarioCode tagged on a closed trade
 * 7. missing_pullback     — no pullbackLevel tagged on a closed trade
 * 8. mma_misaligned       — mmaAligned == "no"
 * 9. checklist_skipped    — daily bias checklist had < 3 items confirmed
 *
 * @see docs/hawks-mode-research.md § 8 Phase 4
 */

import { and, eq, gte, lte } from "drizzle-orm"
import { db } from "@/db/drizzle"
import {
	assets,
	checklistCompletions,
	dailyAssetSettings,
	dailyChecklists,
	hawksScenarioOnTrade,
	hawksStopAudit,
	trades,
} from "@/db/schema"
import { HAWKS_CHECKLIST_NAME } from "@/lib/hawks/seed-data"

type CoachKind =
	| "bias_mismatch"
	| "lateral_traded"
	| "over_cap"
	| "stop_against"
	| "low_mfe_capture"
	| "missing_scenario"
	| "missing_pullback"
	| "mma_misaligned"
	| "checklist_skipped"

interface CoachInsight {
	kind: CoachKind
	tradeId: string | null
	tradeDate: string
	asset: string | null
	context: Record<string, string | number | null>
}

interface DetectorRange {
	from: Date
	to: Date
}

const toNumber = (value: string | null) => {
	if (value === null) return null
	const parsed = Number(value)
	return Number.isFinite(parsed) ? parsed : null
}

const toIsoDay = (date: Date) => date.toISOString().slice(0, 10)

const runHawksCoachDetectors = async ({
	accountId,
	range,
}: {
	accountId: string
	range: DetectorRange
}): Promise<CoachInsight[]> => {
	const tradeRows = await db
		.select({
			id: trades.id,
			asset: trades.asset,
			direction: trades.direction,
			entryDate: trades.entryDate,
			outcome: trades.outcome,
			realizedRMultiple: trades.realizedRMultiple,
			mfeR: trades.mfeR,
		})
		.from(trades)
		.where(
			and(
				eq(trades.accountId, accountId),
				gte(trades.entryDate, range.from),
				lte(trades.entryDate, range.to)
			)
		)

	const scenarioRows = await db
		.select({
			tradeId: hawksScenarioOnTrade.tradeId,
			scenarioCode: hawksScenarioOnTrade.scenarioCode,
			pullbackLevel: hawksScenarioOnTrade.pullbackLevel,
			mmaAligned: hawksScenarioOnTrade.mmaAligned,
		})
		.from(hawksScenarioOnTrade)
		.innerJoin(trades, eq(trades.id, hawksScenarioOnTrade.tradeId))
		.where(eq(trades.accountId, accountId))

	const stopRows = await db
		.select({
			tradeId: hawksStopAudit.tradeId,
			violation: hawksStopAudit.violation,
		})
		.from(hawksStopAudit)
		.innerJoin(trades, eq(trades.id, hawksStopAudit.tradeId))
		.where(eq(trades.accountId, accountId))

	const biasRows = await db
		.select({
			date: dailyAssetSettings.date,
			assetSymbol: assets.symbol,
			bias: dailyAssetSettings.bias,
		})
		.from(dailyAssetSettings)
		.innerJoin(assets, eq(assets.id, dailyAssetSettings.assetId))
		.where(
			and(
				eq(dailyAssetSettings.accountId, accountId),
				gte(dailyAssetSettings.date, range.from),
				lte(dailyAssetSettings.date, range.to)
			)
		)

	const hawksChecklist = await db.query.dailyChecklists.findFirst({
		where: and(
			eq(dailyChecklists.accountId, accountId),
			eq(dailyChecklists.name, HAWKS_CHECKLIST_NAME)
		),
		columns: { id: true, items: true },
	})

	const hawksItemCount = (() => {
		if (!hawksChecklist) return 0
		try {
			const items = JSON.parse(hawksChecklist.items) as Array<{ id: string }>
			return Array.isArray(items) ? items.length : 0
		} catch {
			return 0
		}
	})()

	const completionRows = hawksChecklist
		? await db
				.select({
					date: checklistCompletions.date,
					completedItems: checklistCompletions.completedItems,
				})
				.from(checklistCompletions)
				.where(
					and(
						eq(checklistCompletions.checklistId, hawksChecklist.id),
						gte(checklistCompletions.date, range.from),
						lte(checklistCompletions.date, range.to)
					)
				)
		: []

	const completionsByDay = new Map<string, number>()
	for (const row of completionRows) {
		try {
			const ids = JSON.parse(row.completedItems) as string[]
			completionsByDay.set(toIsoDay(row.date), Array.isArray(ids) ? ids.length : 0)
		} catch {
			completionsByDay.set(toIsoDay(row.date), 0)
		}
	}

	const scenarioByTrade = new Map(
		scenarioRows.map((row) => [row.tradeId, row])
	)
	const violationsByTrade = new Map<string, boolean>()
	for (const row of stopRows) {
		if (row.violation) violationsByTrade.set(row.tradeId, true)
	}
	const biasByDayAsset = new Map<string, (typeof biasRows)[number]>()
	for (const row of biasRows) {
		const key = `${toIsoDay(row.date)}::${row.assetSymbol}`
		biasByDayAsset.set(key, row)
	}

	const dailyTradeCounts = new Map<string, number>()
	for (const trade of tradeRows) {
		const dayKey = toIsoDay(trade.entryDate)
		dailyTradeCounts.set(dayKey, (dailyTradeCounts.get(dayKey) ?? 0) + 1)
	}

	const insights: CoachInsight[] = []

	for (const trade of tradeRows) {
		const dayKey = toIsoDay(trade.entryDate)
		const biasKey = `${dayKey}::${trade.asset}`
		const bias = biasByDayAsset.get(biasKey)
		const scenario = scenarioByTrade.get(trade.id)
		const realizedR = toNumber(trade.realizedRMultiple)
		const mfeR = toNumber(trade.mfeR)

		if (bias && bias.bias) {
			const expected =
				bias.bias === "long" ? "long" : bias.bias === "short" ? "short" : null
			if (expected && trade.direction !== expected) {
				insights.push({
					kind: "bias_mismatch",
					tradeId: trade.id,
					tradeDate: dayKey,
					asset: trade.asset,
					context: { bias: bias.bias, direction: trade.direction },
				})
			}
			if (bias.bias === "neutral") {
				insights.push({
					kind: "lateral_traded",
					tradeId: trade.id,
					tradeDate: dayKey,
					asset: trade.asset,
					context: { bias: bias.bias },
				})
			}
		}

		if (hawksChecklist && hawksItemCount > 0) {
			const completed = completionsByDay.get(dayKey) ?? 0
			if (completed < 3) {
				insights.push({
					kind: "checklist_skipped",
					tradeId: trade.id,
					tradeDate: dayKey,
					asset: trade.asset,
					context: { confirmed: completed, total: hawksItemCount },
				})
			}
		}

		if ((dailyTradeCounts.get(dayKey) ?? 0) > 3) {
			insights.push({
				kind: "over_cap",
				tradeId: trade.id,
				tradeDate: dayKey,
				asset: trade.asset,
				context: { count: dailyTradeCounts.get(dayKey) ?? 0 },
			})
		}

		if (violationsByTrade.get(trade.id)) {
			insights.push({
				kind: "stop_against",
				tradeId: trade.id,
				tradeDate: dayKey,
				asset: trade.asset,
				context: {},
			})
		}

		if (
			realizedR !== null &&
			mfeR !== null &&
			mfeR > 0 &&
			realizedR > 0 &&
			realizedR / mfeR < 0.5
		) {
			insights.push({
				kind: "low_mfe_capture",
				tradeId: trade.id,
				tradeDate: dayKey,
				asset: trade.asset,
				context: { capturePct: Math.round((realizedR / mfeR) * 100) },
			})
		}

		if (!scenario || scenario.scenarioCode === null) {
			insights.push({
				kind: "missing_scenario",
				tradeId: trade.id,
				tradeDate: dayKey,
				asset: trade.asset,
				context: {},
			})
		}
		if (!scenario || !scenario.pullbackLevel) {
			insights.push({
				kind: "missing_pullback",
				tradeId: trade.id,
				tradeDate: dayKey,
				asset: trade.asset,
				context: {},
			})
		}
		if (scenario && scenario.mmaAligned === "no") {
			insights.push({
				kind: "mma_misaligned",
				tradeId: trade.id,
				tradeDate: dayKey,
				asset: trade.asset,
				context: {},
			})
		}
	}

	return insights.sort((a, b) => b.tradeDate.localeCompare(a.tradeDate))
}

export { runHawksCoachDetectors }
export type { CoachInsight, CoachKind, DetectorRange }
