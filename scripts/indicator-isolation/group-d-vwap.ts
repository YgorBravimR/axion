/**
 * Indicator-isolation audit — Group D: VWAP (Touch + Reject + Position).
 *
 * For each Hawks timeframe (5m, 15m, 60m) and each VWAP source (vwap_d,
 * vwap_w, vwap_m) we compute:
 *
 *   (a) Methodology-correct position class per brick (above / at / below).
 *   (b) Methodology-correct wick touch+reject walker per source, emitting
 *       per-brick events of class:
 *         NONE
 *         TOUCH_FROM_ABOVE             (wick touched VWAP, no reject yet)
 *         TOUCH_FROM_BELOW
 *         REJECT_FROM_ABOVE_SAME_BRICK (touched + close back above)
 *         REJECT_FROM_BELOW_SAME_BRICK
 *         REJECT_FROM_ABOVE_NEXT_BRICK (prior touched, this brick closed back above)
 *         REJECT_FROM_BELOW_NEXT_BRICK
 *         CROSS                        (close changed side, no touch+reject pattern)
 *         NO_DATA
 *   (c) Axion's current `vwap_rejection` playbook trigger
 *       (close-based dip-and-recover; vwap_d only — re-implemented here).
 *
 * Diff between (b) wick touch+reject and (c) close-based axion playbook tells
 * us how many real touch+reject signals the current playbook is missing, AND
 * how many of its fires don't map to a touch+reject pattern.
 *
 * "From above" = brick was clearly above VWAP at t-1 (sticky-state walker),
 * wicked DOWN to touch VWAP at t. Mirror for "from below". The sticky walker
 * holds the prior side through `at` ambiguities.
 *
 * AJUSTE is intentionally NOT covered by this audit script: the parquet
 * doesn't carry the column (it's injected from asset_session_anchors at fetch
 * time on prod runs). See docs/hawks-strategy/indicator-isolation/group-d-vwap.md.
 *
 * Source columns per timeframe (all three TFs use the same names):
 *   5m   data/parquet/candles/hawk_5m_win/WIN.parquet   vwap_d, vwap_w, vwap_m
 *   15m  data/parquet/candles/hawk_15m_win/WIN.parquet  same
 *   60m  data/parquet/candles/hawk_60m_win/WIN.parquet  same
 *
 * Usage:
 *   pnpm tsx scripts/indicator-isolation/group-d-vwap.ts
 *   pnpm tsx scripts/indicator-isolation/group-d-vwap.ts --from 2026-03-02 --to 2026-03-13
 *   pnpm tsx scripts/indicator-isolation/group-d-vwap.ts --samples 20
 *   pnpm tsx scripts/indicator-isolation/group-d-vwap.ts --tf 60m --source vwap_w
 */

import "dotenv/config"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { DuckDBInstance } from "@duckdb/node-api"

type TfLabel = "5m" | "15m" | "60m"
type VwapSource = "vwap_d" | "vwap_w" | "vwap_m"

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
	open: number | null
	high: number | null
	low: number | null
	close: number | null
	vwap_d: number | null
	vwap_w: number | null
	vwap_m: number | null
}

type Position = "above" | "at" | "below" | "no_data"
type StickySide = "above" | "below" | "unknown"

type TouchRejectClass =
	| "NONE"
	| "TOUCH_FROM_ABOVE"
	| "TOUCH_FROM_BELOW"
	| "REJECT_FROM_ABOVE_SAME_BRICK"
	| "REJECT_FROM_BELOW_SAME_BRICK"
	| "REJECT_FROM_ABOVE_NEXT_BRICK"
	| "REJECT_FROM_BELOW_NEXT_BRICK"
	| "CROSS"
	| "NO_DATA"

type AxionTrigger = "NONE" | "AXION_REJECT_LONG" | "AXION_REJECT_SHORT"

type DiffBucket =
	| "AGREE_REJECT_LONG"
	| "AGREE_REJECT_SHORT"
	| "METHODOLOGY_ONLY_FROM_BELOW"
	| "METHODOLOGY_ONLY_FROM_ABOVE"
	| "AXION_ONLY_LONG"
	| "AXION_ONLY_SHORT"
	| "BOTH_NONE"
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

const positionForVwap = (
	close: number | null,
	vwap: number | null
): Position => {
	if (close === null || vwap === null) {
		return "no_data"
	}
	if (close > vwap) {
		return "above"
	}
	if (close < vwap) {
		return "below"
	}
	return "at"
}

