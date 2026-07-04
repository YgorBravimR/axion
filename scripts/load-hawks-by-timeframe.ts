/**
 * load-hawks-by-timeframe.ts
 *
 * Per-timeframe Hawks candle loader (2026-06-23 model). ProfitChart now
 * exports three already-rolled, contract-rebased Renko streams — one per
 * engine timeframe — instead of one CSV per Renko brick size:
 *
 *   ${HAWKS_TIMEFRAME_DIR}/5m.csv   → hawk_5m_win
 *   ${HAWKS_TIMEFRAME_DIR}/15m.csv  → hawk_15m_win
 *   ${HAWKS_TIMEFRAME_DIR}/60m.csv  → hawk_60m_win
 *
 * Default `HAWKS_TIMEFRAME_DIR`:
 *   /Users/ygorbravim/Library/CloudStorage/GoogleDrive-ygorbravimr@gmail.com/My Drive/win/WIN_FUT
 *
 * Why this replaces `load-hawks-bricks-by-size.ts` + `materialize-hawks-timeframes.ts`:
 *
 *   - The old pipeline ingested ~25 `R<n>.csv` files, then a materializer walked
 *     `hawks_renko_sizes` (weekly role → R<n> map) to slice each week from the
 *     right R-source. That stitched-together stream straddled contract
 *     rollovers within each R<n>, producing price drift at the seams (a week
 *     on WINJ26 followed by a week on WINM26 in the same R30 file).
 *   - The new exports already encode the weekly role assignment AND rebase
 *     prices across contracts — every row in `5m.csv` belongs to the active
 *     5m brick for that week and sits on a continuous price axis. No
 *     materialization step needed.
 *
 * What this script does (single pass):
 *   1. Ensure `hawk_5m_win` / `hawk_15m_win` / `hawk_60m_win` timeframes exist
 *      and admin's accounts are wired to all three.
 *   2. Parse each CSV into memory. Every non-date / non-OHLC column lands in
 *      the indicator JSONB verbatim (`ema9`/`ema17`/.../`ifr25`/`brick`).
 *   3. Bake cross-timeframe projections per the materializer's contract:
 *        - 5m rows: `prev_15m_open/close` + `mme27_15m`/`mme55_15m`
 *                   `prev_60m_open/close` + `mme27_60m`/`mme55_60m`
 *        - 15m rows: `prev_60m_open/close` + `mme27_60m`/`mme55_60m`
 *        - 60m rows: `prev_15m_open/close` + `mme27_15m`/`mme55_15m`
 *      Floor-index by timestamp; source brick close ≤ target brick close.
 *   4. Write parquet to `data/parquet/candles/hawk_<role>_win/WIN.parquet`
 *      and upload to R2 via `writeCandleParquet`.
 *   5. Upsert `price_data_versions` so the dataset catalog picks up the rows.
 *   6. Extract per-BRT-date `ajuste` / `ajuste_adj` (first non-zero wins
 *      across all three CSVs) → `asset_session_anchors`.
 *
 * The legacy `load-hawks-bricks-by-size.ts` + `materialize-hawks-timeframes.ts`
 * are kept for archival/debug; they are not part of the production ingest
 * path anymore.
 *
 * Usage:
 *   pnpm tsx scripts/load-hawks-by-timeframe.ts
 *   HAWKS_TIMEFRAME_DIR=/some/path pnpm tsx scripts/load-hawks-by-timeframe.ts
 */

import "dotenv/config"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { neon } from "@neondatabase/serverless"
import postgres from "postgres"
import { isNeonUrl } from "@/db/url"
import { writeCandleParquet } from "@/lib/candle-store/parquet-writer"

const ADMIN_EMAIL = "admin@bravo.com"
const ASSET_SYMBOL = "WIN"

const DEFAULT_SOURCE_DIR =
	"/Users/ygorbravim/Library/CloudStorage/GoogleDrive-ygorbravimr@gmail.com/My Drive/win/WIN_FUT"
