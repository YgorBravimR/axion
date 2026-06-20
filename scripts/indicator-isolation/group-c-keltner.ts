/**
 * Indicator-isolation audit — Group C: Keltner Bands (Touch + Reject).
 *
 * For each Hawks timeframe (5m, 15m, 60m) we compute:
 *
 *   (a) The methodology-correct position class per brick (above / inside /
 *       below each of the 4 bands kc1_inf, kc1_sup, kc2_inf, kc2_sup).
 *   (b) The methodology-correct touch+reject walker per band, emitting per-brick
 *       events of class:
 *         NONE
 *         TOUCH_KC{1,2}_{INF,SUP}                (touch, no reject yet)
 *         REJECT_KC{1,2}_{INF,SUP}_SAME_BRICK    (same-brick touch + close-back)
 *         REJECT_KC{1,2}_{INF,SUP}_NEXT_BRICK    (touched prior brick, this brick closes back)
 *   (c) Axion's current state — which is **nothing**. The engine has zero
 *       Keltner reads. We document this gap and produce the methodology
 *       baseline so it can be diffed against the eventual walker output.
 *
 * Touch definition: wick-based — any part of the brick (low / high) reaching or
 * piercing the band counts. For SUP bands: `high >= sup`. For INF: `low <= inf`.
 *
 * Reject definition: the close-back side of the touch.
 *   SUP same-brick reject: `high >= sup AND close < sup`
 *   SUP next-brick reject: prior brick touched sup, this brick closes < sup
 *   INF same-brick reject: `low <= inf AND close > inf`
 *   INF next-brick reject: prior brick touched inf, this brick closes > inf
 *
 * Source columns per timeframe (all three TFs use the same names):
 *   5m   data/parquet/candles/hawk_5m_win/WIN.parquet   kc1_{inf,sup}, kc2_{inf,sup}
 *   15m  data/parquet/candles/hawk_15m_win/WIN.parquet  same
 *   60m  data/parquet/candles/hawk_60m_win/WIN.parquet  same
 *
 * Usage:
 *   pnpm tsx scripts/indicator-isolation/group-c-keltner.ts
 *   pnpm tsx scripts/indicator-isolation/group-c-keltner.ts --from 2026-03-02 --to 2026-03-13
 *   pnpm tsx scripts/indicator-isolation/group-c-keltner.ts --samples 20
 *   pnpm tsx scripts/indicator-isolation/group-c-keltner.ts --tf 60m
 */

import "dotenv/config"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { DuckDBInstance } from "@duckdb/node-api"

type TfLabel = "5m" | "15m" | "60m"

const TF_CONFIG: Record<TfLabel, { parquet: string }> = {
	"5m": {
		parquet: resolve(
			process.cwd(),
			"data/parquet/candles/hawk_5m_win/WIN.parquet"
		),
	},
	"15m": {
		parquet: resolve(
			process.cwd(),
			"data/parquet/candles/hawk_15m_win/WIN.parquet"
		),
	},
	"60m": {
		parquet: resolve(
			process.cwd(),
			"data/parquet/candles/hawk_60m_win/WIN.parquet"
		),
	},
}

interface RawBrick {
	timestamp: string
	high: number | null
	low: number | null
	close: number | null
	kc1_inf: number | null
	kc1_sup: number | null
	kc2_inf: number | null
	kc2_sup: number | null
}

type Position = "above" | "inside" | "below" | "no_data"

type TouchRejectClass =
	| "NONE"
	| "TOUCH_KC1_INF"
	| "TOUCH_KC1_SUP"
	| "TOUCH_KC2_INF"
	| "TOUCH_KC2_SUP"
	| "REJECT_KC1_INF_SAME_BRICK"
	| "REJECT_KC1_SUP_SAME_BRICK"
	| "REJECT_KC2_INF_SAME_BRICK"
	| "REJECT_KC2_SUP_SAME_BRICK"
	| "REJECT_KC1_INF_NEXT_BRICK"
	| "REJECT_KC1_SUP_NEXT_BRICK"
	| "REJECT_KC2_INF_NEXT_BRICK"
	| "REJECT_KC2_SUP_NEXT_BRICK"
	| "NO_DATA"

const toNumber = (v: unknown): number | null => {
	if (typeof v === "number") {
		return v
	}
	if (typeof v === "bigint") {
		return Number(v)
	}
	if (v !== null && typeof v === "object" && "value" in v && "scale" in v) {
		const { value, scale } = v as { value: number | bigint; scale: number }
		return Number(value) / Math.pow(10, scale)
	}
	if (v === null || v === undefined) {
		return null
	}
	const n = Number(v)
	return Number.isNaN(n) ? null : n
}

