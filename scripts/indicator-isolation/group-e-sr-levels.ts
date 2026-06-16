/**
 * Indicator-isolation audit — Group E: S/R horizontal levels (proximity block + favor).
 *
 * For each 5m brick we compute per direction (SHORT and LONG candidate at the
 * brick's close):
 *
 *   block_any_within_buffer  — at least one level is "ahead" within
 *                              srBlockBufferBricks bricks (default 2 = 200 pts)
 *   nearest_ahead_level      — which level (mme27_60m / mme55_60m /
 *                              mme27_15m / mme55_15m / vwap_d / ajuste)
 *   nearest_ahead_distance   — distance in brick-bodies (1 brick = 100 pts)
 *   favor_count              — number of levels "behind" the trade within
 *                              srFavorRangeBricks (default 3 = 300 pts)
 *
 * Direction semantics (entry price P at brick close):
 *   SHORT: level BELOW entry blocks (acts as floor). Level ABOVE entry favors.
 *   LONG:  level ABOVE entry blocks (acts as ceiling). Level BELOW entry favors.
 *
 * Distance = |P - L| / brickSize5mPoints. Negative or zero distance counts as
 * "at the level" → block.
 *
 * Output:
 *   - Aggregate block rate per direction (% of bricks).
 *   - "Which level led the block" frequency.
 *   - favor_count distribution.
 *   - Per-direction sample timestamps.
 *
 * NOTE: This audit consumes only the per-brick parquet plus the
 * `asset_session_anchors` table for `ajuste`. No engine call, no walker — pure
 * methodology classifier so we can grade Axion's dead-flag state.
 *
 * Usage:
 *   pnpm tsx scripts/indicator-isolation/group-e-sr-levels.ts
 *   pnpm tsx scripts/indicator-isolation/group-e-sr-levels.ts --from 2026-03-02 --to 2026-06-13
 *   pnpm tsx scripts/indicator-isolation/group-e-sr-levels.ts --buffer 2 --favor 3
 *   pnpm tsx scripts/indicator-isolation/group-e-sr-levels.ts --samples 10
 *   pnpm tsx scripts/indicator-isolation/group-e-sr-levels.ts --include-wm
 */

import "dotenv/config"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { DuckDBInstance } from "@duckdb/node-api"
import postgres from "postgres"

const WIN_ASSET_ID = "2d922fa1-365a-4f17-990f-27e5aa96b659"

type Direction = "short" | "long"

type LevelKey =
	| "mme27_60m"
	| "mme55_60m"
	| "mme27_15m"
	| "mme55_15m"
	| "vwap_d"
	| "ajuste"
	| "vwap_w"
	| "vwap_m"

const PARQUET_5M = resolve(
	process.cwd(),
	"data/parquet/candles/hawk_5m_win/WIN.parquet"
)
const BRT_OFFSET_MS = -3 * 60 * 60 * 1000

interface RawBrick {
	timestamp: string
	close: number | null
	mme27_60m: number | null
	mme55_60m: number | null
	mme27_15m: number | null
	mme55_15m: number | null
	vwap_d: number | null
	vwap_w: number | null
	vwap_m: number | null
	ajuste: number | null
}

interface ProximityResult {
	blocked: boolean
	nearestAhead: { level: LevelKey; distanceBricks: number } | null
	favorCount: number
}

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

const candleTimestampToBrtDate = (ts: Date): string => {
	const brt = new Date(ts.getTime() + BRT_OFFSET_MS)
	return brt.toISOString().slice(0, 10)
}

const classifyProximity = (
	close: number,
	levels: Array<{ level: LevelKey; value: number | null }>,
	direction: Direction,
	bufferBricks: number,
	favorRangeBricks: number,
	brickSize: number
): ProximityResult => {
	let nearestAhead: { level: LevelKey; distanceBricks: number } | null = null
	let favorCount = 0
	const bufferPts = bufferBricks * brickSize
	const favorPts = favorRangeBricks * brickSize

	for (const { level, value } of levels) {
		if (value === null) {
			continue
		}

		const aheadDistancePts =
			direction === "short" ? close - value : value - close
		const behindDistancePts =
			direction === "short" ? value - close : close - value

		if (aheadDistancePts >= 0 && aheadDistancePts <= bufferPts) {
			const distanceBricks = aheadDistancePts / brickSize
			if (
				nearestAhead === null ||
				distanceBricks < nearestAhead.distanceBricks
			) {
				nearestAhead = { level, distanceBricks }
			}
		}
		if (behindDistancePts > 0 && behindDistancePts <= favorPts) {
			favorCount++
		}
	}

	return {
		blocked: nearestAhead !== null,
		nearestAhead,
		favorCount,
	}
}