const SOURCE_DIR = process.env.HAWKS_TIMEFRAME_DIR ?? DEFAULT_SOURCE_DIR

type Role = "5m" | "15m" | "60m"

const TIMEFRAMES: { role: Role; code: string; name: string; file: string }[] = [
	{ role: "5m", code: "hawk_5m_win", name: "Hawk 5m WIN", file: "5m.csv" },
	{ role: "15m", code: "hawk_15m_win", name: "Hawk 15m WIN", file: "15m.csv" },
	{ role: "60m", code: "hawk_60m_win", name: "Hawk 60m WIN", file: "60m.csv" },
]

// Column index → indicator key. Anything in this map is persisted verbatim
// into the parquet indicator columns. Columns NOT in this map (datetime,
// date, time, OHLC, ajuste/ajuste_adj, contrato) are either positional
// (OHLC) or routed elsewhere (anchors).
const INDICATOR_COLS: { col: number; key: string }[] = [
	{ col: 7, key: "ema9" },
	{ col: 8, key: "ema17" },
	{ col: 9, key: "ema27" },
	{ col: 10, key: "ema44" },
	{ col: 11, key: "ema55" },
	{ col: 12, key: "ema200" },
	{ col: 13, key: "kc1_sup" },
	{ col: 14, key: "kc1_inf" },
	{ col: 15, key: "kc2_sup" },
	{ col: 16, key: "kc2_inf" },
	{ col: 17, key: "tbd1" },
	{ col: 18, key: "tbd2" },
	{ col: 19, key: "tbd3" },
	{ col: 21, key: "vwap_d" },
	{ col: 22, key: "vwap_w" },
	{ col: 23, key: "vwap_m" },
	// 24 ajuste, 25 ajuste_adj → anchors
	{ col: 26, key: "macd1_linha" },
	{ col: 27, key: "macd1_histo" },
	{ col: 28, key: "macd1_sinal" },
	{ col: 29, key: "macd2_linha" },
	{ col: 30, key: "macd2_histo" },
	{ col: 31, key: "macd2_sinal" },
	{ col: 32, key: "agr_saldo" },
	{ col: 33, key: "quantidade" },
	{ col: 34, key: "volume_fin" },
	// New 2026-06-23 columns: prior session + extra MAs/oscillators
	{ col: 35, key: "prior_fechamento" },
	{ col: 36, key: "prior_maxima" },
	{ col: 37, key: "prior_minima" },
	{ col: 38, key: "abertura_dia" },
	{ col: 39, key: "ema21" },
	{ col: 40, key: "ema34" },
	{ col: 41, key: "ema72" },
	{ col: 42, key: "ema111" },
	{ col: 43, key: "ema500" },
	{ col: 44, key: "sma9" },
	{ col: 45, key: "sma17" },
	{ col: 46, key: "sma21" },
	{ col: 47, key: "sma27" },
	{ col: 48, key: "sma34" },
	{ col: 49, key: "sma44" },
	{ col: 50, key: "sma55" },
	{ col: 51, key: "sma72" },
	{ col: 52, key: "sma111" },
	{ col: 53, key: "sma200" },
	{ col: 54, key: "sma500" },
	{ col: 55, key: "vwap_1000" },
	{ col: 56, key: "vwap_1030" },
	{ col: 57, key: "vwap_1130" },
	{ col: 58, key: "adx14" },
	{ col: 59, key: "adx9" },
	{ col: 60, key: "atr14" },
	{ col: 61, key: "atr9" },
	{ col: 62, key: "ifr2" },
	{ col: 63, key: "ifr7" },
	{ col: 64, key: "ifr9" },
	{ col: 65, key: "ifr14" },
	{ col: 66, key: "ifr21" },
	{ col: 67, key: "ifr25" },
	{ col: 68, key: "brick" }, // per-row R-size; useful for debug + dynamic sizing
]

