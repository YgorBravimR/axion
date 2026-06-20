/**
 * Indicator-isolation audit — Group A: Higher-TF Trend (15m + 60m).
 *
 * For every 5m brick in the audit window, computes BOTH:
 *   (a) The methodology-correct stateful BULL/BEAR state via a sticky walker
 *       that flips only when ALL 4 inequalities reverse (per Ygor's spec
 *       2026-06-13). Carries state across session boundaries.
 *   (b) Axion's current stateless `readHtfGate` output (above_both /
 *       below_both / mixed / unknown).
 *
 * Diffs the two per brick. Counts agreement / disagreement classes and prints
 * a summary so we can confirm Axion's EMA wiring is correct but missing the
 * stateful layer (the expected outcome), OR surface a real bug if the two
 * detectors disagree on a clean steady-state flip.
 *
 * Usage:
 *   pnpm tsx scripts/indicator-isolation/group-a-htf-gate.ts
 *   pnpm tsx scripts/indicator-isolation/group-a-htf-gate.ts --from 2026-03-02 --to 2026-03-13
 *   pnpm tsx scripts/indicator-isolation/group-a-htf-gate.ts --samples 20      # print sample timestamps per bucket
 *   pnpm tsx scripts/indicator-isolation/group-a-htf-gate.ts --tf 15m          # audit only the 15m timeframe
 */

import "dotenv/config"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { DuckDBInstance } from "@duckdb/node-api"

const PARQUET_PATH = resolve(
	process.cwd(),
	"data/parquet/candles/hawk_5m_win/WIN.parquet"
)

const BRT_OFFSET_MS = -3 * 60 * 60 * 1000
const toBrtDate = (ts: Date): string =>
	new Date(ts.getTime() + BRT_OFFSET_MS).toISOString().slice(0, 10)

interface RawBrick {
	timestamp: string
	brtDate: string
	prev_15m_open: number | null
	prev_15m_close: number | null
	mme27_15m: number | null
	mme55_15m: number | null
	prev_60m_open: number | null
	prev_60m_close: number | null
	mme27_60m: number | null
	mme55_60m: number | null
}

type MethodologyState = "BULL" | "BEAR" | "NO_SIGNAL"
type AxionState = "above_both" | "below_both" | "mixed" | "unknown"

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
 * Methodology-correct stateful walker. For one timeframe.
 * Flip rule: stay in current state until ALL 4 inequalities reverse.
 * Initial state: NO_SIGNAL until the first brick where all 4 align unambiguously.
 * Missing-data brick: carry previous state forward (no spurious flip).
 */
const walkMethodologyState = (
	bricks: RawBrick[],
	openKey: "prev_15m_open" | "prev_60m_open",
	closeKey: "prev_15m_close" | "prev_60m_close",
	ema27Key: "mme27_15m" | "mme27_60m",
	ema55Key: "mme55_15m" | "mme55_60m"
): MethodologyState[] => {
	const out: MethodologyState[] = new Array(bricks.length)
	let state: MethodologyState = "NO_SIGNAL"
	for (let i = 0; i < bricks.length; i++) {
		const b = bricks[i]!
		const open = b[openKey]
		const close = b[closeKey]
		const ema27 = b[ema27Key]
		const ema55 = b[ema55Key]
		if (open === null || close === null || ema27 === null || ema55 === null) {
			// Missing data: carry previous state forward (NO_SIGNAL stays NO_SIGNAL too).
			out[i] = state
			continue
		}
		const flipBull =
			open > ema27 && open > ema55 && close > ema27 && close > ema55
		const flipBear =
			open < ema27 && open < ema55 && close < ema27 && close < ema55
		if (state === "NO_SIGNAL") {
			if (flipBull) {
				state = "BULL"
			} else if (flipBear) {
				state = "BEAR"
			}
		} else if (state === "BEAR" && flipBull) {
			state = "BULL"
		} else if (state === "BULL" && flipBear) {
			state = "BEAR"
		}
		out[i] = state
	}
	return out
}

/**
 * Axion's current stateless reader, re-implemented here for the diff.
 * (Imports the live reader would also work, but we copy the logic so the
 * audit doesn't depend on the engine module's evolving signature.)
 */