const toIsoString = (v: unknown): string => {
	if (v instanceof Date) {
		return v.toISOString()
	}
	if (typeof v === "string") {
		return new Date(v).toISOString()
	}
	if (typeof v === "number") {
		return new Date(v).toISOString()
	}
	if (typeof v === "bigint") {
		return new Date(Number(v) / 1000).toISOString()
	}
	if (v !== null && typeof v === "object" && "micros" in v) {
		const micros = (v as { micros: number | bigint }).micros
		return new Date(Number(micros) / 1000).toISOString()
	}
	throw new Error(`unparseable timestamp ${String(v)}`)
}

/**
 * Position classifier — close vs (inf, sup) for one band pair.
 * "above" means close > sup, "below" means close < inf, "inside" otherwise.
 */
const classifyPosition = (
	close: number | null,
	inf: number | null,
	sup: number | null
): Position => {
	if (close === null || inf === null || sup === null) {
		return "no_data"
	}
	if (close > sup) {
		return "above"
	}
	if (close < inf) {
		return "below"
	}
	return "inside"
}

/**
 * Touch+reject walker per band. Emits one class per brick; priority order
 * favors outer bands and reject-confirmations over plain touches when multiple
 * conditions hold on the same brick:
 *
 *   1. REJECT_KC2_*_SAME_BRICK
 *   2. REJECT_KC2_*_NEXT_BRICK
 *   3. REJECT_KC1_*_SAME_BRICK
 *   4. REJECT_KC1_*_NEXT_BRICK
 *   5. TOUCH_KC2_SUP / TOUCH_KC2_INF
 *   6. TOUCH_KC1_SUP / TOUCH_KC1_INF
 *   7. NONE
 *
 * Prior-brick touch memory carries the four touch flags (kc1_inf, kc1_sup,
 * kc2_inf, kc2_sup) forward exactly one brick — the next-brick reject window
 * is intentionally narrow.
 */
const walkTouchReject = (bricks: RawBrick[]): TouchRejectClass[] => {
	const out: TouchRejectClass[] = new Array(bricks.length)
	let priorTouches: {
		kc1_inf: boolean
		kc1_sup: boolean
		kc2_inf: boolean
		kc2_sup: boolean
	} = { kc1_inf: false, kc1_sup: false, kc2_inf: false, kc2_sup: false }

	for (let i = 0; i < bricks.length; i++) {
		const b = bricks[i]!
		if (
			b.high === null ||
			b.low === null ||
			b.close === null ||
			b.kc1_inf === null ||
			b.kc1_sup === null ||
			b.kc2_inf === null ||
			b.kc2_sup === null
		) {
			out[i] = "NO_DATA"
			priorTouches = {
				kc1_inf: false,
				kc1_sup: false,
				kc2_inf: false,
				kc2_sup: false,
			}
			continue
		}

		const touchKc1Inf = b.low <= b.kc1_inf
		const touchKc1Sup = b.high >= b.kc1_sup
		const touchKc2Inf = b.low <= b.kc2_inf
		const touchKc2Sup = b.high >= b.kc2_sup

		const rejectKc1InfSame = touchKc1Inf && b.close > b.kc1_inf
		const rejectKc1SupSame = touchKc1Sup && b.close < b.kc1_sup
		const rejectKc2InfSame = touchKc2Inf && b.close > b.kc2_inf
		const rejectKc2SupSame = touchKc2Sup && b.close < b.kc2_sup

		const rejectKc1InfNext = priorTouches.kc1_inf && b.close > b.kc1_inf
		const rejectKc1SupNext = priorTouches.kc1_sup && b.close < b.kc1_sup
		const rejectKc2InfNext = priorTouches.kc2_inf && b.close > b.kc2_inf
		const rejectKc2SupNext = priorTouches.kc2_sup && b.close < b.kc2_sup

		let cls: TouchRejectClass = "NONE"
		if (rejectKc2SupSame) {
			cls = "REJECT_KC2_SUP_SAME_BRICK"
		} else if (rejectKc2InfSame) {
			cls = "REJECT_KC2_INF_SAME_BRICK"
		} else if (rejectKc2SupNext) {
			cls = "REJECT_KC2_SUP_NEXT_BRICK"
		} else if (rejectKc2InfNext) {
			cls = "REJECT_KC2_INF_NEXT_BRICK"
		} else if (rejectKc1SupSame) {
			cls = "REJECT_KC1_SUP_SAME_BRICK"
		} else if (rejectKc1InfSame) {
			cls = "REJECT_KC1_INF_SAME_BRICK"
		} else if (rejectKc1SupNext) {
			cls = "REJECT_KC1_SUP_NEXT_BRICK"
		} else if (rejectKc1InfNext) {
			cls = "REJECT_KC1_INF_NEXT_BRICK"
		} else if (touchKc2Sup) {
			cls = "TOUCH_KC2_SUP"
		} else if (touchKc2Inf) {
			cls = "TOUCH_KC2_INF"
		} else if (touchKc1Sup) {
			cls = "TOUCH_KC1_SUP"
		} else if (touchKc1Inf) {
			cls = "TOUCH_KC1_INF"
		}

		out[i] = cls
		priorTouches = {
			kc1_inf: touchKc1Inf,
			kc1_sup: touchKc1Sup,
			kc2_inf: touchKc2Inf,
			kc2_sup: touchKc2Sup,
		}
	}
	return out
}

