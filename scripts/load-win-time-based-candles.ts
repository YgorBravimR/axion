/**
 * load-win-time-based-candles.ts
 *
 * Ingests time-based WIN candle CSVs (1m, 2m, 5m, 15m, 30m, 60m, 120m,
 * 240m, 1d, 1s = 1 semana, 1mes = 1 month) into `price_candles` under
 * new timeframe codes:
 *
 *   File         TF code  type         value   unit       Display
 *   ─────────────────────────────────────────────────────────────────────
 *   1m.csv      "1"       time_based   1       minutes    1 Minute
 *   2m.csv      "2"       time_based   2       minutes    2 Minutes
 *   5m.csv      "5"       time_based   5       minutes    5 Minutes
 *   15m.csv     "15"      time_based   15      minutes    15 Minutes
 *   30m.csv     "30"      time_based   30      minutes    30 Minutes
 *   60m.csv     "60"      time_based   60      minutes    60 Minutes
 *   120m.csv    "120"     time_based   120     minutes    120 Minutes
 *   240m.csv    "240"     time_based   240     minutes    240 Minutes
 *   1d.csv      "1d"      time_based   1       days       1 Day
 *   1s.csv      "1s"      time_based   1       weeks      1 Week
 *   1mes.csv    "1m"      time_based   1       months     1 Month
 *
 * Naming gotcha: the source file `1m.csv` contains 1-MINUTE bars, but
 * the TF code `"1m"` belongs to 1-MONTH (`1mes.csv`). The mapping below
 * is the source of truth.
 *
 * Same CSV format and parser as `load-hawks-bricks-by-size.ts`. Native
 * indicators land verbatim in candle JSONB; `ajuste`/`ajuste_adj` are
 * extracted per (BRT day) and ADDED to `asset_session_anchors` without
 * destroying existing anchors (first-non-zero per (date, key) wins).
 *
 * NOT destructive to other timeframes:
 *   - Only deletes existing `(WIN, timeframe ∈ {the 11 new codes})` rows
 *   - Does NOT touch R<n> renko candles
 *   - Does NOT touch Hawk_<role>_win materialized candles
 *   - Does NOT cross-TF project (time-based bars are standalone)
 *
 * Usage:
 *   pnpm tsx scripts/load-win-time-based-candles.ts
 */

import "dotenv/config"
import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import postgres from "postgres"
import { writeCandleParquet } from "@/lib/candle-store/parquet-writer"

const ASSET_SYMBOL = "WIN"
const ADMIN_EMAIL = "admin@bravo.com"
const SOURCE_DIR =
	process.env.WIN_TIME_SOURCE_DIR ?? "/Users/ygorbravim/Downloads/WIN"

interface TfSpec {
	file: string
	code: string
	displayName: string
	value: number
	unit: "minutes" | "hours" | "days" | "weeks" | "months"
}

const TIMEFRAMES: TfSpec[] = [
	{
		file: "1m.csv",
		code: "1",
		displayName: "1 Minute",
		value: 1,
		unit: "minutes",
	},
	{
		file: "2m.csv",
		code: "2",
		displayName: "2 Minutes",
		value: 2,
		unit: "minutes",
	},
	{
		file: "5m.csv",
		code: "5",
		displayName: "5 Minutes",
		value: 5,
		unit: "minutes",
	},
	{
		file: "15m.csv",
		code: "15",
		displayName: "15 Minutes",
		value: 15,
		unit: "minutes",
	},
	{
		file: "30m.csv",
		code: "30",
		displayName: "30 Minutes",
		value: 30,
		unit: "minutes",
	},
	{
		file: "60m.csv",
		code: "60",
		displayName: "60 Minutes",
		value: 60,
		unit: "minutes",
	},
	{
		file: "120m.csv",
		code: "120",
		displayName: "120 Minutes",
		value: 120,
		unit: "minutes",
	},
	{
		file: "240m.csv",
		code: "240",
		displayName: "240 Minutes",
		value: 240,
		unit: "minutes",
	},
	{ file: "1d.csv", code: "1d", displayName: "1 Day", value: 1, unit: "days" },
	{
		file: "1s.csv",
		code: "1s",
		displayName: "1 Week",
		value: 1,
		unit: "weeks",
	},
	{
		file: "1mes.csv",
		code: "1m",
		displayName: "1 Month",
		value: 1,
		unit: "months",
	},
]