const CANDLE_INDEX_COL = 20 // contador
const ANCHOR_COLS: { col: number; key: string }[] = [
	{ col: 24, key: "ajuste" },
	{ col: 25, key: "ajuste_adj" },
]
const ANCHOR_INSERT_BATCH = 500

interface ParsedRow {
	timestamp: Date
	open: number
	high: number
	low: number
	close: number
	candleIndex: number | null
	indicators: Record<string, number>
	anchorCells: Record<string, number>
}

// "YYYY-MM-DD HH:MM:SS" in BR local time (UTC-3, no DST since 2019).
const parseDate = (raw: string): Date | null => {
	const m = raw.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/)
	if (!m) {
		return null
	}
	const [, y, mo, d, h, mi, s] = m
	return new Date(
		Date.UTC(
			Number(y),
			Number(mo) - 1,
			Number(d),
			Number(h) + 3,
			Number(mi),
			Number(s)
		)
	)
}

const parseNumber = (raw: string | undefined): number | null => {
	if (raw === undefined) {
		return null
	}
	const t = raw.trim()
	if (t === "") {
		return null
	}
	const n = Number(t)
	return Number.isFinite(n) ? n : null
}

const parseRow = (line: string): ParsedRow | null => {
	const cols = line.split(";")
	if (cols.length < 7) {
		return null
	}
	const ts = parseDate(cols[0] ?? "")
	if (!ts) {
		return null
	}
	const open = parseNumber(cols[3])
	const high = parseNumber(cols[4])
	const low = parseNumber(cols[5])
	const close = parseNumber(cols[6])
	if (open === null || high === null || low === null || close === null) {
		return null
	}
	const candleIndexRaw = parseNumber(cols[CANDLE_INDEX_COL])
	const candleIndex =
		candleIndexRaw === null ? null : Math.round(candleIndexRaw)
	const indicators: Record<string, number> = {}
	for (const { col, key } of INDICATOR_COLS) {
		const v = parseNumber(cols[col])
		if (v !== null) {
			indicators[key] = v
		}
	}
	const anchorCells: Record<string, number> = {}
	for (const { col, key } of ANCHOR_COLS) {
		const v = parseNumber(cols[col])
		if (v !== null) {
			anchorCells[key] = v
		}
	}
	return {
		timestamp: ts,
		open,
		high,
		low,
		close,
		candleIndex,
		indicators,
		anchorCells,
	}
}

const parseCsvFile = (path: string): ParsedRow[] => {
	const text = readFileSync(path, "utf8")
	const lines = text.split(/\r?\n/).filter(Boolean)
	const parsed: ParsedRow[] = []
	for (let i = 1; i < lines.length; i++) {
		const row = parseRow(lines[i]!)
		if (row) {
			parsed.push(row)
		}
	}
	parsed.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

	// Dedupe by (timestamp, candle_index). ProfitChart exports occasionally
	// emit the same brick row twice; first-wins is safe (identical OHLC).
	const seen = new Set<string>()
	const deduped: ParsedRow[] = []
	let dupCount = 0
	for (const r of parsed) {
		const key = `${r.timestamp.getTime()}:${r.candleIndex}`
		if (seen.has(key)) {
			dupCount++
			continue
		}
		seen.add(key)
		deduped.push(r)
	}
	return deduped.length === parsed.length
		? deduped
		: (console.log(`    dropped ${dupCount} duplicate (timestamp, idx) rows`),
			deduped)
}

