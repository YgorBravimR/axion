/**
 * materialize-hawks-timeframes.ts
 *
 * Materializes the three engine-facing Hawks timeframes:
 *   - Hawk_5m_win   (code: `hawk_5m_win`)
 *   - Hawk_15m_win  (code: `hawk_15m_win`)
 *   - Hawk_60m_win  (code: `hawk_60m_win`)
 *
 * Each row in `Hawk_<role>_win` is a copy of a row from the corresponding
 * `R<n>` source timeframe, chosen so the brick size in use for a given week
 * matches that week's role assignment in `hawks_renko_sizes`. The materializer
 * also bakes cross-timeframe projections (most-recent-closed sibling brick
 * OHLC + EMA27/55) into each row's JSONB under the legacy key names
 * (`mme27_15m`, `prev_15m_open`, etc.) so existing engine code keeps working.
 *
 * Re-runnable. Idempotent: wipes price_candles for the three Hawk_<role>_win
 * timeframes, then rebuilds. Source `R<n>` candles untouched.
 *
 * Usage:
 *   pnpm tsx scripts/materialize-hawks-timeframes.ts
 *   pnpm tsx scripts/materialize-hawks-timeframes.ts --strict
 *   pnpm tsx scripts/materialize-hawks-timeframes.ts --allow-partial
 *
 * Default behavior (2026-06-13+): **skip any week where ANY of the three
 * required R-sources (5m / 15m / 60m) is missing on disk.** Writing a partial
 * week (e.g. 5m present, 60m absent) produces materialized rows with NULL
 * `prev_60m_*` + `mme27_60m` + `mme55_60m` projections — which the Hawks
 * engine reads as "indicator missing" and silently disables the 60m HTF
 * gate. That silent-null cascade is the bug Group A's indicator-isolation
 * audit surfaced (84% of weeks affected). Per Ygor's 2026-06-13 statement
 * ("the only exported are the ones from hawks weekly; I will not export
 * renko sizes not in there"), incomplete weeks are out-of-scope and should
 * be skipped, not partial-materialized.
 *
 * `--strict` additionally throws at the end if any required R-source CSV is
 * missing — use in CI / pre-deploy checks.
 *
 * `--allow-partial` restores the pre-2026-06-13 behavior (write whatever
 * slices exist, even if a sibling TF is unavailable). Useful only for
 * debugging the silent-null cascade itself; do not use for production runs.
 */

import "dotenv/config"
import { resolve as resolvePath } from "node:path"
import { existsSync } from "node:fs"
import postgres from "postgres"
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api"
import { writeCandleParquet } from "@/lib/candle-store/parquet-writer"

const LOCAL_PARQUET_BASE = resolvePath(process.cwd(), "data/parquet/candles")

const ASSET_SYMBOL = "WIN"
const ADMIN_EMAIL = "admin@bravo.com"

const HAWK_TFS = [
	{ role: "5m" as const, code: "hawk_5m_win", name: "Hawk 5m WIN" },
	{ role: "15m" as const, code: "hawk_15m_win", name: "Hawk 15m WIN" },
	{ role: "60m" as const, code: "hawk_60m_win", name: "Hawk 60m WIN" },
]

interface RawCandle {
	timestamp: Date
	open: number
	high: number
	low: number
	close: number
	candle_index: number | null
	indicators: Record<string, number>
}

// Largest index ≤ target. Returns -1 when target precedes all rows.
const findFloorIndex = (rows: RawCandle[], targetMs: number): number => {
	let lo = 0
	let hi = rows.length - 1
	let result = -1
	while (lo <= hi) {
		const mid = (lo + hi) >>> 1
		if (rows[mid]!.timestamp.getTime() <= targetMs) {
			result = mid
			lo = mid + 1
		} else {
			hi = mid - 1
		}
	}
	return result
}

interface WeekRow {
	effective_date: string // YYYY-MM-DD (Monday)
	size_5m: number
	size_15m: number
	size_60m: number
}