// CSV column layout (0-indexed). Identical to the Renko CSVs.
const NATIVE_INDICATORS: { col: number; key: string }[] = [
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
	{ col: 26, key: "macd1_linha" },
	{ col: 27, key: "macd1_histo" },
	{ col: 28, key: "macd1_sinal" },
	{ col: 29, key: "macd2_linha" },
	{ col: 30, key: "macd2_histo" },
	{ col: 31, key: "macd2_sinal" },
	{ col: 32, key: "agr_saldo" },
	{ col: 33, key: "quantidade" },
	{ col: 34, key: "volume_fin" },
]
const CANDLE_INDEX_COL = 20 // contador (per-day brick / bar counter)
const ANCHOR_COLS = [
	{ col: 24, key: "ajuste" },
	{ col: 25, key: "ajuste_adj" },
]

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

// "YYYY-MM-DD HH:MM:SS" BRT (UTC-3 fixed, Brazil dropped DST in 2019).
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
	const ciRaw = parseNumber(cols[CANDLE_INDEX_COL])
	const candleIndex = ciRaw === null ? null : Math.round(ciRaw)
	const indicators: Record<string, number> = {}
	for (const { col, key } of NATIVE_INDICATORS) {
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

const run = async () => {
	const databaseUrl = process.env.DATABASE_URL
	if (!databaseUrl) {
		console.error("DATABASE_URL missing")
		process.exit(1)
	}
	if (!existsSync(SOURCE_DIR)) {
		console.error(`source dir not found: ${SOURCE_DIR}`)
		process.exit(1)
	}
	const sql = postgres(databaseUrl, { max: 4, idle_timeout: 30 })

	// ─── Resolve asset + admin accounts ─────────────────────────────────
	const assetsRes = (await sql`
		SELECT id FROM assets WHERE symbol = ${ASSET_SYMBOL} LIMIT 1
	`) as { id: string }[]
	const assetId = assetsRes[0]?.id
	if (!assetId) {
		throw new Error(`Asset ${ASSET_SYMBOL} not found`)
	}
	const accounts = (await sql`
		SELECT ta.id FROM trading_accounts ta
		JOIN users u ON u.id = ta.user_id
		WHERE u.email = ${ADMIN_EMAIL}
	`) as { id: string }[]
	console.log(
		`Discovered ${accounts.length} admin account(s) — will wire all to new timeframes`
	)

	// ─── Validate all CSV files exist ───────────────────────────────────
	for (const spec of TIMEFRAMES) {
		const path = resolve(SOURCE_DIR, spec.file)
		if (!existsSync(path)) {
			throw new Error(`missing source file: ${path}`)
		}
	}

	// ─── Seed/refresh each timeframe row ────────────────────────────────
	const timeframeIdByCode = new Map<string, string>()
	for (const spec of TIMEFRAMES) {
		const sortOrder =
			spec.unit === "months"
				? 100_000
				: spec.unit === "weeks"
					? 50_000
					: spec.unit === "days"
						? 10_000
						: spec.value // minute count drives ordering
		const [{ id }] = (await sql`
			INSERT INTO timeframes (code, name, type, value, unit, sort_order, is_active)
			VALUES (${spec.code}, ${spec.displayName}, 'time_based', ${spec.value}, ${spec.unit}, ${sortOrder}, true)
			ON CONFLICT (code) DO UPDATE SET
				name = EXCLUDED.name,
				type = EXCLUDED.type,
				value = EXCLUDED.value,
				unit = EXCLUDED.unit,
				sort_order = EXCLUDED.sort_order,
				is_active = true
			RETURNING id
		`) as { id: string }[]
		timeframeIdByCode.set(spec.code, id)
	}
	console.log(`Seeded ${timeframeIdByCode.size} time-based timeframe row(s)`)

	// ─── Wire admin accounts → (asset, each new timeframe) ──────────────
	for (const acc of accounts) {
		await sql`
			INSERT INTO account_assets (account_id, asset_id, is_enabled)
			VALUES (${acc.id}, ${assetId}, true)
			ON CONFLICT (account_id, asset_id) DO NOTHING
		`
		for (const tfId of timeframeIdByCode.values()) {
			await sql`
				INSERT INTO account_timeframes (account_id, timeframe_id, is_enabled)
				VALUES (${acc.id}, ${tfId}, true)
				ON CONFLICT (account_id, timeframe_id) DO NOTHING
			`
		}
	}
	console.log(`Wired ${accounts.length} account(s) to all 11 new timeframes`)

	// ─── Parse every CSV into memory ────────────────────────────────────
	const parsedByCode = new Map<string, ParsedRow[]>()
	const anchorByDate = new Map<string, Record<string, number>>()
	let totalParsed = 0
	for (const spec of TIMEFRAMES) {
		const path = resolve(SOURCE_DIR, spec.file)
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
		// Dedupe by (timestamp, candle_index) per the price_candles unique idx.
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
		if (dupCount > 0) {
			console.log(`  ${spec.file}: dropped ${dupCount} duplicate row(s)`)
		}
		parsedByCode.set(spec.code, deduped)
		totalParsed += deduped.length

		// Accumulate anchors per BRT day (first non-zero per (date, key)).
		for (const r of deduped) {
			const brtDate = new Date(r.timestamp.getTime() - 3 * 60 * 60 * 1000)
			const dayKey = brtDate.toISOString().slice(0, 10)
			let payload = anchorByDate.get(dayKey)
			if (!payload) {
				payload = {}
				anchorByDate.set(dayKey, payload)
			}
			for (const [k, v] of Object.entries(r.anchorCells)) {
				if (!(k in payload) && v !== 0) {
					payload[k] = v
				}
			}
		}

		console.log(
			`  parsed ${spec.file} (code=${spec.code}): ${deduped.length} rows`
		)
	}
	console.log(`Total parsed: ${totalParsed} rows`)

	// ─── Write Parquet per timeframe (local + R2) ──────────────────────
	// Candle bytes live in R2; price_data_versions stays on Postgres as a
	// dataset registry so the UI can enumerate available (asset, timeframe)
	// combos without listing R2 objects.
	let totalRows = 0
	let totalBytes = 0
	for (const spec of TIMEFRAMES) {
		const rows = parsedByCode.get(spec.code) ?? []
		if (rows.length === 0) {
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
			timeframeCode: spec.code,
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

		const tfId = timeframeIdByCode.get(spec.code)!
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
			`  ${spec.code} (${spec.displayName}): ${result.rowCount} rows → ${(result.bytes / 1024).toFixed(1)} KB`
		)
	}
	console.log(
		`Total Parquet bytes: ${(totalBytes / 1024 / 1024).toFixed(2)} MB across ${totalRows} rows`
	)

	// ─── Anchor upsert (additive — does not wipe existing anchor rows) ──
	const anchorDates = [...anchorByDate.keys()].sort()
	let anchorsUpserted = 0
	for (let i = 0; i < anchorDates.length; i += BATCH) {
		const slice = anchorDates.slice(i, i + BATCH)
		const dates = slice
		const payloads = slice.map((d) => JSON.stringify(anchorByDate.get(d) ?? {}))
		await sql`
			INSERT INTO asset_session_anchors (asset_id, date, payload, source)
			SELECT ${assetId}::uuid, d::date, p::jsonb, 'imported'
			FROM unnest(${dates}::text[], ${payloads}::text[]) AS u(d, p)
			ON CONFLICT (asset_id, date) DO UPDATE SET
				payload = asset_session_anchors.payload || EXCLUDED.payload,
				updated_at = NOW()
		`
		anchorsUpserted += slice.length
	}
	console.log(`Upserted ${anchorsUpserted} session anchor day(s)`)

	console.log("")
	console.log("=== INGEST SUMMARY ===")
	console.log(`Timeframes seeded: ${timeframeIdByCode.size}`)
	console.log(`Candles inserted:  ${totalRows}`)
	console.log(`Anchor days touched: ${anchorsUpserted}`)
	console.log(
		`Account wiring:    ${accounts.length} account(s) × 11 timeframes`
	)

	await sql.end()
}

run().catch((err) => {
	console.error(err)
	process.exit(1)
})
