import { randomUUID } from "node:crypto"
import type { SeedSql } from "../helpers/sql"
import type { SeededAccounts } from "../accounts"
import type { CascadesByAccount } from "../plans"
import type { HawksPlaybookMap } from "../playbooks-hawks"
import { createPrng } from "../helpers/prng"
import {
	generateProceduralTrades,
	type GeneratedTrade,
	type ProceduralMonthSpec,
} from "./generate"

// Hawks Pro — R$50k → R$150k Jan-May 2026 with one drawdown month.
// Targets approximate the plan-cascade monthlyStartCents deltas, with
// realistic shortfall + March friction (DARF carryover surfaces).
const HAWKS_PRO_NET_CENTS = [
	1_500_000, // Jan + R$15k
	2_200_000, // Feb + R$22k
	500_000, // Mar + R$5k  (rough month — losing weeks within profit)
	3_200_000, // Apr + R$32k
	1_500_000, // May + R$15k
]

// Curated scenario pool per playbook. Picked from src/lib/hawks/seed-data.ts.
const SCENARIO_BY_PLAYBOOK: Record<string, string[]> = {
	HWK_TENDENCIA_CLARA: ["HWK_S07", "HWK_S08", "HWK_S09", "HWK_S15"],
	HWK_PULLBACK_5M: ["HWK_S07", "HWK_S08", "HWK_S16", "HWK_S17"],
	HWK_LATERAL_REVERSAO: ["HWK_S10", "HWK_S11", "HWK_S18"],
	HWK_VIRADA_60M: ["HWK_S01", "HWK_S02", "HWK_S03", "HWK_S04"],
}

const PLAYBOOK_WEIGHTS: Array<{ code: string; weight: number }> = [
	{ code: "HWK_TENDENCIA_CLARA", weight: 0.5 },
	{ code: "HWK_PULLBACK_5M", weight: 0.3 },
	{ code: "HWK_LATERAL_REVERSAO", weight: 0.15 },
	{ code: "HWK_VIRADA_60M", weight: 0.05 },
]

const weightedPick = <T>(
	options: Array<{ value: T; weight: number }>,
	rand: () => number
): T => {
	const total = options.reduce((s, o) => s + o.weight, 0)
	let r = rand() * total
	for (const o of options) {
		r -= o.weight
		if (r <= 0) {
			return o.value
		}
	}
	const last = options[options.length - 1]
	if (!last) {
		throw new Error("weightedPick called with empty options")
	}
	return last.value
}

interface OcoRow {
	asset: "WIN" | "WDO"
	effectiveDate: string
	stopTicks: number
	targetTicks: number
}

const fetchHawksProOco = async (
	sql: SeedSql,
	accountId: string
): Promise<OcoRow[]> => {
	const rows = (await sql`
		SELECT asset, effective_date, stop_ticks, target_ticks
		FROM hawks_weekly_oco
		WHERE account_id = ${accountId}
		ORDER BY effective_date ASC
	`) as {
		asset: "WIN" | "WDO"
		effective_date: string
		stop_ticks: number
		target_ticks: number
	}[]
	return rows.map((r) => ({
		asset: r.asset,
		effectiveDate: r.effective_date,
		stopTicks: r.stop_ticks,
		targetTicks: r.target_ticks,
	}))
}

const findOcoForTrade = (
	ocoRows: OcoRow[],
	asset: "WIN" | "WDO",
	tradingDayIso: string
): OcoRow | null => {
	let best: OcoRow | null = null
	for (const row of ocoRows) {
		if (row.asset !== asset) {
			continue
		}
		if (row.effectiveDate <= tradingDayIso) {
			if (!best || row.effectiveDate > best.effectiveDate) {
				best = row
			}
		}
	}
	return best
}

