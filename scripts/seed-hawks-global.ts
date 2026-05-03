/**
 * Global Hawks Mode admin seed.
 *
 * Idempotent. Re-runnable. Creates shared assets, timeframes, indicator
 * group + definitions, and the "Hawks — Capital ÷ 20" risk profile.
 *
 * Usage:
 *   pnpm tsx scripts/seed-hawks-global.ts
 */

import "dotenv/config"
import { drizzle } from "drizzle-orm/neon-http"
import { neon } from "@neondatabase/serverless"
import { eq } from "drizzle-orm"
import * as schema from "../src/db/schema"
import type { DecisionTreeConfig } from "../src/types/risk-profile"

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql, { schema })

const log = (msg: string) => console.log(`  ${msg}`)
const section = (msg: string) => console.log(`\n— ${msg}`)

const seedAssetTypes = async () => {
	section("Asset Types")
	const types = [
		{ code: "FUTURE_INDEX", name: "Future Index", description: "Index futures contracts" },
		{ code: "FUTURE_FX", name: "Future FX", description: "Currency futures contracts" },
	]
	for (const t of types) {
		const existing = await db.query.assetTypes.findFirst({
			where: eq(schema.assetTypes.code, t.code),
		})
		if (existing) {
			log(`= ${t.code}`)
		} else {
			await db.insert(schema.assetTypes).values(t)
			log(`+ ${t.code}`)
		}
	}
}

const seedAssets = async () => {
	section("Assets (WIN, WDO, IND, DOL)")
	const indexType = await db.query.assetTypes.findFirst({
		where: eq(schema.assetTypes.code, "FUTURE_INDEX"),
	})
	const fxType = await db.query.assetTypes.findFirst({
		where: eq(schema.assetTypes.code, "FUTURE_FX"),
	})
	if (!indexType || !fxType) {
		throw new Error("Asset types missing — run seedAssetTypes first.")
	}

	// tickValue is cents per tick.
	// WIN: tickSize=5pts, R$1.00/tick = 100 cents
	// WDO: tickSize=0.5pt, R$5.00/tick = 500 cents
	// IND: tickSize=5pts, R$5.00/tick = 500 cents (5x bigger than mini)
	// DOL: tickSize=0.5pt, R$25.00/tick = 2500 cents (5x bigger than mini)
	const assetsRows = [
		{ symbol: "WIN", name: "Mini Índice Bovespa Futuro", assetTypeId: indexType.id, tickSize: "5", tickValue: 100, currency: "BRL", multiplier: "0.20" },
		{ symbol: "WDO", name: "Mini Dólar Futuro", assetTypeId: fxType.id, tickSize: "0.5", tickValue: 500, currency: "BRL", multiplier: "10" },
		{ symbol: "IND", name: "Índice Bovespa Cheio", assetTypeId: indexType.id, tickSize: "5", tickValue: 500, currency: "BRL", multiplier: "1" },
		{ symbol: "DOL", name: "Dólar Cheio", assetTypeId: fxType.id, tickSize: "0.5", tickValue: 2500, currency: "BRL", multiplier: "50" },
	]
	for (const row of assetsRows) {
		const existing = await db.query.assets.findFirst({
			where: eq(schema.assets.symbol, row.symbol),
		})
		if (existing) {
			log(`= ${row.symbol}`)
		} else {
			await db.insert(schema.assets).values(row)
			log(`+ ${row.symbol}`)
		}
	}
}

