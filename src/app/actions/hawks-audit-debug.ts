"use server"

import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import { eq } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { assets, timeframes } from "@/db/schema"
import { requireRole } from "@/lib/auth-utils"
import { runBacktest } from "@/lib/backtest/engine"
import { hawksUserCatalog } from "@/lib/backtest/presets/hawks-presets"
import { getCandleStore } from "@/lib/candle-store"
import type { CandleRow } from "@/types/candle"
import type { BacktestTrade, StrategyRecipe, UserEntry } from "@/types/backtest"
import type {
	AuditRow,
	CatalogEntry,
	HawksAuditDebugResult,
	ResultCode,
} from "./hawks-audit-debug.types"

const ENTRIES_DIR = resolve(process.cwd(), "data/hawks/user-entries")
const ASSET_SYMBOL = "WIN"
const ASSET_CONFIG = {
	tickSize: 5,
	tickValueCents: 100,
	currency: "BRL",
} as const

const classifyResult = (reason: string, pnlCents: number): ResultCode => {
	if (reason === "target1") {
		return "GA"
	}
	if (reason === "breakeven_stop") {
		return "BE"
	}
	if (reason === "stop" && pnlCents < 0) {
		return "ST"
	}
	if (reason === "eod") {
		return "EOD"
	}
	return "???"
}

const loadCatalogForRange = (
	fromDate: string,
	toDate: string
): { entries: CatalogEntry[]; allDays: string[] } => {
	const files = readdirSync(ENTRIES_DIR)
		.filter((f) => f.endsWith(".json"))
		.sort()
	const allDays = files.map((f) => f.replace(".json", ""))
	const entries: CatalogEntry[] = []
	for (const f of files) {
		const date = f.replace(".json", "")
		if (date < fromDate || date > toDate) {
			continue
		}
		const raw = JSON.parse(
			readFileSync(resolve(ENTRIES_DIR, f), "utf-8")
		) as CatalogEntry[]
		for (const e of raw) {
			if (e.expectedResult != null) {
				entries.push(e)
			}
		}
	}
	return { entries, allDays }
}

const fetchCandles = async (
	fromDate: string,
	toDate: string
): Promise<CandleRow[]> => {
	const fromUtc = new Date(`${fromDate}T03:00:00.000Z`)
	const toUtc = new Date(`${toDate}T03:00:00.000Z`)
	toUtc.setUTCDate(toUtc.getUTCDate() + 1)

	const assetRow = (
		await db
			.select({ id: assets.id })
			.from(assets)
			.where(eq(assets.symbol, ASSET_SYMBOL))
			.limit(1)
	)[0]
	if (!assetRow) {
		throw new Error(`Asset ${ASSET_SYMBOL} not found`)
	}
	const tfRow = (
		await db
			.select({ id: timeframes.id })
			.from(timeframes)
			.where(eq(timeframes.code, "hawk_5m_win"))
			.limit(1)
	)[0]
	if (!tfRow) {
		throw new Error(
			"Timeframe hawk_5m_win not found — run scripts/materialize-hawks-timeframes.ts"
		)
	}

	const rows = await getCandleStore().fetchRange({
		assetId: assetRow.id,
		timeframeId: tfRow.id,
		from: fromUtc,
		to: toUtc,
		indicatorKeys: "*",
	})

	return rows.map((r) => ({
		timestamp: r.timestamp,
		open: r.open,
		high: r.high,
		low: r.low,
		close: r.close,
		candleIndex: r.candleIndex ?? 0,
		indicators: r.indicators,
	}))
}

const tradeDayKey = (entryTime: string): string => {
	const ms = new Date(entryTime).getTime() - 3 * 3600 * 1000
	return new Date(ms).toISOString().slice(0, 10)
}