const fetchScenarioMap = async (sql: SeedSql): Promise<Map<string, string>> => {
	const rows = (await sql`
		SELECT id, code FROM hawks_scenarios
	`) as { id: string; code: string }[]
	const map = new Map<string, string>()
	for (const r of rows) {
		map.set(r.code, r.id)
	}
	return map
}

const toIsoDate = (d: Date): string => d.toISOString().slice(0, 10)

// Tick-to-points: WIN 1 tick = 5 pts; WDO 1 tick = 0.5 pts.
const ticksToPoints = (asset: "WIN" | "WDO", ticks: number): number =>
	asset === "WIN" ? ticks * 5 : ticks * 0.5

// 17:30 BRT = 20:30 UTC on the same calendar day.
const buildExpiresAt = (tradingDayIso: string): string =>
	`${tradingDayIso}T20:30:00.000Z`

// Daily bias confirmed 30 minutes before first entry (pre-market thesis).
const buildConfirmedAt = (firstEntryIso: string): string => {
	const d = new Date(firstEntryIso)
	d.setUTCMinutes(d.getUTCMinutes() - 30)
	return d.toISOString()
}

interface EnrichedTrade extends GeneratedTrade {
	id: string
	playbookCode: string
	scenarioCode: string
	dailyTradeOrdinal: number
	biasAtEntry: "long" | "short" | "neutral"
	vwapRespected: boolean
	ajusteRespected: boolean
	tripleScreenConfirmed: boolean
}

const enrichTrades = (
	trades: GeneratedTrade[],
	ocoRows: OcoRow[],
	rand: () => number
): EnrichedTrade[] => {
	const sorted = [...trades].sort((a, b) =>
		a.entryTime.localeCompare(b.entryTime)
	)
	let currentDayIso = ""
	let ordinal = 0
	const out: EnrichedTrade[] = []
	for (const t of sorted) {
		const tradingDayIso = toIsoDate(t.tradingDay)
		if (tradingDayIso !== currentDayIso) {
			currentDayIso = tradingDayIso
			ordinal = 0
		}
		ordinal++

		const oco = findOcoForTrade(ocoRows, t.asset, tradingDayIso)
		const stopPoints = oco
			? ticksToPoints(t.asset, oco.stopTicks)
			: t.asset === "WIN"
				? 100
				: 5
		const targetPoints = oco
			? ticksToPoints(t.asset, oco.targetTicks)
			: stopPoints * 3
		const sl = t.dir === "long" ? t.entryP - stopPoints : t.entryP + stopPoints
		const tp =
			t.dir === "long" ? t.entryP + targetPoints : t.entryP - targetPoints

		const playbookCode = weightedPick(
			PLAYBOOK_WEIGHTS.map((p) => ({ value: p.code, weight: p.weight })),
			rand
		)
		const scenarios = SCENARIO_BY_PLAYBOOK[playbookCode]
		if (!scenarios || scenarios.length === 0) {
			throw new Error(`No scenarios for playbook ${playbookCode}`)
		}
		const scenarioCode =
			scenarios[Math.floor(rand() * scenarios.length)] ?? scenarios[0]
		if (!scenarioCode) {
			throw new Error(`Failed to pick scenario for ${playbookCode}`)
		}

		const biasAtEntry: "long" | "short" | "neutral" =
			playbookCode === "HWK_LATERAL_REVERSAO" && rand() < 0.4
				? "neutral"
				: t.dir
		const tripleScreenConfirmed = t.plan && rand() < 0.95
		const vwapRespected = rand() < 0.85
		const ajusteRespected = rand() < 0.8

		out.push({
			...t,
			id: randomUUID(),
			sl: Math.round(sl * 100) / 100,
			tp: Math.round(tp * 100) / 100,
			playbookCode,
			scenarioCode,
			dailyTradeOrdinal: ordinal,
			biasAtEntry,
			vwapRespected,
			ajusteRespected,
			tripleScreenConfirmed,
		})
	}
	return out
}

