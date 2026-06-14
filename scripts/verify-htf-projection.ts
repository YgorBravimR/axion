/**
 * verify-htf-projection.ts
 *
 * Audits the materializer's HTF projections (`mme27_15m`, `mme55_15m`,
 * `mme27_60m`, `mme55_60m`) onto `hawk_5m_win` against the source 15m / 60m
 * Renko parquets.
 *
 * The materializer's `project()` uses `findFloorIndex(source, target.ts - 1)`
 * which picks the most-recently-closed source brick strictly BEFORE the
 * target 5m brick. If a 5m brick shares its timestamp with the close of a
 * source brick (common at simultaneous brick-breakouts), this skips the
 * just-closed source brick — the 5m row reports the PRIOR source EMA, not
 * the freshly-closed one.
 *
 * This script measures the delta. For every 5m brick whose timestamp
 * matches a 15m / 60m brick close, it compares:
 *   - projected ema27_15m (from hawk_5m_win)
 *   - native ema27 of the 15m brick that just closed
 * Reports: count, mean abs delta, max abs delta, sample of worst rows.
 *
 * Usage:
 *   pnpm tsx scripts/verify-htf-projection.ts
 */

import "dotenv/config"
import { resolve } from "node:path"
import { existsSync } from "node:fs"
import { DuckDBInstance } from "@duckdb/node-api"

const PARQUET_BASE = resolve(process.cwd(), "data/parquet/candles")
const HAWK_5M = resolve(PARQUET_BASE, "hawk_5m_win/WIN.parquet")
const HAWK_15M = resolve(PARQUET_BASE, "hawk_15m_win/WIN.parquet")
const HAWK_60M = resolve(PARQUET_BASE, "hawk_60m_win/WIN.parquet")

interface Row {
	timestamp: Date
	close: number
	mme27_15m: number | null
	mme55_15m: number | null
	mme27_60m: number | null
	mme55_60m: number | null
	ema27: number | null
	ema55: number | null
}

const tsFromDuck = (v: unknown): Date => {
	if (v instanceof Date) {
		return v
	}
	if (typeof v === "string") {
		return new Date(v)
	}
	if (v !== null && typeof v === "object" && "micros" in v) {
		return new Date(Number((v as { micros: number | bigint }).micros) / 1000)
	}
	throw new Error(`bad ts: ${String(v)}`)
}

const numOrNull = (v: unknown): number | null => {
	if (v === null || v === undefined) {
		return null
	}
	if (typeof v === "number") {
		return v
	}
	if (typeof v === "bigint") {
		return Number(v)
	}
	if (typeof v === "object" && "value" in v && "scale" in v) {
		const { value, scale } = v as { value: number | bigint; scale: number }
		return Number(value) / Math.pow(10, scale)
	}
	return null
}

const main = async () => {
	for (const p of [HAWK_5M, HAWK_15M, HAWK_60M]) {
		if (!existsSync(p)) {
			console.error(`Missing parquet: ${p}`)
			process.exit(1)
		}
	}

	const instance = await DuckDBInstance.create(":memory:")
	const conn = await instance.connect()

	console.log("Loading hawk_5m_win, hawk_15m_win, hawk_60m_win…")
	const load = async (path: string): Promise<Row[]> => {
		const reader = await conn.runAndReadAll(
			`SELECT * FROM read_parquet('${path.replace(/'/g, "''")}') ORDER BY timestamp ASC`
		)
		const rows = reader.getRowObjects()
		return rows.map((r) => ({
			timestamp: tsFromDuck(r.timestamp),
			close: numOrNull(r.close) ?? 0,
			mme27_15m: numOrNull(r.mme27_15m),
			mme55_15m: numOrNull(r.mme55_15m),
			mme27_60m: numOrNull(r.mme27_60m),
			mme55_60m: numOrNull(r.mme55_60m),
			ema27: numOrNull(r.ema27),
			ema55: numOrNull(r.ema55),
		}))
	}
	const rows5 = await load(HAWK_5M)
	const rows15 = await load(HAWK_15M)
	const rows60 = await load(HAWK_60M)
	console.log(
		`Loaded 5m=${rows5.length} / 15m=${rows15.length} / 60m=${rows60.length}`
	)

	// Build lookup of source-brick ema by timestamp.
	const tsKey = (d: Date): number => d.getTime()
	const map15 = new Map<number, Row>()
	for (const r of rows15) {
		map15.set(tsKey(r.timestamp), r)
	}
	const map60 = new Map<number, Row>()
	for (const r of rows60) {
		map60.set(tsKey(r.timestamp), r)
	}

	const audit = (
		label: string,
		sourceMap: Map<number, Row>,
		projKey: "mme27_15m" | "mme27_60m" | "mme55_15m" | "mme55_60m",
		nativeKey: "ema27" | "ema55"
	) => {
		let coincident = 0
		let mismatches = 0
		let sumAbs = 0
		let maxAbs = 0
		const worst: Array<{
			ts: string
			projected: number | null
			native: number | null
			delta: number
		}> = []
		for (const r5 of rows5) {
			const src = sourceMap.get(tsKey(r5.timestamp))
			if (!src) {
				continue
			}
			coincident++
			const proj = r5[projKey]
			const native = src[nativeKey]
			if (proj === null || native === null) {
				continue
			}
			const delta = Math.abs(proj - native)
			if (delta > 0.5) {
				mismatches++
				sumAbs += delta
				if (delta > maxAbs) {
					maxAbs = delta
				}
				worst.push({
					ts: r5.timestamp.toISOString(),
					projected: proj,
					native,
					delta: proj - native,
				})
			}
		}
		worst.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
		console.log(`\n── ${label} ─────────────────────────────`)
		console.log(`  Coincident 5m↔source bricks (same timestamp): ${coincident}`)
		console.log(`  Mismatches (|delta| > 0.5pt): ${mismatches} / ${coincident}`)
		if (mismatches > 0) {
			console.log(`  Mean |delta|: ${(sumAbs / mismatches).toFixed(2)} pt`)
			console.log(`  Max |delta|:  ${maxAbs.toFixed(2)} pt`)
			console.log("  Worst 5:")
			for (const w of worst.slice(0, 5)) {
				console.log(
					`    ${w.ts}  projected=${w.projected?.toFixed(2)}  native=${w.native?.toFixed(2)}  Δ=${w.delta.toFixed(2)}`
				)
			}
		}
	}

	audit("15m ema27", map15, "mme27_15m", "ema27")
	audit("15m ema55", map15, "mme55_15m", "ema55")
	audit("60m ema27", map60, "mme27_60m", "ema27")
	audit("60m ema55", map60, "mme55_60m", "ema55")

	process.exit(0)
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
