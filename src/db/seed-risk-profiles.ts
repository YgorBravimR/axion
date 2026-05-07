/**
 * Seed script for risk management profiles.
 * Run with: npx tsx src/db/seed-risk-profiles.ts
 *
 * Creates two built-in profiles from the risk management documentation:
 * 1. Bravo Risk Management (1.25% per trade, anti-martingale recovery, gain sequence)
 * 2. TSR Iniciante (R$80 base, 2 contracts max, single-target gain mode)
 *
 * Phase 4b: profile decision trees are now expressed in R-multiples. 1R is
 * derived from the active fractal-plan ladder tier at runtime; the cents
 * comments below reference the historical baseline (Bravo: R$500/R, TSR:
 * R$80/R) for documentation only.
 */

import { db } from "@/db/drizzle"
import { riskManagementProfiles, users } from "@/db/schema"
import { eq } from "drizzle-orm"
import type { DecisionTreeConfig } from "@/types/risk-profile"

const seedRiskProfiles = async () => {
	const adminUser = await db.query.users.findFirst({
		where: eq(users.isAdmin, true),
	})

	if (!adminUser) {
		console.error("No admin user found. Create an admin user first.")
		process.exit(1)
	}

	const createdByUserId = adminUser.id

	// ==========================================
	// PROFILE 1: Bravo Risk Management
	// 1R reference = R$500 (1.25% of R$40k). Daily 2R, weekly 4R, monthly 15R.
	// @see docs/riskManagement/risk-management-flowchart.md
	// ==========================================
	const bravoTree: DecisionTreeConfig = {
		baseTrade: {
			riskR: 1,
			maxContracts: 20,
			minStopPoints: 100,
		},
		lossRecovery: {
			sequence: [
				{
					riskCalculation: { type: "percentOfBase", percent: 50 },
					maxContractsOverride: null,
				},
				{
					riskCalculation: { type: "percentOfBase", percent: 25 },
					maxContractsOverride: null,
				},
				{
					riskCalculation: { type: "percentOfBase", percent: 25 },
					maxContractsOverride: null,
				},
			],
			executeAllRegardless: false,
			stopAfterSequence: true,
		},
		gainMode: {
			type: "gainSequence",
			sequence: [
				{
					riskCalculation: { type: "percentOfBase", percent: 100 },
					maxContractsOverride: null,
				},
				{
					riskCalculation: { type: "percentOfBase", percent: 50 },
					maxContractsOverride: null,
				},
				{
					riskCalculation: { type: "percentOfBase", percent: 25 },
					maxContractsOverride: null,
				},
			],
			repeatLastStep: true,
			stopOnFirstLoss: true,
			dailyTargetR: 3,
		},
		cascadingLimits: {
			weeklyLossR: 4,
			weeklyAction: "stopTrading",
			monthlyLossR: 15,
			monthlyAction: "stopTrading",
		},
		executionConstraints: {
			minStopPoints: 100,
			maxContracts: 20,
			operatingHoursStart: "09:01",
			operatingHoursEnd: "17:00",
		},
		riskSizing: { type: "percentOfBalance", riskPercent: 1.25 },
		limitMode: "percentOfInitial",
		limitsPercent: { daily: 2.5, weekly: 5, monthly: 15 },
	}

	// ==========================================
	// PROFILE 2: TSR Iniciante (Arrojado)
	// 1R reference = R$80 (2cts × 200pts × R$0.20). Daily ~4.7R cap (R$375),
	// weekly 6.25R, monthly 18.75R (eliminação).
	// ==========================================
	const tsrInicianteTree: DecisionTreeConfig = {
		baseTrade: {
			riskR: 1,
			maxContracts: 2,
			minStopPoints: 175,
		},
		lossRecovery: {
			sequence: [
				{
					riskCalculation: { type: "percentOfBase", percent: 100 },
					maxContractsOverride: null,
				},
				{
					riskCalculation: { type: "percentOfBase", percent: 100 },
					maxContractsOverride: null,
				},
			],
			executeAllRegardless: false,
			stopAfterSequence: true,
		},
		gainMode: {
			type: "compounding",
			reinvestmentPercent: 50,
			stopOnFirstLoss: true,
			dailyTargetR: 0.9375,
		},
		cascadingLimits: {
			weeklyLossR: 6.25,
			weeklyAction: "reduceRisk",
			monthlyLossR: 18.75,
			monthlyAction: "stopTrading",
		},
		executionConstraints: {
			minStopPoints: 175,
			maxContracts: 2,
			operatingHoursStart: "09:01",
			operatingHoursEnd: "17:00",
		},
		consecutiveLossRules: [
			{
				consecutiveDays: 3,
				action: "reduceRisk",
				reducePercent: 50,
			},
		],
	}

	const profiles = [
		{
			name: "Bravo Risk Management",
			description:
				"R-multiple risk: 1R per trade, 4R weekly cap, 15R monthly cap, 3R daily target. Anti-martingale recovery with gain sequence (1x, 0.5x, 0.25x...).",
			createdByUserId,
			decisionTree: JSON.stringify(bravoTree),
		},
		{
			name: "TSR Iniciante",
			description:
				"Plano arrojado para teste mesa TSR. WIN 2cts, stop 175-225pts, R:R 1.5-2.5. Recovery: 2cts cheio (max 3 stops/dia). Gain: compounding 50% do lucro. Caps: 6.25R semanal (laranja), 18.75R mensal (eliminação).",
			createdByUserId,
			decisionTree: JSON.stringify(tsrInicianteTree),
		},
	]

	const renameMap: Record<string, string> = {
		"Bravo Risk Management": "Standard Risk Management",
	}

	for (const profile of profiles) {
		// eslint-disable-next-line no-await-in-loop -- sequential upsert per profile in seed script; no parallelism needed for one-time seeding
		const existing = await db.query.riskManagementProfiles.findFirst({
			where: eq(riskManagementProfiles.name, profile.name),
		})

		if (existing) {
			// eslint-disable-next-line no-await-in-loop -- update depends on prior existence check
			await db
				.update(riskManagementProfiles)
				.set({
					description: profile.description,
					decisionTree: profile.decisionTree,
				})
				.where(eq(riskManagementProfiles.id, existing.id))
			console.info(`Updated profile: "${profile.name}"`)
			continue
		}

		const oldName = renameMap[profile.name]
		if (oldName) {
			// eslint-disable-next-line no-await-in-loop -- rename check depends on profile iteration order
			const oldProfile = await db.query.riskManagementProfiles.findFirst({
				where: eq(riskManagementProfiles.name, oldName),
			})

			if (oldProfile) {
				// eslint-disable-next-line no-await-in-loop -- migration update depends on old profile lookup above
				await db
					.update(riskManagementProfiles)
					.set({
						name: profile.name,
						description: profile.description,
						decisionTree: profile.decisionTree,
					})
					.where(eq(riskManagementProfiles.id, oldProfile.id))
				console.info(`Migrated profile: "${oldName}" → "${profile.name}"`)
				continue
			}
		}

		// eslint-disable-next-line no-await-in-loop -- insert only when no existing/old profile found; sequential for seed script
		await db.insert(riskManagementProfiles).values(profile)
		console.info(`Created profile: "${profile.name}"`)
	}

	console.info("Seed complete.")
	process.exit(0)
}

seedRiskProfiles().catch((error) => {
	console.error("Seed failed:", error)
	process.exit(1)
})