const insertHawksProTrades = async (
	sql: SeedSql,
	accountId: string,
	trades: EnrichedTrade[],
	playbookMap: HawksPlaybookMap
): Promise<void> => {
	for (const t of trades) {
		const playbook = playbookMap[t.playbookCode]
		if (!playbook) {
			throw new Error(`Missing playbook ${t.playbookCode} in playbookMap`)
		}
		await sql`
			INSERT INTO trades (
				id, account_id, asset, direction, timeframe_id,
				entry_date, exit_date,
				entry_price, exit_price, position_size, stop_loss, take_profit,
				planned_risk_amount, realized_r_multiple,
				pnl, outcome, followed_plan, strategy_id, is_archived,
				one_r_snapshot_cents, r_outcome, source
			) VALUES (
				${t.id}, ${accountId}, ${t.asset}, ${t.dir}, NULL,
				${t.entryTime}, ${t.exitTime},
				${t.entryP.toString()}, ${t.exitP.toString()}, ${t.size.toString()},
				${t.sl.toString()}, ${t.tp.toString()},
				${t.plannedRiskAmountCents.toString()}, ${t.rOutcome},
				${t.pnlCents.toString()}, ${t.outcome}, ${t.plan}, ${playbook.strategyId}, false,
				${t.oneRSnapshotCents}, ${t.rOutcome}, 'manual'
			)
		`
	}
}

const insertHawksMetadata = async (
	sql: SeedSql,
	accountId: string,
	trades: EnrichedTrade[],
	scenarioMap: Map<string, string>
): Promise<void> => {
	for (const t of trades) {
		const scenarioId = scenarioMap.get(t.scenarioCode)
		if (!scenarioId) {
			throw new Error(`Unknown scenario code ${t.scenarioCode}`)
		}
		const tradingDayIso = toIsoDate(t.tradingDay)
		await sql`
			INSERT INTO trade_hawks_metadata (
				trade_id, account_id, trading_day, scenario_id, bias_at_entry,
				vwap_respected, ajuste_respected, triple_screen_confirmed,
				daily_trade_ordinal, entered_at
			) VALUES (
				${t.id}, ${accountId}, ${tradingDayIso}, ${scenarioId}, ${t.biasAtEntry},
				${t.vwapRespected}, ${t.ajusteRespected}, ${t.tripleScreenConfirmed},
				${t.dailyTradeOrdinal}, ${t.entryTime}
			)
		`
	}
}

interface DailyBiasRow {
	tradingDayIso: string
	bias: "long" | "short" | "neutral"
	firstEntryIso: string
	renkoCloseAbove60min: boolean
	macdSlopeUp: boolean
	emaStackBullish: boolean
	vwapAbove: boolean
	ajusteRespected: boolean
	notesPt: string
}

const buildDailyBiasRows = (
	trades: EnrichedTrade[],
	rand: () => number
): DailyBiasRow[] => {
	const byDay = new Map<string, EnrichedTrade[]>()
	for (const t of trades) {
		const key = toIsoDate(t.tradingDay)
		const arr = byDay.get(key) ?? []
		arr.push(t)
		byDay.set(key, arr)
	}
	const rows: DailyBiasRow[] = []
	for (const [tradingDayIso, dayTrades] of byDay.entries()) {
		dayTrades.sort((a, b) => a.entryTime.localeCompare(b.entryTime))
		const first = dayTrades[0]
		if (!first) {
			continue
		}
		const netPnlCents = dayTrades.reduce((s, t) => s + t.pnlCents, 0)
		const dominantDir =
			dayTrades.filter((t) => t.dir === "long").length >= dayTrades.length / 2
				? "long"
				: "short"
		const bias: "long" | "short" | "neutral" =
			Math.abs(netPnlCents) < 50_000 ? "neutral" : dominantDir
		const bullish = bias === "long"
		const notesPt =
			bias === "neutral"
				? "Lateral 60min, opera apenas reversões nos extremos."
				: bullish
					? "60min em tendência de alta confirmada, busca pullbacks na EMA 27/55."
					: "60min em tendência de baixa confirmada, busca pullbacks na EMA 27/55."
		rows.push({
			tradingDayIso,
			bias,
			firstEntryIso: first.entryTime,
			renkoCloseAbove60min: bullish,
			macdSlopeUp: bullish || (bias === "neutral" && rand() < 0.5),
			emaStackBullish: bullish,
			vwapAbove: bullish || rand() < 0.3,
			ajusteRespected: rand() < 0.85,
			notesPt,
		})
	}
	return rows
}