const seedTimeframes = async () => {
	section("Timeframes (Renko + time-based)")
	const rows: Array<{
		code: string
		name: string
		type: "time_based" | "renko"
		value: number
		unit: "minutes" | "hours" | "days" | "weeks" | "ticks" | "points"
		sortOrder: number
	}> = [
		// Renko (Hawks-tagged via name prefix "Renko")
		{ code: "RENKO_5", name: "Renko 5R", type: "renko", value: 5, unit: "points", sortOrder: 100 },
		{ code: "RENKO_11", name: "Renko 11R (mín. índice)", type: "renko", value: 11, unit: "points", sortOrder: 101 },
		{ code: "RENKO_13", name: "Renko 13R", type: "renko", value: 13, unit: "points", sortOrder: 102 },
		{ code: "RENKO_23", name: "Renko 23R (15 min)", type: "renko", value: 23, unit: "points", sortOrder: 103 },
		{ code: "RENKO_45", name: "Renko 45R (60 min)", type: "renko", value: 45, unit: "points", sortOrder: 104 },
		{ code: "RENKO_88", name: "Renko 88R (vol alta)", type: "renko", value: 88, unit: "points", sortOrder: 105 },
		{ code: "RENKO_123", name: "Renko 123R (peak vola)", type: "renko", value: 123, unit: "points", sortOrder: 106 },
		// Time-based (context only)
		{ code: "M5", name: "5 min", type: "time_based", value: 5, unit: "minutes", sortOrder: 10 },
		{ code: "M15", name: "15 min", type: "time_based", value: 15, unit: "minutes", sortOrder: 11 },
		{ code: "M60", name: "60 min (juiz)", type: "time_based", value: 60, unit: "minutes", sortOrder: 12 },
		{ code: "D1", name: "Diário", type: "time_based", value: 1, unit: "days", sortOrder: 13 },
	]
	for (const row of rows) {
		const existing = await db.query.timeframes.findFirst({
			where: eq(schema.timeframes.code, row.code),
		})
		if (existing) {
			log(`= ${row.code}`)
		} else {
			await db.insert(schema.timeframes).values(row)
			log(`+ ${row.code}`)
		}
	}
}

const seedIndicators = async () => {
	section("Indicator Group: Hawks Core")
	let group = await db.query.indicatorGroups.findFirst({
		where: eq(schema.indicatorGroups.key, "hawks_core"),
	})
	if (!group) {
		const inserted = await db.insert(schema.indicatorGroups).values({
			key: "hawks_core",
			displayName: "Hawks Core",
			description: "Indicators required by Pedro Palmezani's Hawks methodology.",
			sortOrder: 50,
		}).returning()
		group = inserted[0]
		log(`+ group hawks_core`)
	} else {
		log(`= group hawks_core`)
	}

	const defs = [
		{ key: "macd_hist_5m", displayName: "MACD Histograma 5 min (21/89/42)", csvHeader: "MACD-21-89-42-Hist", sortOrder: 1 },
		{ key: "macd_hist_60m", displayName: "MACD Histograma 60 min (27/117/55)", csvHeader: "MACD-27-117-55-Hist", sortOrder: 2 },
		{ key: "ema_27", displayName: "EMA 27", csvHeader: "EMA-27", sortOrder: 3 },
		{ key: "ema_55", displayName: "EMA 55", csvHeader: "EMA-55", sortOrder: 4 },
		{ key: "ema_27_60m_proj", displayName: "EMA 27 (60 min projetada)", csvHeader: "EMA-27-60min-projection", sortOrder: 5 },
		{ key: "ema_55_60m_proj", displayName: "EMA 55 (60 min projetada)", csvHeader: "EMA-55-60min-projection", sortOrder: 6 },
		{ key: "vwap_daily", displayName: "VWAP Diária", csvHeader: "VWAP D", sortOrder: 7 },
		{ key: "vwap_monthly", displayName: "VWAP Mensal", csvHeader: "VWAP M", sortOrder: 8 },
		{ key: "settlement_prev", displayName: "Ajuste (D-1)", csvHeader: "Ajuste", sortOrder: 9 },
		{ key: "pivot_marker", displayName: "Detector Topos/Fundos", csvHeader: "TopoFundo", sortOrder: 10 },
		{ key: "hawks_box_color", displayName: "Hawks (cor da box)", csvHeader: "Hawks-Color", sortOrder: 11 },
	]
	for (const def of defs) {
		const existing = await db.query.indicatorDefinitions.findFirst({
			where: eq(schema.indicatorDefinitions.key, def.key),
		})
		if (existing) {
			log(`  = ${def.key}`)
		} else {
			await db.insert(schema.indicatorDefinitions).values({
				...def,
				groupId: group.id,
			})
			log(`  + ${def.key}`)
		}
	}
}