// Largest source index with timestamp ≤ target. Returns -1 if target precedes
// all rows. Used for HTF projection — see materializer for the contract.
const findFloorIndex = (rows: ParsedRow[], targetMs: number): number => {
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

const projectHtf = (
	target: ParsedRow,
	source: ParsedRow[],
	openKey: string,
	closeKey: string,
	ema27Key: string,
	ema55Key: string
): void => {
	if (source.length === 0) {
		return
	}
	const idx = findFloorIndex(source, target.timestamp.getTime())
	if (idx < 0) {
		return
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
}

const run = async () => {
	const databaseUrl = process.env.DATABASE_URL
	if (!databaseUrl) {
		console.error("DATABASE_URL missing")
		process.exit(1)
	}
	const sql = isNeonUrl(databaseUrl) ? neon(databaseUrl) : postgres(databaseUrl)

	if (!existsSync(SOURCE_DIR)) {
		console.error(`HAWKS_TIMEFRAME_DIR not found: ${SOURCE_DIR}`)
		process.exit(1)
	}
	console.log(`Source dir: ${SOURCE_DIR}`)
	for (const tf of TIMEFRAMES) {
		const p = resolve(SOURCE_DIR, tf.file)
		if (!existsSync(p)) {
			console.error(`  missing ${tf.file} at ${p}`)
			process.exit(1)
		}
	}

	// ─── Resolve asset + admin accounts ──────────────────────────────────
	const assets = (await sql`
		SELECT id FROM assets WHERE symbol = ${ASSET_SYMBOL} LIMIT 1
	`) as { id: string }[]
	const assetId = assets[0]?.id
	if (!assetId) {
		throw new Error(`Asset ${ASSET_SYMBOL} not found`)
	}
	const accounts = (await sql`
		SELECT ta.id FROM trading_accounts ta
		JOIN users u ON u.id = ta.user_id
		WHERE u.email = ${ADMIN_EMAIL}
	`) as { id: string }[]
	if (accounts.length === 0) {
		throw new Error(`No accounts for ${ADMIN_EMAIL}`)
	}

	// ─── Seed the 3 Hawks timeframes + wire accounts ────────────────────
	const tfIdByRole = new Map<Role, string>()
	for (const tf of TIMEFRAMES) {
		const [{ id }] = (await sql`
			INSERT INTO timeframes (code, name, type, value, unit, sort_order, is_active)
			VALUES (${tf.code}, ${tf.name}, 'renko', 0, 'points', 0, true)
			ON CONFLICT (code) DO UPDATE SET
				name = EXCLUDED.name,
				type = EXCLUDED.type,
				is_active = true
			RETURNING id
		`) as Array<{ id: string }>
		tfIdByRole.set(tf.role, id)
	}
	for (const acc of accounts) {
		await sql`
			INSERT INTO account_assets (account_id, asset_id, is_enabled)
			VALUES (${acc.id}, ${assetId}, true)
			ON CONFLICT (account_id, asset_id) DO NOTHING
		`
		for (const tfId of tfIdByRole.values()) {
			await sql`
				INSERT INTO account_timeframes (account_id, timeframe_id, is_enabled)
				VALUES (${acc.id}, ${tfId}, true)
				ON CONFLICT (account_id, timeframe_id) DO NOTHING
			`
		}
	}
	console.log(
		`Seeded 3 hawk_<role>_win timeframes and wired ${accounts.length} account(s)`
	)

	// ─── Parse all three CSVs ────────────────────────────────────────────
	const rowsByRole = new Map<Role, ParsedRow[]>()
	for (const tf of TIMEFRAMES) {
		const path = resolve(SOURCE_DIR, tf.file)
		console.log(`  parsing ${tf.file}`)
		const rows = parseCsvFile(path)
		rowsByRole.set(tf.role, rows)
		console.log(`    ${tf.role}: ${rows.length} rows`)
	}

	// ─── Bake HTF projections in-place ──────────────────────────────────
	// Same key names + contract as the legacy materializer, so the engine
	// reads identical fields. See `materialize-hawks-timeframes.ts` for
	// rationale. Source brick timestamp = brick CLOSE; floor-≤ is correct.
	const r5 = rowsByRole.get("5m")!
	const r15 = rowsByRole.get("15m")!
	const r60 = rowsByRole.get("60m")!

	for (const target of r5) {
		projectHtf(
			target,
			r15,
			"prev_15m_open",
			"prev_15m_close",
			"mme27_15m",
			"mme55_15m"
		)
		projectHtf(
			target,
			r60,
			"prev_60m_open",
			"prev_60m_close",
			"mme27_60m",
			"mme55_60m"
		)
	}
	for (const target of r15) {
		projectHtf(
			target,
			r60,
			"prev_60m_open",
			"prev_60m_close",
			"mme27_60m",
			"mme55_60m"
		)
	}
	for (const target of r60) {
		projectHtf(
			target,
			r15,
			"prev_15m_open",
			"prev_15m_close",
			"mme27_15m",
			"mme55_15m"
		)
	}
	console.log("Baked cross-timeframe projections (5m↔15m↔60m)")

	// ─── Aggregate per-day anchors across ALL three CSVs ────────────────
	// ajuste/ajuste_adj are session-constant. First non-zero per (BRT date,
	// key) wins. `0` is treated as missing (pre-settlement rows).
	const anchorByDate = new Map<string, Record<string, number>>()
	for (const rows of rowsByRole.values()) {
		for (const r of rows) {
			const brtDate = new Date(r.timestamp.getTime() - 3 * 60 * 60 * 1000)
			const dateKey = brtDate.toISOString().slice(0, 10)
			let payload = anchorByDate.get(dateKey)
			if (!payload) {
				payload = {}
				anchorByDate.set(dateKey, payload)
			}
			for (const [key, value] of Object.entries(r.anchorCells)) {
				if (!(key in payload) && value !== 0) {
					payload[key] = value
				}
			}
		}
	}
	console.log(`Aggregated session anchors for ${anchorByDate.size} BRT day(s)`)

	// ─── Wipe and repopulate session anchors ────────────────────────────
	await sql`DELETE FROM asset_session_anchors WHERE asset_id = ${assetId}`

	// ─── Write parquet per role ─────────────────────────────────────────
	let totalRows = 0
	let totalBytes = 0
	for (const tf of TIMEFRAMES) {
		const rows = rowsByRole.get(tf.role)!
		if (rows.length === 0) {
			console.warn(`  ${tf.code}: 0 rows, skipping`)
			continue
		}

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
				candleIndex: r.candleIndex,
				indicators: r.indicators,
			})),
		})

		const tfId = tfIdByRole.get(tf.role)!
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
		totalRows += result.rowCount
		totalBytes += result.bytes
		console.log(
			`  ${tf.code}: ${result.rowCount} rows → ${(result.bytes / 1024).toFixed(1)} KB (${result.r2Key})`
		)
	}

	// ─── Bulk insert session anchors ────────────────────────────────────
	const anchorDates = [...anchorByDate.keys()].sort()
	let anchorsInserted = 0
	for (let i = 0; i < anchorDates.length; i += ANCHOR_INSERT_BATCH) {
		const slice = anchorDates.slice(i, i + ANCHOR_INSERT_BATCH)
		const payloads = slice.map((d) => JSON.stringify(anchorByDate.get(d) ?? {}))
		await sql`
			INSERT INTO asset_session_anchors (asset_id, date, payload, source)
			SELECT ${assetId}::uuid, d::date, p::jsonb, 'imported'
			FROM unnest(${slice}::text[], ${payloads}::text[]) AS u(d, p)
		`
		anchorsInserted += slice.length
	}

	console.log("")
	console.log("=== INGEST SUMMARY ===")
	console.log(`Timeframes:          ${TIMEFRAMES.length}`)
	console.log(`Total candles:       ${totalRows}`)
	console.log(
		`Parquet bytes:       ${(totalBytes / 1024 / 1024).toFixed(2)} MB`
	)
	console.log(`Session anchor days: ${anchorsInserted}`)
	console.log("")
	console.log("No materializer step needed — hawk_<role>_win parquet is final.")

	if (!isNeonUrl(databaseUrl)) {
		await (sql as ReturnType<typeof postgres>).end()
	}
}

run().catch((err) => {
	console.error(err)
	process.exit(1)
})
