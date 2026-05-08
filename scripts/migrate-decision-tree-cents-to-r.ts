#!/usr/bin/env bun
/**
 * One-time Phase 4b migration: rebase `riskManagementProfiles.decisionTree`
 * JSON cents → R-multiples.
 *
 * Strategy:
 *   1. For each profile, derive 1R cents.
 *      - First try the most-recent monthlyRiskConfig that references this profile
 *        (`riskPerTradeCents` is encrypted text but stored as numeric string for
 *        legacy rows; conversion rows here are tolerant).
 *      - Fallback: most-recent yearly_plans.ladderRules[0].oneRCents.
 *   2. Walk the JSON tree; any numeric value whose key ends in "Cents" is divided
 *      by 1R and renamed to its "R" sibling (`baseRiskCents` → `baseRiskR`).
 *   3. Idempotent: profiles whose tree already exposes `*R` keys without `*Cents`
 *      siblings are skipped.
 *
 * Run:    bun scripts/migrate-decision-tree-cents-to-r.ts
 * Output: per-profile log + summary "Converted: N, Skipped: M".
 */
import { db } from "@/db/drizzle"
import {
	riskManagementProfiles,
	monthlyRiskConfig,
	yearlyPlans,
} from "@/db/schema"
import { eq, desc } from "drizzle-orm"

interface YearlyLadderRule {
	oneRCents: number
	[key: string]: unknown
}

const isAlreadyConverted = (tree: Record<string, unknown>): boolean => {
	const json = JSON.stringify(tree)
	return (
		/(thresholdR|baseRiskR|riskR|dailyTargetR|monthlyLossR|weeklyLossR)/.test(
			json
		) && !/Cents/.test(json)
	)
}

const deriveOneRCents = async (profileId: string): Promise<number> => {
	const config = await db.query.monthlyRiskConfig.findFirst({
		where: eq(monthlyRiskConfig.riskProfileId, profileId),
		orderBy: [desc(monthlyRiskConfig.year), desc(monthlyRiskConfig.month)],
	})
	if (config?.riskPerTradeCents) {
		const cents = Number(config.riskPerTradeCents)
		if (Number.isFinite(cents) && cents > 0) {
			return cents
		}
	}
	const yp = await db.query.yearlyPlans.findFirst({
		orderBy: [desc(yearlyPlans.year)],
	})
	const ladder = yp?.ladderRules as YearlyLadderRule[] | null | undefined
	if (
		Array.isArray(ladder) &&
		ladder.length > 0 &&
		typeof ladder[0]?.oneRCents === "number"
	) {
		return ladder[0].oneRCents
	}
	throw new Error(`cannot derive 1R cents for profile ${profileId}`)
}

const convertCentsToR = (
	tree: Record<string, unknown>,
	oneRCents: number
): Record<string, unknown> => {
	const walk = (node: unknown): unknown => {
		if (Array.isArray(node)) {
			return node.map(walk)
		}
		if (node && typeof node === "object") {
			const out: Record<string, unknown> = {}
			for (const [key, value] of Object.entries(
				node as Record<string, unknown>
			)) {
				if (typeof value === "number" && /Cents$/.test(key)) {
					const newKey = key.replace(/Cents$/, "R")
					out[newKey] = Number((value / oneRCents).toFixed(2))
				} else {
					out[key] = walk(value)
				}
			}
			return out
		}
		return node
	}
	return walk(tree) as Record<string, unknown>
}

const main = async (): Promise<void> => {
	const profiles = await db.select().from(riskManagementProfiles)
	let converted = 0
	let skipped = 0

	for (const profile of profiles) {
		const tree = JSON.parse(profile.decisionTree) as Record<string, unknown>
		if (isAlreadyConverted(tree)) {
			console.log(`SKIP  ${profile.id}  (already R)`)
			skipped++
			continue
		}
		const oneRCents = await deriveOneRCents(profile.id)
		const newTree = convertCentsToR(tree, oneRCents)
		await db
			.update(riskManagementProfiles)
			.set({ decisionTree: JSON.stringify(newTree), updatedAt: new Date() })
			.where(eq(riskManagementProfiles.id, profile.id))
		console.log(`CONVERT  ${profile.id}  (1R = ${oneRCents}¢)`)
		converted++
	}

	console.log(`\nConverted: ${converted}, Skipped (already R): ${skipped}`)
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error)
		process.exit(1)
	})