/**
 * Wick touch+reject walker for ONE VWAP source. Sticky-side memory: the
 * walker remembers the last unambiguous side (above/below) the close was on.
 *
 * Class semantics:
 *   REJECT_FROM_ABOVE_SAME_BRICK = sticky=above at t-1, low<=vwap at t (wick
 *     crossed down), close>vwap at t (came back). Clean same-brick reject.
 *   REJECT_FROM_ABOVE_NEXT_BRICK = at t-1 the brick CROSSed (wicked through
 *     and close ended below vwap with sticky=above before), at t close>vwap
 *     (came back). Asymmetric N+1 reject.
 *   TOUCH_FROM_ABOVE = (rare degenerate) wick crossed AND close exactly == vwap.
 *   CROSS = the close changed sides this brick — either with wick contact
 *     (which the next brick may turn into a NEXT_BRICK reject) or without.
 *
 * Mirror for "from below".
 */
const walkTouchReject = (
	bricks: RawBrick[],
	source: VwapSource
): TouchRejectClass[] => {
	const out: TouchRejectClass[] = new Array(bricks.length)
	let sticky: StickySide = "unknown"
	// Remember the *prior* sticky (the side the brick was on at t-1) when this
	// brick crossed. That's the side a NEXT_BRICK reject must close back to.
	let priorCrossSide: StickySide = "unknown"

	for (let i = 0; i < bricks.length; i++) {
		const b = bricks[i]!
		const vwap = b[source]
		if (
			b.high === null ||
			b.low === null ||
			b.close === null ||
			vwap === null
		) {
			out[i] = "NO_DATA"
			priorCrossSide = "unknown"
			continue
		}

		const wickedDown = b.low <= vwap
		const wickedUp = b.high >= vwap

		let cls: TouchRejectClass = "NONE"

		// 1) Next-brick rejects (consume prior cross memory first).
		if (priorCrossSide === "above" && b.close > vwap) {
			cls = "REJECT_FROM_ABOVE_NEXT_BRICK"
		} else if (priorCrossSide === "below" && b.close < vwap) {
			cls = "REJECT_FROM_BELOW_NEXT_BRICK"
		}

		// 2) Same-brick touch+reject.
		if (cls === "NONE" && sticky === "above" && wickedDown && b.close > vwap) {
			cls = "REJECT_FROM_ABOVE_SAME_BRICK"
		} else if (
			cls === "NONE" &&
			sticky === "below" &&
			wickedUp &&
			b.close < vwap
		) {
			cls = "REJECT_FROM_BELOW_SAME_BRICK"
		}

		// 3) Touch with close exactly on the band (degenerate but real on rounded prices).
		if (
			cls === "NONE" &&
			sticky === "above" &&
			wickedDown &&
			b.close === vwap
		) {
			cls = "TOUCH_FROM_ABOVE"
		} else if (
			cls === "NONE" &&
			sticky === "below" &&
			wickedUp &&
			b.close === vwap
		) {
			cls = "TOUCH_FROM_BELOW"
		}

		// 4) Cross — the close switched sides (with or without wick contact).
		if (cls === "NONE" && sticky === "above" && b.close < vwap) {
			cls = "CROSS"
		} else if (cls === "NONE" && sticky === "below" && b.close > vwap) {
			cls = "CROSS"
		}

		out[i] = cls

		// Update prior-cross memory: if THIS brick was a CROSS, remember the side
		// it came FROM (= prior sticky) so the NEXT brick can confirm a reject.
		if (cls === "CROSS") {
			priorCrossSide = sticky
		} else {
			priorCrossSide = "unknown"
		}

		// Update sticky side from close.
		if (b.close > vwap) {
			sticky = "above"
		} else if (b.close < vwap) {
			sticky = "below"
		}
		// b.close === vwap: hold prior sticky.
	}

	return out
}

/**
 * Re-implementation of `src/lib/backtest/modules/entry/playbooks/vwap-rejection.ts`
 * trigger logic, vwap_d only. Emits per-brick whether the playbook would fire.
 * Approximates the playbook — we don't have the engine's gate/direction
 * context here, so we evaluate BOTH directions independently and emit whichever
 * (or neither) triggers.
 */
const N_LOOKBACK = 5

const walkAxionPlaybook = (bricks: RawBrick[]): AxionTrigger[] => {
	const out: AxionTrigger[] = new Array(bricks.length)
	for (let i = 0; i < bricks.length; i++) {
		const b = bricks[i]!
		const vwap = b.vwap_d
		if (b.open === null || b.close === null || vwap === null || i < 1) {
			out[i] = "NONE"
			continue
		}
		const lookbackStart = Math.max(0, i - N_LOOKBACK)
		const lookback = bricks.slice(lookbackStart, i)
		const isBullishBrick = b.close > b.open
		const isBearishBrick = b.close < b.open

		// LONG: prior dip-below + current bullish pierce-from-below.
		const longDip = lookback.some((p) => {
			return p.close !== null && p.vwap_d !== null && p.close < p.vwap_d
		})
		const longFires =
			longDip && isBullishBrick && b.close > vwap && b.open <= vwap

		// SHORT: prior dip-above + current bearish pierce-from-above.
		const shortDip = lookback.some((p) => {
			return p.close !== null && p.vwap_d !== null && p.close > p.vwap_d
		})
		const shortFires =
			shortDip && isBearishBrick && b.close < vwap && b.open >= vwap

		if (longFires) {
			out[i] = "AXION_REJECT_LONG"
		} else if (shortFires) {
			out[i] = "AXION_REJECT_SHORT"
		} else {
			out[i] = "NONE"
		}
	}
	return out
}

