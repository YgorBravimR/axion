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
	// PROFILE 2: TSR Iniciante (Arrojado)
	// Teste mesa proprietária TSR Trading — WIN only, 2 contracts
	// Meta: R$1.500 em 30 dias | Perda diária: R$375 | Perda total: R$1.500
	// Stop: 175-225pts (média 200) | R:R 1.5-2.5 | Parcial 70pts (1ct) + zero
	// ~40-50% breakeven rate | Max 3 stops cheios/dia (R$247 < R$375)
	// Após gain: 2ª entrada com risco = 50% do lucro (compounding)
	// Max 5 trades/dia | Semáforo de saldo acumulado governa agressividade
	// ==========================================
	const tsrInicianteTree: DecisionTreeConfig = {
		baseTrade: {
			riskCents: 8000, // R$80 (2 contracts × 200pts × R$0.20)
			maxContracts: 2,
			minStopPoints: 175, // Stop mínimo do operacional
		},
		lossRecovery: {
			// Arrojado: mantém 2 contratos nas recovery trades (não reduz)
			// Max 3 stops cheios/dia = R$240 (dentro do limite R$375)
			sequence: [
				{
					// T2 após loss: full risk, 2 contratos
					riskCalculation: { type: "percentOfBase", percent: 100 },
					maxContractsOverride: null,
				},
				{
					// T3 após 2 losses: full risk, 2 contratos — último trade do dia
					riskCalculation: { type: "percentOfBase", percent: 100 },
					maxContractsOverride: null,
				},
			],
			executeAllRegardless: false,
			stopAfterSequence: true, // 3 stops = parou o dia
		},
		gainMode: {
			// Após gain: pode continuar com risco = 50% do lucro acumulado
			// Permite capturar mais trades/dia (alvo 4-5 trades) sem arriscar o lucro
			type: "compounding",
			reinvestmentPercent: 50, // 2ª op arrisca no máx 50% do gain
			stopOnFirstLoss: true, // Após win + loss na 2ª: parou a sequência de gain
			dailyTargetCents: 7500, // R$75 referência diária (sugestão, não hard stop)
		},
		cascadingLimits: {
			weeklyLossCents: 50000, // R$500 — semáforo laranja: reduz para 2 trades, só setup A+
			weeklyAction: "reduceRisk",
			monthlyLossCents: 150000, // R$1.500 — perda total = ELIMINAÇÃO
			monthlyAction: "stopTrading",
		},
		executionConstraints: {
			minStopPoints: 175, // Stop mínimo 175pts
			maxContracts: 2, // Limite TSR Iniciante
			operatingHoursStart: "09:01",
			operatingHoursEnd: "17:00",
		},
		consecutiveLossRules: [
			{
				// 3 dias consecutivos negativos: reduz risco em 50% (1 contrato)
				consecutiveDays: 3,
				action: "reduceRisk",
				reducePercent: 50,
			},
		],
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
			description: "Plano arrojado para teste mesa TSR. WIN 2cts, stop 175-225pts, R:R 1.5-2.5. Parcial 70pts (1ct) + zero (~40-50% BE). Recovery: 2cts cheio (max 3 stops/dia = R$240). Gain: compounding 50% do lucro. Meta R$1.500/30d.",
			createdByUserId,
			baseRiskCents: 8000, // R$80 (2 cts × 200pts × R$0.20)
			dailyLossCents: 37500, // R$375 (limite TSR)
			weeklyLossCents: 50000, // R$500 (semáforo laranja)
			monthlyLossCents: 150000, // R$1.500 (eliminação TSR)
			dailyProfitTargetCents: 7500, // R$75 (referência diária)
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
			await db
				.update(riskManagementProfiles)
				.set({
					description: profile.description,
					baseRiskCents: profile.baseRiskCents,
					dailyLossCents: profile.dailyLossCents,
					weeklyLossCents: profile.weeklyLossCents,
					monthlyLossCents: profile.monthlyLossCents,
					dailyProfitTargetCents: profile.dailyProfitTargetCents,
					decisionTree: profile.decisionTree,
				})
				.where(eq(riskManagementProfiles.id, existing.id))
			console.log(`Updated profile: "${profile.name}"`)
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
