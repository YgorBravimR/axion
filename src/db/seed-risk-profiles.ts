/**
 * Seed script for risk management profiles.
 * Run with: npx tsx src/db/seed-risk-profiles.ts
 *
 * Creates two built-in profiles from the risk management documentation:
 * 1. Bravo Risk Management (1.25% per trade, anti-martingale recovery, gain sequence)
 * 2. TSR Iniciante (R$80 base, 2 contracts max, single-target gain mode)
 */

import { db } from "@/db/drizzle"
import { riskManagementProfiles, users } from "@/db/schema"
import { eq } from "drizzle-orm"
import type { DecisionTreeConfig } from "@/types/risk-profile"

const seedRiskProfiles = async () => {
	// Find the first admin user to set as creator
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
	// Percentage-based risk: 1.25% per trade, 2.5% daily, 5% weekly, 3.75% target
	// @see docs/riskManagement/risk-management-flowchart.md
	// ==========================================
	const bravoTree: DecisionTreeConfig = {
		baseTrade: {
			riskCents: 50000, // R$500 fallback (1.25% of R$40k reference balance)
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
					// T2 after win: 100% of base (1x risk)
					riskCalculation: { type: "percentOfBase", percent: 100 },
					maxContractsOverride: null,
				},
				{
					// T3: 50% of base (0.5x risk)
					riskCalculation: { type: "percentOfBase", percent: 50 },
					maxContractsOverride: null,
				},
				{
					// T4: 25% of base (0.25x risk)
					riskCalculation: { type: "percentOfBase", percent: 25 },
					maxContractsOverride: null,
				},
			],
			repeatLastStep: true, // T5+ keep using 25% of base
			stopOnFirstLoss: true,
			dailyTargetCents: 150000, // R$1,500 fallback (3.75% of R$40k)
		},
		cascadingLimits: {
			weeklyLossCents: 200000, // R$2,000 fallback (5% of R$40k)
			weeklyAction: "stopTrading",
			monthlyLossCents: 750000, // R$7,500
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
	// PROFILE 2: TSR Iniciante
	// @see docs/riskManagement/tsr-iniciante-flowchart.md
	// ==========================================
	const tsrInicianteTree: DecisionTreeConfig = {
		baseTrade: {
			riskCents: 8000, // R$80 (2 contracts × 200pts × R$0.20)
			maxContracts: 2,
			minStopPoints: 100,
		},
		lossRecovery: {
			sequence: [
				{
					riskCalculation: { type: "fixedCents", amountCents: 4000 }, // 1 contract × 200pts
					maxContractsOverride: 1,
				},
				{
					riskCalculation: { type: "fixedCents", amountCents: 4000 },
					maxContractsOverride: 1,
				},
				{
					riskCalculation: { type: "fixedCents", amountCents: 4000 },
					maxContractsOverride: 1,
				},
			],
			executeAllRegardless: false,
			stopAfterSequence: true,
		},
		gainMode: {
			type: "singleTarget",
			dailyTargetCents: 22000, // R$220
		},
		cascadingLimits: {
			weeklyLossCents: null,
			weeklyAction: "stopTrading",
			monthlyLossCents: 150000, // R$1,500
			monthlyAction: "stopTrading",
		},
		executionConstraints: {
			minStopPoints: 100,
			maxContracts: 2,
			operatingHoursStart: "09:01",
			operatingHoursEnd: "17:00",
		},
	}

	// Insert profiles
	const profiles = [
		{
			name: "Bravo Risk Management",
			description: "Percentage-based risk: 1.25% per trade, 2.5% daily loss, 5% weekly loss, 3.75% daily target. Anti-martingale recovery with gain sequence (1x, 0.5x, 0.25x...).",
			createdByUserId,
			baseRiskCents: 50000,
			dailyLossCents: 100000, // 2.5% of R$40k
			weeklyLossCents: 200000, // 5% of R$40k
			monthlyLossCents: 750000, // R$7,500
			dailyProfitTargetCents: 150000, // 3.75% of R$40k
			decisionTree: JSON.stringify(bravoTree),
		},
		{
			name: "TSR Iniciante",
			description: "Conservative plan for beginners. Max 2 contracts, R$80 base risk, single-target gain mode (1 winning T1 = daily goal). Recovery trades use 1 contract.",
			createdByUserId,
			baseRiskCents: 8000,
			dailyLossCents: 20000, // R$200
			weeklyLossCents: null,
			monthlyLossCents: 150000, // R$1,500
			dailyProfitTargetCents: 22000, // R$220
			decisionTree: JSON.stringify(tsrInicianteTree),
		},
	]

	// Rename map: migrate old profile names to new ones
	const renameMap: Record<string, string> = {
		"Bravo Risk Management": "Standard Risk Management",
	}

	for (const profile of profiles) {
		// Check if profile already exists by current name
		const existing = await db.query.riskManagementProfiles.findFirst({
			where: eq(riskManagementProfiles.name, profile.name),
		})

		if (existing) {
			console.log(`Profile "${profile.name}" already exists, skipping.`)
			continue
		}

		// Check if an old-named version exists and should be migrated
		const oldName = renameMap[profile.name]
		if (oldName) {
			const oldProfile = await db.query.riskManagementProfiles.findFirst({
				where: eq(riskManagementProfiles.name, oldName),
			})

			if (oldProfile) {
				await db
					.update(riskManagementProfiles)
					.set({
						name: profile.name,
						description: profile.description,
						baseRiskCents: profile.baseRiskCents,
						dailyLossCents: profile.dailyLossCents,
						weeklyLossCents: profile.weeklyLossCents,
						monthlyLossCents: profile.monthlyLossCents,
						dailyProfitTargetCents: profile.dailyProfitTargetCents,
						decisionTree: profile.decisionTree,
					})
					.where(eq(riskManagementProfiles.id, oldProfile.id))
				console.log(`Migrated profile: "${oldName}" → "${profile.name}"`)
				continue
			}
		}

		await db.insert(riskManagementProfiles).values(profile)
		console.log(`Created profile: "${profile.name}"`)
	}

	console.log("Seed complete.")
	process.exit(0)
}

seedRiskProfiles().catch((error) => {
	console.error("Seed failed:", error)
	process.exit(1)
})