const classifyDiff = (m: TouchRejectClass, a: AxionTrigger): DiffBucket => {
	if (m === "NO_DATA") {
		return "NO_DATA"
	}
	const methodReject =
		m === "REJECT_FROM_ABOVE_SAME_BRICK" ||
		m === "REJECT_FROM_ABOVE_NEXT_BRICK" ||
		m === "REJECT_FROM_BELOW_SAME_BRICK" ||
		m === "REJECT_FROM_BELOW_NEXT_BRICK"

	if (a === "AXION_REJECT_LONG") {
		if (
			m === "REJECT_FROM_BELOW_SAME_BRICK" ||
			m === "REJECT_FROM_BELOW_NEXT_BRICK"
		) {
			return "AGREE_REJECT_LONG"
		}
		return "AXION_ONLY_LONG"
	}
	if (a === "AXION_REJECT_SHORT") {
		if (
			m === "REJECT_FROM_ABOVE_SAME_BRICK" ||
			m === "REJECT_FROM_ABOVE_NEXT_BRICK"
		) {
			return "AGREE_REJECT_SHORT"
		}
		return "AXION_ONLY_SHORT"
	}
	if (methodReject) {
		if (
			m === "REJECT_FROM_ABOVE_SAME_BRICK" ||
			m === "REJECT_FROM_ABOVE_NEXT_BRICK"
		) {
			return "METHODOLOGY_ONLY_FROM_ABOVE"
		}
		return "METHODOLOGY_ONLY_FROM_BELOW"
	}
	return "BOTH_NONE"
}

const parseArgs = (): {
	fromDate: string | null
	toDate: string | null
	samples: number
	tfFilter: TfLabel | "all"
	sourceFilter: VwapSource | "all"
} => {
	const argv = process.argv.slice(2)
	let fromDate: string | null = null
	let toDate: string | null = null
	let samples = 5
	let tfFilter: TfLabel | "all" = "all"
	let sourceFilter: VwapSource | "all" = "all"
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
		} else if (a === "--source") {
			const v = argv[++i]
			if (v === "vwap_d" || v === "vwap_w" || v === "vwap_m") {
				sourceFilter = v
			}
		}
	}
	return { fromDate, toDate, samples, tfFilter, sourceFilter }
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
		`SELECT timestamp, open, high, low, close, vwap_d, vwap_w, vwap_m
		 FROM read_parquet('${parquetPath.replace(/'/g, "''")}')
		 ${whereClause}
		 ORDER BY timestamp ASC`
	)
	const rows = reader.getRowObjects()
	return rows.map((row) => {
		const r = row as Record<string, unknown>
		return {
			timestamp: toIsoString(r.timestamp),
			open: toNumber(r.open),
			high: toNumber(r.high),
			low: toNumber(r.low),
			close: toNumber(r.close),
			vwap_d: toNumber(r.vwap_d),
			vwap_w: toNumber(r.vwap_w),
			vwap_m: toNumber(r.vwap_m),
		}
	})
}

const TR_ORDER: TouchRejectClass[] = [
	"NONE",
	"TOUCH_FROM_ABOVE",
	"TOUCH_FROM_BELOW",
	"REJECT_FROM_ABOVE_SAME_BRICK",
	"REJECT_FROM_BELOW_SAME_BRICK",
	"REJECT_FROM_ABOVE_NEXT_BRICK",
	"REJECT_FROM_BELOW_NEXT_BRICK",
	"CROSS",
	"NO_DATA",
]

const POS_ORDER: Position[] = ["above", "at", "below", "no_data"]

const DIFF_ORDER: DiffBucket[] = [
	"AGREE_REJECT_LONG",
	"AGREE_REJECT_SHORT",
	"METHODOLOGY_ONLY_FROM_ABOVE",
	"METHODOLOGY_ONLY_FROM_BELOW",
	"AXION_ONLY_LONG",
	"AXION_ONLY_SHORT",
	"BOTH_NONE",
	"NO_DATA",
]