const computeMismatchPattern = (
	computed: ResultCode | null,
	expected: string | null
): string | null => {
	if (!expected) {
		return null
	}
	if (!computed) {
		return `NOT_FIRED→${expected}`
	}
	if (computed === expected) {
		return null
	}
	return `${computed}→${expected}`
}

export const runHawksAuditDebug = async (
	fromDate: string,
	toDate: string
): Promise<HawksAuditDebugResult> => {
	try {
		await requireRole("admin")

		if (
			!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) ||
			!/^\d{4}-\d{2}-\d{2}$/.test(toDate) ||
			fromDate > toDate
		) {
			return { status: "error", message: "Invalid date range" }
		}

		const { entries: catalog, allDays } = loadCatalogForRange(fromDate, toDate)

		if (catalog.length === 0) {
			return {
				status: "success",
				data: {
					assetSymbol: ASSET_SYMBOL,
					fromDate,
					toDate,
					rows: [],
					stats: {
						totalDays: 0,
						totalCatalog: 0,
						fired: 0,
						notFired: 0,
						matched: 0,
						mismatched: 0,
						anomalies: 0,
						matchPct: 0,
						byPattern: {},
					},
					availableDays: allDays,
				},
			}
		}

		const candles = await fetchCandles(fromDate, toDate)
		if (candles.length === 0) {
			return { status: "error", message: "No candles in DB for that range" }
		}

		const recipe: StrategyRecipe = {
			...hawksUserCatalog,
			entry: {
				type: "user_catalog",
				config: {
					...(hawksUserCatalog.entry.type === "user_catalog"
						? hawksUserCatalog.entry.config
						: { catalog: [] }),
					catalog: catalog as UserEntry[],
				},
			},
		}

		const result = runBacktest(candles, recipe, ASSET_CONFIG)

		const tradeByKey = new Map<string, BacktestTrade>()
		for (const trade of result.trades) {
			const day = tradeDayKey(trade.entryTime)
			tradeByKey.set(`${day}:${trade.label}`, trade)
		}

		const rows: AuditRow[] = []
		const byPattern: Record<string, number> = {}
		let fired = 0
		let notFired = 0
		let matched = 0
		let mismatched = 0
		let anomalies = 0

		for (const entry of catalog) {
			const label = entry.label ?? ""
			const key = `${entry.date}:${label}`
			const trade = tradeByKey.get(key) ?? null
			const computed = trade
				? classifyResult(trade.exitReason, trade.netPnlCents)
				: null
			const expected = entry.expectedResult ?? null
			const isMatch = computed !== null && computed === expected
			const pattern = computeMismatchPattern(computed, expected)

			if (computed === "???") {
				anomalies++
			}
			if (trade) {
				fired++
			} else {
				notFired++
			}
			if (isMatch) {
				matched++
			} else {
				mismatched++
			}
			if (pattern) {
				byPattern[pattern] = (byPattern[pattern] ?? 0) + 1
			}

			rows.push({
				date: entry.date,
				label,
				brickIndex: entry.brickIndex,
				direction: entry.direction,
				expectedResult: expected,
				closingBrickPrice: entry.closingBrickPrice ?? null,
				trade,
				computedResult: computed,
				matched: isMatch,
				mismatchPattern: pattern,
			})
		}

		const totalCatalog = catalog.length
		const matchPct =
			totalCatalog === 0
				? 0
				: Math.round((matched / totalCatalog) * 10000) / 100
		const uniqueDays = new Set(catalog.map((e) => e.date)).size

		return {
			status: "success",
			data: {
				assetSymbol: ASSET_SYMBOL,
				fromDate,
				toDate,
				rows,
				stats: {
					totalDays: uniqueDays,
					totalCatalog,
					fired,
					notFired,
					matched,
					mismatched,
					anomalies,
					matchPct,
					byPattern,
				},
				availableDays: allDays,
			},
		}
	} catch (err) {
		return {
			status: "error",
			message: err instanceof Error ? err.message : "Unknown error",
		}
	}
}