const axionStatelessRead = (
	brick: RawBrick,
	openKey: "prev_15m_open" | "prev_60m_open",
	closeKey: "prev_15m_close" | "prev_60m_close",
	ema27Key: "mme27_15m" | "mme27_60m",
	ema55Key: "mme55_15m" | "mme55_60m"
): AxionState => {
	const open = brick[openKey]
	const close = brick[closeKey]
	const ema27 = brick[ema27Key]
	const ema55 = brick[ema55Key]
	if (open === null || close === null || ema27 === null || ema55 === null) {
		return "unknown"
	}
	const aboveBoth =
		open > ema27 && open > ema55 && close > ema27 && close > ema55
	const belowBoth =
		open < ema27 && open < ema55 && close < ema27 && close < ema55
	if (aboveBoth) {
		return "above_both"
	}
	if (belowBoth) {
		return "below_both"
	}
	return "mixed"
}

type DiffBucket =
	| "AGREE_BULL"
	| "AGREE_BEAR"
	| "DISAGREE_TRANSITION"
	| "DISAGREE_FLIP"
	| "AXION_UNKNOWN"
	| "BOTH_PRESEEDED"

const classify = (m: MethodologyState, a: AxionState): DiffBucket => {
	if (a === "unknown") {
		return "AXION_UNKNOWN"
	}
	if (m === "NO_SIGNAL") {
		return "BOTH_PRESEEDED"
	}
	if (m === "BULL" && a === "above_both") {
		return "AGREE_BULL"
	}
	if (m === "BEAR" && a === "below_both") {
		return "AGREE_BEAR"
	}
	if (m === "BULL" && a === "below_both") {
		return "DISAGREE_FLIP"
	}
	if (m === "BEAR" && a === "above_both") {
		return "DISAGREE_FLIP"
	}
	// Methodology has a state, axion says "mixed" — the expected disagreement.
	return "DISAGREE_TRANSITION"
}

const parseArgs = (): {
	fromDate: string | null
	toDate: string | null
	samples: number
	tfFilter: "15m" | "60m" | "both"
} => {
	const argv = process.argv.slice(2)
	let fromDate: string | null = null
	let toDate: string | null = null
	let samples = 5
	let tfFilter: "15m" | "60m" | "both" = "both"
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
			if (v === "15m" || v === "60m") {
				tfFilter = v
			}
		}
	}
	return { fromDate, toDate, samples, tfFilter }
}

const fetchBricks = async (
	fromDate: string | null,
	toDate: string | null
): Promise<RawBrick[]> => {
	if (!existsSync(PARQUET_PATH)) {
		throw new Error(
			`parquet not found at ${PARQUET_PATH} — run materialize-hawks-timeframes.ts`
		)
	}
	const instance = await DuckDBInstance.create(":memory:")
	const conn = await instance.connect()
	const where: string[] = []
	if (fromDate) {
		where.push(`timestamp >= TIMESTAMP '${fromDate}T00:00:00.000Z'`)
	}
	if (toDate) {
		// Inclusive end-of-day: shift to next-day 00:00.
		const next = new Date(`${toDate}T00:00:00.000Z`)
		next.setUTCDate(next.getUTCDate() + 1)
		where.push(`timestamp < TIMESTAMP '${next.toISOString()}'`)
	}
	const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""
	const reader = await conn.runAndReadAll(
		`SELECT timestamp,
		        prev_15m_open, prev_15m_close, mme27_15m, mme55_15m,
		        prev_60m_open, prev_60m_close, mme27_60m, mme55_60m
		 FROM read_parquet('${PARQUET_PATH.replace(/'/g, "''")}')
		 ${whereClause}
		 ORDER BY timestamp ASC`
	)
	const rows = reader.getRowObjects()
	return rows.map((row) => {
		const ts = toIsoString(row.timestamp)
		return {
			timestamp: ts,
			brtDate: toBrtDate(new Date(ts)),
			prev_15m_open: toNumber(row.prev_15m_open),
			prev_15m_close: toNumber(row.prev_15m_close),
			mme27_15m: toNumber(row.mme27_15m),
			mme55_15m: toNumber(row.mme55_15m),
			prev_60m_open: toNumber(row.prev_60m_open),
			prev_60m_close: toNumber(row.prev_60m_close),
			mme27_60m: toNumber(row.mme27_60m),
			mme55_60m: toNumber(row.mme55_60m),
		}
	})
}

