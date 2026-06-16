"use server"

import { readFileSync, readdirSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { eq } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { assets, timeframes } from "@/db/schema"
import { requireRole } from "@/lib/auth-utils"
import { getCandleStore } from "@/lib/candle-store"
import { buildHtfWalker } from "@/lib/backtest/hawks-htf-walker"
import { hawksV0 } from "@/lib/backtest/presets/hawks-presets"
import { getDailyAnchors } from "@/lib/indicators/daily-anchors"
import type { DailyAnchorPayload } from "@/lib/indicators/daily-anchors"
import type { CandleRow } from "@/types/candle"
import type {
	CatalogEntry,
	CatalogMarker,
	HawksIsolationData,
	IsolationCandle,
} from "./hawks-isolation-data.types"

const ENTRIES_DIR = resolve(process.cwd(), "data/hawks/user-entries")
const ASSET_SYMBOL = "WIN"
const BRT_OFFSET_MS = -3 * 60 * 60 * 1000

const dateToBrt = (ts: Date): string =>
	new Date(ts.getTime() + BRT_OFFSET_MS).toISOString().slice(0, 10)

const fetchTfCandles = async (
	tfCode: "hawk_5m_win" | "hawk_15m_win" | "hawk_60m_win",
	assetId: string,
	from: Date,
	to: Date
): Promise<CandleRow[]> => {
	const tfRow = (
		await db
			.select({ id: timeframes.id })
			.from(timeframes)
			.where(eq(timeframes.code, tfCode))
			.limit(1)
	)[0]
	if (!tfRow) {
		throw new Error(`Timeframe ${tfCode} not found`)
	}
	const rows = await getCandleStore().fetchRange({
		assetId,
		timeframeId: tfRow.id,
		from,
		to,
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

const fetchAssetId = async (): Promise<string> => {
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
	return assetRow.id
}

const loadCatalogForDate = (date: string): CatalogEntry[] => {
	const path = resolve(ENTRIES_DIR, `${date}.json`)
	if (!existsSync(path)) {
		return []
	}
	try {
		const parsed = JSON.parse(readFileSync(path, "utf-8"))
		if (!Array.isArray(parsed)) {
			return []
		}
		// Validate each entry has required fields with correct types.
		// brickIndex must be >= 1 (1-based in file, as per catalog offset logic).
		// direction must be "short" or "long" to match CatalogMarker contract.
		return parsed.filter((e) => {
			return (
				typeof e === "object" &&
				e !== null &&
				typeof e.brickIndex === "number" &&
				Number.isFinite(e.brickIndex) &&
				e.brickIndex >= 1 &&
				typeof e.direction === "string" &&
				(e.direction === "short" || e.direction === "long")
			)
		}) as CatalogEntry[]
	} catch {
		// Malformed JSON, file read error, or validation failure — return empty
		// catalog. Engine will render with no trade markers, which is safe.
		return []
	}
}

const listCleanDays = async (): Promise<string[]> => {
	const files = readdirSync(ENTRIES_DIR).filter((f) => f.endsWith(".json"))
	return files.map((f) => f.replace(".json", "")).sort()
}

const numOrNull = (v: unknown): number | null => {
	if (typeof v === "number" && Number.isFinite(v)) {
		return v
	}
	return null
}

const projectCandle = (c: CandleRow): IsolationCandle => {
	const projected: Record<string, number | null> = {}
	for (const [k, v] of Object.entries(c.indicators)) {
		projected[k] = numOrNull(v)
	}
	return {
		timestamp: c.timestamp,
		open: c.open,
		high: c.high,
		low: c.low,
		close: c.close,
		indicators: projected,
	}
}

// How many prior clean trading days to include alongside the target day. ~4
// weeks of context gives the S/R trigger machine enough swing/chop variety
// to build meaningful break+retest sequences (5m bricks ≈ 200/day → ~4000
// over 20 days, still readable on the chart with zoom).
const PRIOR_DAYS_INCLUDED = 20

const sortByTimestamp = (rows: CandleRow[]): CandleRow[] =>
	[...rows].sort((a, b) => {
		const ta = new Date(a.timestamp).getTime()
		const tb = new Date(b.timestamp).getTime()
		if (ta !== tb) {
			return ta - tb
		}
		return (a.candleIndex ?? 0) - (b.candleIndex ?? 0)
	})

export const fetchHawksIsolationData = async (
	date: string
): Promise<HawksIsolationData> => {
	await requireRole("admin")

	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
		throw new Error("Invalid date format")
	}

	if (hawksV0.entry.type !== "hawks_playbook") {
		throw new Error("Preset misconfigured")
	}
	const config = hawksV0.entry.config

	const assetId = await fetchAssetId()
	const cleanDays = await listCleanDays()

	// Walker seed: 5m candles need full history so the walker pre-seeds the
	// BULL/BEAR state correctly. 15m and 60m are only used visually — pull
	// just the rendering window.
	const fromUtcWalker = new Date(`${date}T00:00:00.000Z`)
	fromUtcWalker.setUTCFullYear(fromUtcWalker.getUTCFullYear() - 10)
	const toUtc = new Date(`${date}T00:00:00.000Z`)
	toUtc.setUTCDate(toUtc.getUTCDate() + 1)
	toUtc.setUTCHours(3)

	// Rendering window: target day + N prior CLEAN trading days.
	const targetIdx = cleanDays.indexOf(date)
	const fromIdx =
		targetIdx === -1 ? 0 : Math.max(0, targetIdx - PRIOR_DAYS_INCLUDED)
	const includedDays = new Set(
		targetIdx === -1 ? [date] : cleanDays.slice(fromIdx, targetIdx + 1)
	)
	const windowFromDay = cleanDays[fromIdx] ?? date
	const fromUtcWindow = new Date(`${windowFromDay}T00:00:00.000Z`)
	fromUtcWindow.setUTCHours(fromUtcWindow.getUTCHours() - 3)

	const [all5m, raw15m, raw60m] = await Promise.all([
		fetchTfCandles("hawk_5m_win", assetId, fromUtcWalker, toUtc),
		fetchTfCandles("hawk_15m_win", assetId, fromUtcWindow, toUtc),
		fetchTfCandles("hawk_60m_win", assetId, fromUtcWindow, toUtc),
	])

	// Enrich candles in-memory with `ajuste` (and other anchor payload keys)
	// from `asset_session_anchors`. Range is the same as the rendering window
	// — walker doesn't need ajuste, only the visual overlay does.
	// Local enrichment (CandleRow.timestamp is a string here, not a Date).
	const anchorFromDate = dateToBrt(fromUtcWindow)
	const anchorToDate = date
	const anchorsByDate = await getDailyAnchors(
		assetId,
		anchorFromDate,
		anchorToDate
	)
	const mergeAnchors = (
		rows: CandleRow[],
		anchors: Map<string, DailyAnchorPayload>
	): void => {
		for (const c of rows) {
			const dateKey = dateToBrt(new Date(c.timestamp))
			const payload = anchors.get(dateKey)
			if (!payload) {
				continue
			}
			const current = (c.indicators ?? {}) as Record<string, unknown>
			for (const [k, v] of Object.entries(payload)) {
				if (!(k in current)) {
					current[k] = v
				}
			}
			c.indicators = current
		}
	}
	mergeAnchors(all5m, anchorsByDate)
	mergeAnchors(raw15m, anchorsByDate)
	mergeAnchors(raw60m, anchorsByDate)

	const all5mSorted = sortByTimestamp(all5m)
	const all15mSorted = sortByTimestamp(raw15m)
	const walker = buildHtfWalker(all5mSorted, config, all15mSorted)

	const windowed5m = all5mSorted.filter((c) =>
		includedDays.has(dateToBrt(new Date(c.timestamp)))
	)
	const windowed15m = sortByTimestamp(raw15m).filter((c) =>
		includedDays.has(dateToBrt(new Date(c.timestamp)))
	)
	const windowed60m = sortByTimestamp(raw60m).filter((c) =>
		includedDays.has(dateToBrt(new Date(c.timestamp)))
	)

	const walkerByTimestamp: HawksIsolationData["walkerByTimestamp"] = {}
	for (const c of windowed5m) {
		const snap = walker.get(c.timestamp)
		if (snap) {
			walkerByTimestamp[c.timestamp] = {
				gate15m: snap.gate15m,
				gate60m: snap.gate60m,
			}
		}
	}

	const candles5m = windowed5m.map(projectCandle)
	const candles15m = windowed15m.map(projectCandle)
	const candles60m = windowed60m.map(projectCandle)

	// Catalog brickIndex stored 1-based in the file (against target day's 5m
	// brick ordering); chart `time` axis is 0-based and offset by prior-day
	// brick count.
	const priorBrickCount = candles5m.findIndex(
		(c) => dateToBrt(new Date(c.timestamp)) === date
	)
	const offset = priorBrickCount === -1 ? 0 : priorBrickCount
	const rawCatalog = loadCatalogForDate(date)
	let droppedOutOfRange = 0
	const catalog: CatalogMarker[] = rawCatalog.flatMap((e) => {
		const absoluteIndex = offset + e.brickIndex - 1
		if (absoluteIndex < offset || absoluteIndex >= candles5m.length) {
			droppedOutOfRange++
			return []
		}
		return [
			{
				brickIndex: absoluteIndex,
				label:
					e.label ??
					(e.tradeNumber !== undefined ? `T${String(e.tradeNumber)}` : "T?"),
				direction: e.direction,
				closePrice: typeof e.closePrice === "number" ? e.closePrice : null,
			},
		]
	})
	if (droppedOutOfRange > 0) {
		console.warn(
			`[hawks-isolation] catalog ${date}: dropped ${droppedOutOfRange} out-of-range brickIndex ` +
				`(window=[${offset}, ${candles5m.length}))`
		)
	}

	return {
		date,
		candles5m,
		candles15m,
		candles60m,
		walkerByTimestamp,
		catalog,
		cleanDays,
	}
}