const seedRiskProfile = async () => {
	section("Risk Profile: Hawks — Capital ÷ 20")
	const adminUser = await db.query.users.findFirst({
		where: eq(schema.users.isAdmin, true),
	})
	if (!adminUser) {
		console.warn("  ! No admin user found — skipping Hawks risk profile.")
		return
	}

	const tree: DecisionTreeConfig = {
		baseTrade: {
			riskCents: 50000, // R$500 fallback (≈ R$10k × 5%)
			maxContracts: 60, // Pedro 2024 reference
			minStopPoints: 11, // Pedro: minimum Renko R for index
		},
		lossRecovery: {
			sequence: [],
			executeAllRegardless: false,
			stopAfterSequence: true,
		},
		gainMode: {
			type: "singleTarget",
			dailyTargetCents: 60000, // R$600 (~ 6% of R$10k)
		},
		cascadingLimits: {
			weeklyLossCents: 150000, // 15% of R$10k
			weeklyAction: "stopTrading",
			monthlyLossCents: 250000, // 25% of R$10k
			monthlyAction: "stopTrading",
		},
		executionConstraints: {
			minStopPoints: 11,
			maxContracts: 60,
			operatingHoursStart: "09:00",
			operatingHoursEnd: "13:00",
		},
		consecutiveLossRules: [
			{ consecutiveDays: 5, action: "reduceRisk", reducePercent: 50 },
			// Pedro's "regra dos 10 dias" — halt entirely; mapped to pauseWeek as the strongest available action.
			{ consecutiveDays: 10, action: "pauseWeek", reducePercent: 0 },
		],
		riskSizing: { type: "percentOfBalance", riskPercent: 1.0 },
		limitMode: "percentOfInitial",
		limitsPercent: { daily: 5, weekly: 15, monthly: 25 },
	}

	const profile = {
		name: "Hawks — Capital ÷ 20",
		description: "Pedro Palmezani's Hawks methodology. Daily stop = capital ÷ 20 (5%). Max 3 trades/day. Stop never moves against position. Operating window 09:00–13:00 BRT. 10 stop-days in a row = halt.",
		createdByUserId: adminUser.id,
		baseRiskCents: 50000,
		dailyLossCents: 50000, // 5% of R$10k
		weeklyLossCents: 150000,
		monthlyLossCents: 250000,
		dailyProfitTargetCents: 60000,
		decisionTree: JSON.stringify(tree),
	}

	const existing = await db.query.riskManagementProfiles.findFirst({
		where: eq(schema.riskManagementProfiles.name, profile.name),
	})
	if (existing) {
		await db.update(schema.riskManagementProfiles)
			.set({
				description: profile.description,
				baseRiskCents: profile.baseRiskCents,
				dailyLossCents: profile.dailyLossCents,
				weeklyLossCents: profile.weeklyLossCents,
				monthlyLossCents: profile.monthlyLossCents,
				dailyProfitTargetCents: profile.dailyProfitTargetCents,
				decisionTree: profile.decisionTree,
				updatedAt: new Date(),
			})
			.where(eq(schema.riskManagementProfiles.id, existing.id))
		log(`= ${profile.name} (updated)`)
	} else {
		await db.insert(schema.riskManagementProfiles).values(profile)
		log(`+ ${profile.name}`)
	}
}

const main = async () => {
	console.log("Hawks Global Seed")
	console.log("=================")
	await seedAssetTypes()
	await seedAssets()
	await seedTimeframes()
	await seedIndicators()
	await seedRiskProfile()
	console.log("\nDone.")
	process.exit(0)
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