const runOneTf = async (
	tf: TfLabel,
	sources: VwapSource[],
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

	const total = bricks.length
	console.log(`\n═══ ${tf} — ${total} bricks ═══`)

	const axionTriggers = walkAxionPlaybook(bricks)

	for (const source of sources) {
		const trClasses = walkTouchReject(bricks, source)
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
		const posCounts: Record<Position, number> = {
			above: 0,
			at: 0,
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
					`${brick.timestamp}  h=${(brick.high ?? 0).toFixed(0).padStart(7)} l=${(brick.low ?? 0).toFixed(0).padStart(7)} c=${(brick.close ?? 0).toFixed(0).padStart(7)}  ${source}=${(brick[source] ?? 0).toFixed(2).padStart(10)}`
				)
			}
			posCounts[positionForVwap(brick.close, brick[source])]++
		}

		console.log(`\n  ── ${source} ──`)
		console.log("  Touch+Reject class distribution:")
		for (const c of TR_ORDER) {
			const n = trCounts[c]
			if (n === 0 && c !== "NONE") {
				continue
			}
			const pct = total > 0 ? ((n / total) * 100).toFixed(2) : "0.00"
			console.log(
				`    ${c.padEnd(32)}  ${String(n).padStart(7)}  (${pct.padStart(6)}%)`
			)
		}

		console.log("\n  Position vs VWAP:")
		for (const p of POS_ORDER) {
			const n = posCounts[p]
			const pct = total > 0 ? ((n / total) * 100).toFixed(2) : "0.00"
			console.log(
				`    ${p.padEnd(10)}  ${String(n).padStart(7)}  (${pct.padStart(6)}%)`
			)
		}

		// Diff against axion playbook — only meaningful for vwap_d.
		if (source === "vwap_d") {
			const diffCounts: Record<DiffBucket, number> = {} as Record<
				DiffBucket,
				number
			>
			for (const d of DIFF_ORDER) {
				diffCounts[d] = 0
			}
			const diffSamples: Record<DiffBucket, string[]> = {} as Record<
				DiffBucket,
				string[]
			>
			for (const d of DIFF_ORDER) {
				diffSamples[d] = []
			}
			for (let i = 0; i < bricks.length; i++) {
				const m = trClasses[i]!
				const ax = axionTriggers[i]!
				const bucket = classifyDiff(m, ax)
				diffCounts[bucket]++
				if (
					bucket !== "BOTH_NONE" &&
					bucket !== "NO_DATA" &&
					diffSamples[bucket].length < samples
				) {
					const brick = bricks[i]!
					diffSamples[bucket].push(
						`${brick.timestamp}  m=${m.padEnd(30)}  axion=${ax}`
					)
				}
			}

			console.log(
				"\n  Diff (methodology touch+reject  vs  axion vwap_rejection playbook):"
			)
			for (const d of DIFF_ORDER) {
				const n = diffCounts[d]
				if (n === 0 && d !== "BOTH_NONE") {
					continue
				}
				const pct = total > 0 ? ((n / total) * 100).toFixed(2) : "0.00"
				console.log(
					`    ${d.padEnd(32)}  ${String(n).padStart(7)}  (${pct.padStart(6)}%)`
				)
			}

			for (const d of DIFF_ORDER) {
				if (
					d === "BOTH_NONE" ||
					d === "NO_DATA" ||
					diffSamples[d].length === 0
				) {
					continue
				}
				console.log(`\n  [${d}]`)
				for (const s of diffSamples[d]) {
					console.log(`    ${s}`)
				}
			}
		}

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

	console.log("\n  Axion engine surface for VWAP:")
	console.log(
		"    vwap_d  →  vwap_rejection playbook (close-based dip-and-recover; differs from methodology touch+reject)"
	)
	console.log(
		"    vwap_w  →  HawksIndicatorSnapshot.vwapW (read, contributes to dead `favorableCount` only)"
	)
	console.log(
		"    vwap_m  →  HawksIndicatorSnapshot.vwapM (read, contributes to dead `favorableCount` only)"
	)
	console.log(
		"    ajuste  →  NO parquet column; injected from asset_session_anchors at fetch time on prod runs"
	)
	console.log(
		"    See docs/hawks-strategy/indicator-isolation/group-d-vwap.md for the wiring gap."
	)
}

const main = async (): Promise<void> => {
	const { fromDate, toDate, samples, tfFilter, sourceFilter } = parseArgs()
	const range =
		fromDate || toDate
			? `${fromDate ?? "(start)"}  →  ${toDate ?? "(end)"}`
			: "(full window)"
	console.log(`Indicator-isolation Group D — VWAP touch+reject wiring audit`)
	console.log(`Date range: ${range}`)

	const tfs: TfLabel[] = tfFilter === "all" ? ["5m", "15m", "60m"] : [tfFilter]
	const sources: VwapSource[] =
		sourceFilter === "all" ? ["vwap_d", "vwap_w", "vwap_m"] : [sourceFilter]
	for (const tf of tfs) {
		await runOneTf(tf, sources, fromDate, toDate, samples)
	}
	process.exit(0)
}

void main()