const insertDailyBias = async (
	sql: SeedSql,
	accountId: string,
	rows: DailyBiasRow[]
): Promise<void> => {
	for (const r of rows) {
		await sql`
			INSERT INTO daily_hawks_bias (
				id, account_id, trading_day, bias,
				renko_close_above_60min, macd_slope_up, ema_stack_bullish,
				vwap_above, ajuste_respected,
				confirmed_at, expires_at, notes_pt
			) VALUES (
				gen_random_uuid(), ${accountId}, ${r.tradingDayIso}, ${r.bias},
				${r.renkoCloseAbove60min}, ${r.macdSlopeUp}, ${r.emaStackBullish},
				${r.vwapAbove}, ${r.ajusteRespected},
				${buildConfirmedAt(r.firstEntryIso)}, ${buildExpiresAt(r.tradingDayIso)},
				${r.notesPt}
			)
		`
	}
}

export const seedHawksProTrades = async (
	sql: SeedSql,
	accounts: SeededAccounts,
	cascades: CascadesByAccount,
	hawksPlaybooks: HawksPlaybookMap
): Promise<void> => {
	console.log(
		"\n📦 Generating Hawks Pro trades (Jan–May 2026, Pedro 3x methodology)..."
	)

	const hawksYears = cascades.get(accounts.hawksPro.id)
	const cascade2026 = hawksYears?.find((y) => y.year === 2026)
	if (!cascade2026) {
		throw new Error("Missing Hawks Pro 2026 cascade")
	}

	const months: ProceduralMonthSpec[] = []
	for (let m = 1; m <= 5; m++) {
		const meta = cascade2026.monthlyByMonth.get(m)
		if (!meta) {
			throw new Error(`Missing Hawks Pro monthly_plan ${m}/2026`)
		}
		const target = HAWKS_PRO_NET_CENTS[m - 1]
		if (target === undefined) {
			throw new Error(`Missing Hawks Pro target for month ${m}`)
		}
		months.push({
			year: 2026,
			month: m,
			netTargetCents: target,
			monthMeta: meta,
		})
	}

	const baseTrades = generateProceduralTrades({
		accountId: accounts.hawksPro.id,
		prngSeed: 7711,
		months,
		strategyPicker: () => null, // overridden later via playbook
		planConformityRate: 0.92, // Hawks demands very high adherence
	})

	const ocoRows = await fetchHawksProOco(sql, accounts.hawksPro.id)
	const scenarioMap = await fetchScenarioMap(sql)

	const enrichmentRand = createPrng(7712)
	const enriched = enrichTrades(baseTrades, ocoRows, enrichmentRand)

	await insertHawksProTrades(
		sql,
		accounts.hawksPro.id,
		enriched,
		hawksPlaybooks
	)
	await insertHawksMetadata(sql, accounts.hawksPro.id, enriched, scenarioMap)

	const biasRand = createPrng(7713)
	const biasRows = buildDailyBiasRows(enriched, biasRand)
	await insertDailyBias(sql, accounts.hawksPro.id, biasRows)

	const cumulativeCents = enriched.reduce((sum, t) => sum + t.pnlCents, 0)
	console.log(
		`✅ Hawks Pro trades seeded (${enriched.length} trades, ${biasRows.length} bias days, cum R$${(cumulativeCents / 100).toFixed(2)})`
	)
}