/**
 * Per-band position walker — returns four parallel arrays.
 */
const walkPositions = (
	bricks: RawBrick[]
): {
	kc1: Position[]
	kc2: Position[]
} => {
	const kc1: Position[] = new Array(bricks.length)
	const kc2: Position[] = new Array(bricks.length)
	for (let i = 0; i < bricks.length; i++) {
		const b = bricks[i]!
		kc1[i] = classifyPosition(b.close, b.kc1_inf, b.kc1_sup)
		kc2[i] = classifyPosition(b.close, b.kc2_inf, b.kc2_sup)
	}
	return { kc1, kc2 }
}

const parseArgs = (): {
	fromDate: string | null
	toDate: string | null
	samples: number
	tfFilter: TfLabel | "all"
} => {
	const argv = process.argv.slice(2)
	let fromDate: string | null = null
	let toDate: string | null = null
	let samples = 5
	let tfFilter: TfLabel | "all" = "all"
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]!
		if (a === "--from") {
			fromDate = argv[++i] ?? null
		} else if (a === "--to") {
			toDate = argv[++i] ?? null
		} else if (a === "--samples") {
			samples = Number(argv[++i]) || 5
		} else if (a === "--tf") {
			const v = argv[++i]
			if (v === "5m" || v === "15m" || v === "60m") {
				tfFilter = v
			}
		}
	}
	return { fromDate, toDate, samples, tfFilter }
}

const fetchBricks = async (
	parquetPath: string,
	fromDate: string | null,
	toDate: string | null
): Promise<RawBrick[]> => {
	if (!existsSync(parquetPath)) {
		throw new Error(
			`parquet not found at ${parquetPath} — run materialize-hawks-timeframes.ts`
		)
	}
	const instance = await DuckDBInstance.create(":memory:")
	const conn = await instance.connect()
	const where: string[] = []
	if (fromDate) {
		where.push(`timestamp >= TIMESTAMP '${fromDate}T00:00:00.000Z'`)
	}
	if (toDate) {
		const next = new Date(`${toDate}T00:00:00.000Z`)
		next.setUTCDate(next.getUTCDate() + 1)
		where.push(`timestamp < TIMESTAMP '${next.toISOString()}'`)
	}
	const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""
	const reader = await conn.runAndReadAll(
		`SELECT timestamp, high, low, close, kc1_inf, kc1_sup, kc2_inf, kc2_sup
		 FROM read_parquet('${parquetPath.replace(/'/g, "''")}')
		 ${whereClause}
		 ORDER BY timestamp ASC`
	)
	const rows = reader.getRowObjects()
	return rows.map((row) => {
		const r = row as Record<string, unknown>
		return {
			timestamp: toIsoString(r.timestamp),
			high: toNumber(r.high),
			low: toNumber(r.low),
			close: toNumber(r.close),
			kc1_inf: toNumber(r.kc1_inf),
			kc1_sup: toNumber(r.kc1_sup),
			kc2_inf: toNumber(r.kc2_inf),
			kc2_sup: toNumber(r.kc2_sup),
		}
	})
}

const TR_ORDER: TouchRejectClass[] = [
	"NONE",
	"TOUCH_KC1_INF",
	"TOUCH_KC1_SUP",
	"TOUCH_KC2_INF",
	"TOUCH_KC2_SUP",
	"REJECT_KC1_INF_SAME_BRICK",
	"REJECT_KC1_SUP_SAME_BRICK",
	"REJECT_KC2_INF_SAME_BRICK",
	"REJECT_KC2_SUP_SAME_BRICK",
	"REJECT_KC1_INF_NEXT_BRICK",
	"REJECT_KC1_SUP_NEXT_BRICK",
	"REJECT_KC2_INF_NEXT_BRICK",
	"REJECT_KC2_SUP_NEXT_BRICK",
	"NO_DATA",
]

const POS_ORDER: Position[] = ["above", "inside", "below", "no_data"]