const BASE_COLS = new Set([
	"timestamp",
	"open",
	"high",
	"low",
	"close",
	"candle_index",
])

const tsFromDuck = (v: unknown): Date => {
	if (v instanceof Date) {
		return v
	}
	if (typeof v === "string") {
		return new Date(v)
	}
	if (typeof v === "bigint") {
		return new Date(Number(v) / 1000)
	}
	if (v !== null && typeof v === "object" && "micros" in v) {
		const micros = (v as { micros: number | bigint }).micros
		return new Date(Number(micros) / 1000)
	}
	throw new Error(`unparseable timestamp: ${String(v)}`)
}

const numericFromDuck = (v: unknown): number => {
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
	return NaN
}

const loadAllSourceCandlesFromParquet = async (
	conn: DuckDBConnection,
	sizes: number[]
): Promise<Map<number, RawCandle[]>> => {
	const out = new Map<number, RawCandle[]>()
	for (const size of sizes) {
		const path = resolvePath(
			LOCAL_PARQUET_BASE,
			`R${size}`,
			`${ASSET_SYMBOL}.parquet`
		)
		if (!existsSync(path)) {
			console.warn(`  ⚠️  R${size}: no parquet at ${path}, skipping`)
			continue
		}
		const reader = await conn.runAndReadAll(
			`SELECT * FROM read_parquet('${path.replace(/'/g, "''")}') ORDER BY timestamp ASC`
		)
		const rows = reader.getRowObjects()
		const normalized: RawCandle[] = rows.map((row) => {
			const indicators: Record<string, number> = {}
			for (const [k, v] of Object.entries(row)) {
				if (BASE_COLS.has(k)) {
					continue
				}
				if (v === null || v === undefined) {
					continue
				}
				const n = numericFromDuck(v)
				if (!Number.isNaN(n)) {
					indicators[k] = n
				}
			}
			return {
				timestamp: tsFromDuck(row.timestamp),
				open: numericFromDuck(row.open),
				high: numericFromDuck(row.high),
				low: numericFromDuck(row.low),
				close: numericFromDuck(row.close),
				candle_index:
					row.candle_index === null || row.candle_index === undefined
						? null
						: numericFromDuck(row.candle_index),
				indicators,
			}
		})
		out.set(size, normalized)
	}
	return out
}

// Inclusive start, exclusive end. UTC.
const weekRange = (
	mondayKey: string,
	nextMondayKey: string | null
): { start: Date; end: Date } => {
	const [y, m, d] = mondayKey.split("-").map(Number)
	const start = new Date(Date.UTC(y!, m! - 1, d!))
	const end = nextMondayKey
		? (() => {
				const [yy, mm, dd] = nextMondayKey.split("-").map(Number)
				return new Date(Date.UTC(yy!, mm! - 1, dd!))
			})()
		: new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000)
	return { start, end }
}

const project = (
	target: RawCandle,
	source: RawCandle[] | undefined,
	openKey: string,
	closeKey: string,
	ema27Key: string,
	ema55Key: string
): boolean => {
	if (!source || source.length === 0) {
		return false
	}
	const idx = findFloorIndex(source, target.timestamp.getTime() - 1)
	if (idx < 0) {
		return false
	}
	const src = source[idx]!
	target.indicators[openKey] = src.open
	target.indicators[closeKey] = src.close
	if (typeof src.indicators.ema27 === "number") {
		target.indicators[ema27Key] = src.indicators.ema27
	}
	if (typeof src.indicators.ema55 === "number") {
		target.indicators[ema55Key] = src.indicators.ema55
	}
	return true
}