const runOneTf = (
	bricks: RawBrick[],
	label: "15m" | "60m",
	samples: number
): void => {
	const tfKeys =
		label === "15m"
			? {
					openKey: "prev_15m_open" as const,
					closeKey: "prev_15m_close" as const,
					ema27Key: "mme27_15m" as const,
					ema55Key: "mme55_15m" as const,
				}
			: {
					openKey: "prev_60m_open" as const,
					closeKey: "prev_60m_close" as const,
					ema27Key: "mme27_60m" as const,
					ema55Key: "mme55_60m" as const,
				}

	const methodology = walkMethodologyState(
		bricks,
		tfKeys.openKey,
		tfKeys.closeKey,
		tfKeys.ema27Key,
		tfKeys.ema55Key
	)
	const counts: Record<DiffBucket, number> = {
		AGREE_BULL: 0,
		AGREE_BEAR: 0,
		DISAGREE_TRANSITION: 0,
		DISAGREE_FLIP: 0,
		AXION_UNKNOWN: 0,
		BOTH_PRESEEDED: 0,
	}
	const samplesByBucket: Record<DiffBucket, string[]> = {
		AGREE_BULL: [],
		AGREE_BEAR: [],
		DISAGREE_TRANSITION: [],
		DISAGREE_FLIP: [],
		AXION_UNKNOWN: [],
		BOTH_PRESEEDED: [],
	}

	for (let i = 0; i < bricks.length; i++) {
		const brick = bricks[i]!
		const axion = axionStatelessRead(
			brick,
			tfKeys.openKey,
			tfKeys.closeKey,
			tfKeys.ema27Key,
			tfKeys.ema55Key
		)
		const m = methodology[i]!
		const bucket = classify(m, axion)
		counts[bucket]++
		if (samplesByBucket[bucket].length < samples) {
			samplesByBucket[bucket].push(
				`${brick.timestamp}  m=${m.padEnd(9)}  axion=${axion}`
			)
		}
	}

	const total = bricks.length
	console.log(`\n═══ ${label} — ${total} bricks ═══`)
	const order: DiffBucket[] = [
		"AGREE_BULL",
		"AGREE_BEAR",
		"DISAGREE_TRANSITION",
		"DISAGREE_FLIP",
		"AXION_UNKNOWN",
		"BOTH_PRESEEDED",
	]
	for (const b of order) {
		const n = counts[b]
		const pct = total > 0 ? ((n / total) * 100).toFixed(1) : "0.0"
		console.log(
			`  ${b.padEnd(22)}  ${String(n).padStart(7)}  (${pct.padStart(5)}%)`
		)
	}

	// Flip counter (transitions in either series — useful for sanity check).
	let methodFlips = 0
	let axionFlips = 0
	for (let i = 1; i < bricks.length; i++) {
		const mPrev = methodology[i - 1]!
		const mCurr = methodology[i]!
		if (mPrev !== mCurr && mPrev !== "NO_SIGNAL" && mCurr !== "NO_SIGNAL") {
			methodFlips++
		}
		const aPrev = axionStatelessRead(
			bricks[i - 1]!,
			tfKeys.openKey,
			tfKeys.closeKey,
			tfKeys.ema27Key,
			tfKeys.ema55Key
		)
		const aCurr = axionStatelessRead(
			bricks[i]!,
			tfKeys.openKey,
			tfKeys.closeKey,
			tfKeys.ema27Key,
			tfKeys.ema55Key
		)
		// Count axion as "flipping" each time it transitions to or away from mixed/unknown too.
		if (aPrev !== aCurr) {
			axionFlips++
		}
	}
	console.log(`\n  State transitions:`)
	console.log(
		`    Methodology  ${String(methodFlips).padStart(5)}  (sticky walker)`
	)
	console.log(
		`    Axion        ${String(axionFlips).padStart(5)}  (stateless — counts every flicker)`
	)

	console.log(`\n  Sample timestamps per bucket:`)
	for (const b of order) {
		if (counts[b] === 0) {
			continue
		}
		console.log(`\n  [${b}]`)
		for (const sample of samplesByBucket[b]) {
			console.log(`    ${sample}`)
		}
	}
}

const run = async (): Promise<void> => {
	const { fromDate, toDate, samples, tfFilter } = parseArgs()
	console.log(
		`Group A audit — fetching bricks ${fromDate ?? "<all>"} → ${toDate ?? "<all>"}`
	)
	const bricks = await fetchBricks(fromDate, toDate)
	console.log(`Loaded ${bricks.length} bricks`)
	if (bricks.length === 0) {
		console.error("No bricks in window — exiting.")
		process.exit(1)
	}
	console.log(
		`First: ${bricks[0]!.timestamp} (${bricks[0]!.brtDate})  ` +
			`Last: ${bricks[bricks.length - 1]!.timestamp} (${bricks[bricks.length - 1]!.brtDate})`
	)

	if (tfFilter === "15m" || tfFilter === "both") {
		runOneTf(bricks, "15m", samples)
	}
	if (tfFilter === "60m" || tfFilter === "both") {
		runOneTf(bricks, "60m", samples)
	}
}

run()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err)
		process.exit(1)
	})