const runOneTf = async (
	tf: TfLabel,
	fromDate: string | null,
	toDate: string | null,
	samples: number
): Promise<void> => {
	const { parquet } = TF_CONFIG[tf]
	const bricks = await fetchBricks(parquet, fromDate, toDate)
	if (bricks.length === 0) {
		console.log(`\n═══ ${tf} — 0 bricks ═══\n  (no data in window)`)
		return
	}

	const trClasses = walkTouchReject(bricks)
	const { kc1: posKc1, kc2: posKc2 } = walkPositions(bricks)

	const trCounts: Record<TouchRejectClass, number> = {} as Record<
		TouchRejectClass,
		number
	>
	for (const c of TR_ORDER) {
		trCounts[c] = 0
	}
	const trSamples: Record<TouchRejectClass, string[]> = {} as Record<
		TouchRejectClass,
		string[]
	>
	for (const c of TR_ORDER) {
		trSamples[c] = []
	}
	const posKc1Counts: Record<Position, number> = {
		above: 0,
		inside: 0,
		below: 0,
		no_data: 0,
	}
	const posKc2Counts: Record<Position, number> = {
		above: 0,
		inside: 0,
		below: 0,
		no_data: 0,
	}

	for (let i = 0; i < bricks.length; i++) {
		const brick = bricks[i]!
		const cls = trClasses[i]!
		trCounts[cls]++
		if (
			cls !== "NONE" &&
			cls !== "NO_DATA" &&
			trSamples[cls].length < samples
		) {
			trSamples[cls].push(
				`${brick.timestamp}  h=${(brick.high ?? 0).toFixed(0).padStart(7)} l=${(brick.low ?? 0).toFixed(0).padStart(7)} c=${(brick.close ?? 0).toFixed(0).padStart(7)}  kc1=[${(brick.kc1_inf ?? 0).toFixed(0)}..${(brick.kc1_sup ?? 0).toFixed(0)}] kc2=[${(brick.kc2_inf ?? 0).toFixed(0)}..${(brick.kc2_sup ?? 0).toFixed(0)}]`
			)
		}
		posKc1Counts[posKc1[i]!]++
		posKc2Counts[posKc2[i]!]++
	}

	const total = bricks.length
	console.log(`\n═══ ${tf} — ${total} bricks ═══`)

	console.log("\n  Touch+Reject class distribution:")
	for (const c of TR_ORDER) {
		const n = trCounts[c]
		if (n === 0 && c !== "NONE") {
			continue
		}
		const pct = total > 0 ? ((n / total) * 100).toFixed(2) : "0.00"
		console.log(
			`    ${c.padEnd(30)}  ${String(n).padStart(7)}  (${pct.padStart(6)}%)`
		)
	}

	console.log("\n  Position vs KC1 (inner, 1.25x ATR):")
	for (const p of POS_ORDER) {
		const n = posKc1Counts[p]
		const pct = total > 0 ? ((n / total) * 100).toFixed(2) : "0.00"
		console.log(
			`    ${p.padEnd(10)}  ${String(n).padStart(7)}  (${pct.padStart(6)}%)`
		)
	}

	console.log("\n  Position vs KC2 (outer, 1.65x ATR):")
	for (const p of POS_ORDER) {
		const n = posKc2Counts[p]
		const pct = total > 0 ? ((n / total) * 100).toFixed(2) : "0.00"
		console.log(
			`    ${p.padEnd(10)}  ${String(n).padStart(7)}  (${pct.padStart(6)}%)`
		)
	}

	console.log("\n  Axion engine reads of any KC column:  0   (NOT WIRED)")
	console.log(
		"    See docs/hawks-strategy/indicator-isolation/group-c-keltner.md for the wiring gap."
	)

	console.log("\n  Sample timestamps per non-trivial class:")
	for (const c of TR_ORDER) {
		if (trSamples[c].length === 0) {
			continue
		}
		console.log(`\n  [${c}]`)
		for (const s of trSamples[c]) {
			console.log(`    ${s}`)
		}
	}
}

const main = async (): Promise<void> => {
	const { fromDate, toDate, samples, tfFilter } = parseArgs()
	const range =
		fromDate || toDate
			? `${fromDate ?? "(start)"}  →  ${toDate ?? "(end)"}`
			: "(full window)"
	console.log(`Indicator-isolation Group C — Keltner touch+reject wiring audit`)
	console.log(`Date range: ${range}`)

	const tfs: TfLabel[] = tfFilter === "all" ? ["5m", "15m", "60m"] : [tfFilter]
	for (const tf of tfs) {
		await runOneTf(tf, fromDate, toDate, samples)
	}
	process.exit(0)
}

void main()