const parseArgs = (): {
	fromDate: string | null
	toDate: string | null
	samples: number
	bufferBricks: number
	favorRangeBricks: number
	includeWm: boolean
	brickSize: number
} => {
	const argv = process.argv.slice(2)
	let fromDate: string | null = null
	let toDate: string | null = null
	let samples = 5
	let bufferBricks = 2
	let favorRangeBricks = 3
	let includeWm = false
	let brickSize = 100

	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]!
		if (a === "--from") {
			fromDate = argv[++i] ?? null
		} else if (a === "--to") {
			toDate = argv[++i] ?? null
		} else if (a === "--samples") {
			samples = Number(argv[++i]) || 5
		} else if (a === "--buffer") {
			bufferBricks = Number(argv[++i]) || 2
		} else if (a === "--favor") {
			favorRangeBricks = Number(argv[++i]) || 3
		} else if (a === "--include-wm") {
			includeWm = true
		} else if (a === "--brick-size") {
			brickSize = Number(argv[++i]) || 100
		}
	}
	return {
		fromDate,
		toDate,
		samples,
		bufferBricks,
		favorRangeBricks,
		includeWm,
		brickSize,
	}
}

const fetchBricks = async (
	fromDate: string | null,
	toDate: string | null
): Promise<RawBrick[]> => {
	if (!existsSync(PARQUET_5M)) {
		throw new Error(
			`parquet not found at ${PARQUET_5M} — run materialize-hawks-timeframes.ts`
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
		`SELECT timestamp, close, mme27_60m, mme55_60m, mme27_15m, mme55_15m,
		        vwap_d, vwap_w, vwap_m
		 FROM read_parquet('${PARQUET_5M.replace(/'/g, "''")}')
		 ${whereClause}
		 ORDER BY timestamp ASC`
	)
	const rows = reader.getRowObjects()
	return rows.map((row) => {
		const r = row as Record<string, unknown>
		return {
			timestamp: toIsoString(r.timestamp),
			close: toNumber(r.close),
			mme27_60m: toNumber(r.mme27_60m),
			mme55_60m: toNumber(r.mme55_60m),
			mme27_15m: toNumber(r.mme27_15m),
			mme55_15m: toNumber(r.mme55_15m),
			vwap_d: toNumber(r.vwap_d),
			vwap_w: toNumber(r.vwap_w),
			vwap_m: toNumber(r.vwap_m),
			ajuste: null, // injected from anchors table below
		}
	})
}

const fetchAjusteByDate = async (
	fromDate: string | null,
	toDate: string | null
): Promise<Map<string, number>> => {
	const dbUrl = process.env.DATABASE_URL
	if (!dbUrl) {
		console.log("  (DATABASE_URL not set — ajuste will be null for all bricks)")
		return new Map()
	}
	const sql = postgres(dbUrl, { max: 1 })
	try {
		const from = fromDate ?? "2024-01-01"
		const to = toDate ?? "2099-12-31"
		const rows = (await sql`
			SELECT date::text AS date, payload
			FROM asset_session_anchors
			WHERE asset_id = ${WIN_ASSET_ID}
			  AND date BETWEEN ${from} AND ${to}
		`) as { date: string; payload: Record<string, unknown> | null }[]

		const map = new Map<string, number>()
		for (const r of rows) {
			const v = r.payload?.ajuste
			if (typeof v === "number") {
				map.set(r.date, v)
			}
		}
		return map
	} finally {
		await sql.end()
	}
}

const LEVEL_KEYS_BASE: LevelKey[] = [
	"mme27_60m",
	"mme55_60m",
	"mme27_15m",
	"mme55_15m",
	"vwap_d",
	"ajuste",
]

const main = async (): Promise<void> => {
	const {
		fromDate,
		toDate,
		samples,
		bufferBricks,
		favorRangeBricks,
		includeWm,
		brickSize,
	} = parseArgs()

	const range =
		fromDate || toDate
			? `${fromDate ?? "(start)"}  →  ${toDate ?? "(end)"}`
			: "(full window)"
	const levelKeys: LevelKey[] = includeWm
		? [...LEVEL_KEYS_BASE, "vwap_w", "vwap_m"]
		: LEVEL_KEYS_BASE

	console.log(`Indicator-isolation Group E — S/R level proximity audit`)
	console.log(`Date range: ${range}`)
	console.log(
		`Block buffer = ${bufferBricks} bricks (${bufferBricks * brickSize} pts)`
	)
	console.log(
		`Favor range  = ${favorRangeBricks} bricks (${favorRangeBricks * brickSize} pts)`
	)
	console.log(`Brick size   = ${brickSize} pts/brick`)
	console.log(`Levels       = ${levelKeys.join(", ")}`)

	const bricks = await fetchBricks(fromDate, toDate)
	console.log(`Bricks       = ${bricks.length}`)

	// Inject ajuste per BRT date.
	const ajusteByDate = await fetchAjusteByDate(fromDate, toDate)
	console.log(`Ajuste dates loaded = ${ajusteByDate.size}`)
	for (const b of bricks) {
		const d = candleTimestampToBrtDate(new Date(b.timestamp))
		const aj = ajusteByDate.get(d)
		if (aj !== undefined) {
			b.ajuste = aj
		}
	}

	const total = bricks.length
	if (total === 0) {
		console.log("(no data in window)")
		process.exit(0)
	}

	const directions: Direction[] = ["short", "long"]
	for (const dir of directions) {
		let blocked = 0
		let noData = 0
		const ledByLevel: Record<LevelKey, number> = {
			mme27_60m: 0,
			mme55_60m: 0,
			mme27_15m: 0,
			mme55_15m: 0,
			vwap_d: 0,
			ajuste: 0,
			vwap_w: 0,
			vwap_m: 0,
		}
		const favorDist: Map<number, number> = new Map()
		const blockedSamples: string[] = []
		const favorSamples: string[] = []

		for (const b of bricks) {
			if (b.close === null) {
				noData++
				continue
			}
			const levels = levelKeys.map((k) => ({ level: k, value: b[k] }))
			const result = classifyProximity(
				b.close,
				levels,
				dir,
				bufferBricks,
				favorRangeBricks,
				brickSize
			)
			if (result.blocked) {
				blocked++
				if (result.nearestAhead) {
					ledByLevel[result.nearestAhead.level]++
				}
				if (blockedSamples.length < samples && result.nearestAhead) {
					blockedSamples.push(
						`${b.timestamp}  close=${b.close.toFixed(0).padStart(7)}  blocked by ${result.nearestAhead.level} at -${result.nearestAhead.distanceBricks.toFixed(2)} bricks  favor=${result.favorCount}`
					)
				}
			}
			favorDist.set(
				result.favorCount,
				(favorDist.get(result.favorCount) ?? 0) + 1
			)
			if (result.favorCount >= 3 && favorSamples.length < samples) {
				favorSamples.push(
					`${b.timestamp}  close=${b.close.toFixed(0).padStart(7)}  favor=${result.favorCount}`
				)
			}
		}

		const pct = (n: number) =>
			total > 0 ? ((n / total) * 100).toFixed(2) : "0.00"
		console.log(`\n══ ${dir.toUpperCase()} candidate proximity ══`)
		console.log(
			`  Blocked            ${String(blocked).padStart(7)}  (${pct(blocked).padStart(6)}%)`
		)
		console.log(
			`  Free               ${String(total - blocked - noData).padStart(7)}  (${pct(total - blocked - noData).padStart(6)}%)`
		)
		console.log(
			`  NO_DATA            ${String(noData).padStart(7)}  (${pct(noData).padStart(6)}%)`
		)

		console.log("\n  Block led by level:")
		const ledOrder: LevelKey[] = [...levelKeys].sort(
			(a, b) => ledByLevel[b] - ledByLevel[a]
		)
		for (const k of ledOrder) {
			const n = ledByLevel[k]
			if (n === 0) {
				continue
			}
			const pctOfBlock = blocked > 0 ? ((n / blocked) * 100).toFixed(2) : "0.00"
			console.log(
				`    ${k.padEnd(12)}  ${String(n).padStart(7)}  (${pctOfBlock.padStart(6)}% of blocks, ${pct(n).padStart(6)}% of all bricks)`
			)
		}

		console.log("\n  Favor count distribution (levels behind within range):")
		const favorKeys = [...favorDist.keys()].sort((a, b) => a - b)
		for (const k of favorKeys) {
			const n = favorDist.get(k) ?? 0
			console.log(
				`    favor=${k}            ${String(n).padStart(7)}  (${pct(n).padStart(6)}%)`
			)
		}

		console.log("\n  Sample blocked timestamps:")
		for (const s of blockedSamples) {
			console.log(`    ${s}`)
		}

		if (favorSamples.length > 0) {
			console.log("\n  Sample high-favor (≥3) timestamps:")
			for (const s of favorSamples) {
				console.log(`    ${s}`)
			}
		}
	}

	console.log("\nAxion engine surface for these levels:")
	console.log(
		"  qualityGates.srLevelBlock / srLevelFavor — flags exist in EntryQualityGates but NO engine module reads them."
	)
	console.log(
		"  qualityGates.htfMaBlock                  — legacy alias (4 HTF MAs only), also unread."
	)
	console.log(
		"  UI:   src/components/hawks/hawks-quality-controls.tsx renders the toggles → dead UI."
	)
	console.log(
		"  Bundle: src/lib/backtest/presets/hawks-quality-presets.ts `strict` opt-in sets these true → still no consumer."
	)
	console.log(
		"  Data: levels are present in the 5m parquet (mme*, vwap_d). ajuste comes from asset_session_anchors."
	)
	console.log(
		"  See docs/hawks-strategy/indicator-isolation/group-e-sr-levels.md for the wiring gap + open questions."
	)

	process.exit(0)
}

void main()