const run = async () => {
	const databaseUrl = process.env.DATABASE_URL
	if (!databaseUrl) {
		console.error("DATABASE_URL missing")
		process.exit(1)
	}
	const strict = process.argv.includes("--strict")
	const allowPartial = process.argv.includes("--allow-partial")
	// Use postgres-js over TCP. The neon-http driver in @neondatabase/serverless
	// has aggressive read timeouts that abort on the 50K+-row SELECT we need
	// to load all R<n> source candles in one pass.
	const sql = postgres(databaseUrl, { max: 4, idle_timeout: 30 })

	const assets = (await sql`
		SELECT id FROM assets WHERE symbol = ${ASSET_SYMBOL} LIMIT 1
	`) as { id: string }[]
	const assetId = assets[0]?.id
	if (!assetId) {
		throw new Error(`Asset ${ASSET_SYMBOL} not found`)
	}

	// ─── Seed the 3 Hawks timeframes ──────────────────────────────────────
	const hawkTfIdByRole = new Map<"5m" | "15m" | "60m", string>()
	for (const tf of HAWK_TFS) {
		const [{ id }] = (await sql`
			INSERT INTO timeframes (code, name, type, value, unit, sort_order, is_active)
			VALUES (${tf.code}, ${tf.name}, 'renko', 0, 'points', 0, true)
			ON CONFLICT (code) DO UPDATE SET
				name = EXCLUDED.name,
				type = EXCLUDED.type,
				is_active = true
			RETURNING id
		`) as Array<{ id: string }>
		hawkTfIdByRole.set(tf.role, id)
	}
	console.log(`Seeded ${HAWK_TFS.length} Hawk_<role>_win timeframe(s)`)

	// Wire accounts to the new timeframes so the UI dropdowns find them.
	const accounts = (await sql`
		SELECT ta.id FROM trading_accounts ta
		JOIN users u ON u.id = ta.user_id
		WHERE u.email = ${ADMIN_EMAIL}
	`) as { id: string }[]
	for (const acc of accounts) {
		for (const tfId of hawkTfIdByRole.values()) {
			await sql`
				INSERT INTO account_timeframes (account_id, timeframe_id, is_enabled)
				VALUES (${acc.id}, ${tfId}, true)
				ON CONFLICT (account_id, timeframe_id) DO NOTHING
			`
		}
	}

	// ─── Resolve R<n> timeframe IDs ───────────────────────────────────────
	const rTfRows = (await sql`
		SELECT id, code FROM timeframes
		WHERE code ~ '^R[0-9]+$' AND is_active = true
	`) as Array<{ id: string; code: string }>
	const sizeToTfId = new Map<number, string>()
	for (const r of rTfRows) {
		const n = Number(r.code.slice(1))
		if (Number.isFinite(n)) {
			sizeToTfId.set(n, r.id)
		}
	}
	if (sizeToTfId.size === 0) {
		throw new Error(
			"No R<n> timeframes found. Run load-hawks-bricks-by-size.ts first."
		)
	}
	console.log(`Discovered ${sizeToTfId.size} R<n> source timeframe(s)`)

	// ─── Load weekly triples ──────────────────────────────────────────────
	const weeks = (await sql`
		SELECT effective_date::text AS effective_date,
		       size_5m, size_15m, size_60m
		FROM hawks_renko_sizes
		ORDER BY effective_date ASC
	`) as WeekRow[]
	if (weeks.length === 0) {
		throw new Error("hawks_renko_sizes is empty")
	}
	console.log(`Loaded ${weeks.length} weekly triple(s)`)

	// ─── Load ALL R<n> candles from local Parquet (DuckDB) ────────────────
	const duckInstance = await DuckDBInstance.create(":memory:")
	const duckConn = await duckInstance.connect()
	const candlesBySize = await loadAllSourceCandlesFromParquet(duckConn, [
		...sizeToTfId.keys(),
	])
	const totalSourceRows = [...candlesBySize.values()].reduce(
		(acc, rows) => acc + rows.length,
		0
	)
	console.log(
		`Loaded ${totalSourceRows} source rows across all R<n> Parquet files`
	)

	// ─── Walk weeks, build materialized rows ──────────────────────────────
	const materialized = new Map<"5m" | "15m" | "60m", RawCandle[]>([
		["5m", []],
		["15m", []],
		["60m", []],
	])
	const missingSizes = new Set<number>()
	let weekSkippedNoData = 0
	let weekSkippedIncomplete = 0

	for (let i = 0; i < weeks.length; i++) {
		const w = weeks[i]!
		const nextW = weeks[i + 1]
		const { start, end } = weekRange(
			w.effective_date,
			nextW?.effective_date ?? null
		)
		const startMs = start.getTime()
		const endMs = end.getTime()

		const r5 = candlesBySize.get(w.size_5m)
		const r15 = candlesBySize.get(w.size_15m)
		const r60 = candlesBySize.get(w.size_60m)
		if (!r5) {
			missingSizes.add(w.size_5m)
		}
		if (!r15) {
			missingSizes.add(w.size_15m)
		}
		if (!r60) {
			missingSizes.add(w.size_60m)
		}

		// Default: skip weeks with ANY missing R-source so the Hawks engine
		// never reads partial rows with silent-NULL HTF projections. Pass
		// --allow-partial to restore the legacy behavior (pre-2026-06-13).
		if (!allowPartial && (!r5 || !r15 || !r60)) {
			weekSkippedIncomplete++
			continue
		}

		const sliceForWeek = (rows: RawCandle[] | undefined): RawCandle[] => {
			if (!rows) {
				return []
			}
			// Binary-search both ends to avoid O(n) per week.
			let lo = 0
			let hi = rows.length - 1
			let first = rows.length
			while (lo <= hi) {
				const mid = (lo + hi) >>> 1
				if (rows[mid]!.timestamp.getTime() >= startMs) {
					first = mid
					hi = mid - 1
				} else {
					lo = mid + 1
				}
			}
			lo = first
			hi = rows.length - 1
			let last = first - 1
			while (lo <= hi) {
				const mid = (lo + hi) >>> 1
				if (rows[mid]!.timestamp.getTime() < endMs) {
					last = mid
					lo = mid + 1
				} else {
					hi = mid - 1
				}
			}
			return rows.slice(first, last + 1)
		}

		const slice5 = sliceForWeek(r5)
		const slice15 = sliceForWeek(r15)
		const slice60 = sliceForWeek(r60)

		if (slice5.length + slice15.length + slice60.length === 0) {
			weekSkippedNoData++
			continue
		}

		// Project + push into materialized buckets.
		for (const row of slice5) {
			const copy: RawCandle = {
				timestamp: row.timestamp,
				open: row.open,
				high: row.high,
				low: row.low,
				close: row.close,
				candle_index: row.candle_index,
				indicators: { ...row.indicators },
			}
			project(
				copy,
				r15,
				"prev_15m_open",
				"prev_15m_close",
				"mme27_15m",
				"mme55_15m"
			)
			project(
				copy,
				r60,
				"prev_60m_open",
				"prev_60m_close",
				"mme27_60m",
				"mme55_60m"
			)
			materialized.get("5m")!.push(copy)
		}
		for (const row of slice15) {
			const copy: RawCandle = {
				timestamp: row.timestamp,
				open: row.open,
				high: row.high,
				low: row.low,
				close: row.close,
				candle_index: row.candle_index,
				indicators: { ...row.indicators },
			}
			project(
				copy,
				r60,
				"prev_60m_open",
				"prev_60m_close",
				"mme27_60m",
				"mme55_60m"
			)
			materialized.get("15m")!.push(copy)
		}
		for (const row of slice60) {
			const copy: RawCandle = {
				timestamp: row.timestamp,
				open: row.open,
				high: row.high,
				low: row.low,
				close: row.close,
				candle_index: row.candle_index,
				indicators: { ...row.indicators },
			}
			project(
				copy,
				r15,
				"prev_15m_open",
				"prev_15m_close",
				"mme27_15m",
				"mme55_15m"
			)
			materialized.get("60m")!.push(copy)
		}
	}

	if (weekSkippedNoData > 0) {
		console.log(
			`  ${weekSkippedNoData} week(s) skipped (no source candles in range)`
		)
	}
	if (weekSkippedIncomplete > 0) {
		console.log(
			`  ${weekSkippedIncomplete} week(s) skipped (incomplete: ≥1 of 5m/15m/60m R-source missing on disk)`
		)
	}
	if (missingSizes.size > 0) {
		console.warn(
			`⚠️  Brick sizes referenced by weeks but missing source CSV: ${[...missingSizes].sort((a, b) => a - b).join(", ")}`
		)
	}

	// ─── Write materialized rows to Parquet (local + R2) ──────────────────
	let totalInserted = 0
	for (const tf of HAWK_TFS) {
		const tfId = hawkTfIdByRole.get(tf.role)!
		const rows = materialized.get(tf.role) ?? []
		if (rows.length === 0) {
			continue
		}

		// Union of indicator keys across this materialized timeframe.
		const indicatorKeysSet = new Set<string>()
		for (const r of rows) {
			for (const k of Object.keys(r.indicators)) {
				indicatorKeysSet.add(k)
			}
		}
		const indicatorKeys = [...indicatorKeysSet].sort()

		const result = await writeCandleParquet({
			timeframeCode: tf.code,
			assetSymbol: ASSET_SYMBOL,
			indicatorKeys,
			rows: rows.map((r) => ({
				timestamp: r.timestamp,
				open: r.open,
				high: r.high,
				low: r.low,
				close: r.close,
				candleIndex: r.candle_index,
				indicators: r.indicators,
			})),
		})

		let firstAt: Date | null = null
		let lastAt: Date | null = null
		for (const r of rows) {
			if (!firstAt || r.timestamp < firstAt) {
				firstAt = r.timestamp
			}
			if (!lastAt || r.timestamp > lastAt) {
				lastAt = r.timestamp
			}
		}
		await sql`
			INSERT INTO price_data_versions (asset_id, timeframe_id, version, row_count, last_imported_at, first_candle_at, last_candle_at, updated_at)
			VALUES (${assetId}, ${tfId}, 1, ${result.rowCount}, NOW(), ${firstAt ?? null}, ${lastAt ?? null}, NOW())
			ON CONFLICT (asset_id, timeframe_id) DO UPDATE SET
				version = price_data_versions.version + 1,
				row_count = EXCLUDED.row_count,
				last_imported_at = EXCLUDED.last_imported_at,
				first_candle_at = EXCLUDED.first_candle_at,
				last_candle_at = EXCLUDED.last_candle_at,
				updated_at = EXCLUDED.updated_at
		`

		totalInserted += result.rowCount
		console.log(
			`  ${tf.code}: ${result.rowCount} rows → ${(result.bytes / 1024).toFixed(1)} KB (${result.r2Key})`
		)
	}

	console.log("")
	console.log("=== MATERIALIZE SUMMARY ===")
	console.log(`Hawk timeframes:    ${HAWK_TFS.length}`)
	console.log(
		`Weeks processed:    ${weeks.length - weekSkippedNoData - weekSkippedIncomplete}`
	)
	console.log(`Weeks skipped:      ${weekSkippedNoData} (no source candles)`)
	console.log(
		`Weeks incomplete:   ${weekSkippedIncomplete} (≥1 of 5m/15m/60m R-source missing)`
	)
	console.log(`Candles written:    ${totalInserted}`)
	if (missingSizes.size > 0) {
		console.log(
			`⚠️  Missing brick-size source(s): ${[...missingSizes].sort((a, b) => a - b).join(", ")}`
		)
	}

	await sql.end()

	if (strict && missingSizes.size > 0) {
		throw new Error(
			`--strict: ${missingSizes.size} brick-size source CSV(s) missing — ${[
				...missingSizes,
			]
				.sort((a, b) => a - b)
				.map((s) => `R${s}`)
				.join(
					", "
				)}. Load via scripts/load-hawks-bricks-by-size.ts after exporting from ProfitChart.`
		)
	}
}

run().catch((err) => {
	console.error(err)
	process.exit(1)
})
