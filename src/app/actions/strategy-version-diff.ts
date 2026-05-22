"use server"

import { db } from "@/db/drizzle"
import {
	strategies,
	strategyVersions,
	strategyConditions,
	tradingConditions,
} from "@/db/schema"
import type { ActionResponse } from "@/types"
import type {
	DiffConditionEntry,
	StrategyVersionDiffData,
} from "./strategy-version-diff.types"
import { eq, and, asc } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import { toSafeErrorMessage } from "@/lib/error-utils"
import { getTranslations } from "next-intl/server"

async function fetchVersionConditions(
	versionId: string
): Promise<
	{
		conditionId: string
		conditionName: string
		category: string
		tier: string
	}[]
> {
	return db
		.select({
			conditionId: strategyConditions.conditionId,
			conditionName: tradingConditions.name,
			category: tradingConditions.category,
			tier: strategyConditions.tier,
		})
		.from(strategyConditions)
		.innerJoin(
			tradingConditions,
			eq(tradingConditions.id, strategyConditions.conditionId)
		)
		.where(eq(strategyConditions.strategyVersionId, versionId))
		.orderBy(asc(strategyConditions.sortOrder))
}

export const getStrategyVersionDiff = async (
	strategyId: string,
	versionAId: string,
	versionBId: string
): Promise<ActionResponse<StrategyVersionDiffData>> => {
	const t = await getTranslations("playbook")
	try {
		const { userId } = await requireAuth()

		const parent = await db.query.strategies.findFirst({
			where: and(eq(strategies.id, strategyId), eq(strategies.userId, userId)),
			columns: { id: true },
		})
		if (!parent) {
			return {
				status: "error",
				message: t("actionErrors.strategyNotFound"),
				errors: [{ code: "NOT_FOUND", detail: "Strategy not found" }],
			}
		}

		const [vA, vB, conditionsA, conditionsB] = await Promise.all([
			db.query.strategyVersions.findFirst({
				where: and(
					eq(strategyVersions.id, versionAId),
					eq(strategyVersions.strategyId, strategyId)
				),
				columns: { id: true, version: true, label: true },
			}),
			db.query.strategyVersions.findFirst({
				where: and(
					eq(strategyVersions.id, versionBId),
					eq(strategyVersions.strategyId, strategyId)
				),
				columns: { id: true, version: true, label: true },
			}),
			fetchVersionConditions(versionAId),
			fetchVersionConditions(versionBId),
		])

		if (!vA || !vB) {
			return {
				status: "error",
				message: t("actionErrors.strategyNotFound"),
				errors: [
					{ code: "NOT_FOUND", detail: "One or both versions not found" },
				],
			}
		}

		const tierMapA = new Map(conditionsA.map((c) => [c.conditionId, c]))
		const tierMapB = new Map(conditionsB.map((c) => [c.conditionId, c]))

		const allIds = new Set([
			...conditionsA.map((c) => c.conditionId),
			...conditionsB.map((c) => c.conditionId),
		])

		const conditions: DiffConditionEntry[] = [...allIds].map((id) => {
			const entryA = tierMapA.get(id)
			const entryB = tierMapB.get(id)
			const base = entryA ?? entryB
			return {
				conditionId: id,
				conditionName: base!.conditionName,
				category: base!.category,
				tierA: entryA?.tier ?? null,
				tierB: entryB?.tier ?? null,
			}
		})

		return {
			status: "success",
			message: "",
			data: {
				versionA: { id: vA.id, version: vA.version, label: vA.label ?? null },
				versionB: { id: vB.id, version: vB.version, label: vB.label ?? null },
				conditions,
			},
		}
	} catch (error) {
		return {
			status: "error",
			message: t("actionErrors.retrieveFailed"),
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getStrategyVersionDiff"),
				},
			],
		}
	}
}
