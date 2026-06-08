/**
 * load-hawks-bricks-by-size.ts
 *
 * Per-brick-size Hawks candle loader. The 2026 export model is one CSV per
 * Renko brick size — `15R.csv`, `17R.csv`, …, `123R.csv` — under
 * `${HAWKS_SOURCE_DIR}` (default `/Users/ygorbravim/Downloads/axion/WIN`).
 *
 * For each CSV we:
 *   1. Ensure a `timeframes` row with code `R<n>` exists.
 *   2. Parse rows, then write a Parquet file per (asset=WIN, timeframe=R<n>)
 *      to local disk + R2 via `writeCandleParquet`.
 *   3. Upsert `price_data_versions` so the UI catalog picks up the dataset.
 *
 * This script ONLY ingests raw R<n> source data. The per-week role
 * assignment (which R<n> is "5m" / "15m" / "60m" for each week) and
 * cross-timeframe projection of EMAs/OHLC live in the materializer
 * (`scripts/materialize-hawks-timeframes.ts`), which builds the three
 * engine-facing `Hawk_5m_win` / `Hawk_15m_win` / `Hawk_60m_win`
 * timeframes from this raw data + `hawks_renko_sizes`.
 *
 * Native indicators (`ema9`/`ema17`/`ema27`/`ema44`/`ema55`/`ema200`,
 * `kc1_sup`/`kc1_inf`/`kc2_sup`/`kc2_inf`, `tbd1`/`tbd2`/`tbd3`,
 * `vwap_d`/`vwap_w`/`vwap_m`, `ajuste`/`ajuste_adj`,
 * `macd1_linha`/`macd1_histo`/`macd1_sinal`, `macd2_*`, `agr_saldo`,
 * `quantidade`, `volume_fin`) land verbatim with the CSV column names.
 *
 * Usage:
 *   pnpm tsx scripts/load-hawks-bricks-by-size.ts
 *   HAWKS_SOURCE_DIR=/some/path pnpm tsx scripts/load-hawks-bricks-by-size.ts
 */

import "dotenv/config"
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { neon } from "@neondatabase/serverless"
import postgres from "postgres"
import { isNeonUrl } from "@/db/url"
import { importHawksRenkoSizes } from "@/app/actions/hawks-renko"
import { writeCandleParquet } from "@/lib/candle-store/parquet-writer"

const ADMIN_EMAIL = "admin@bravo.com"
const ASSET_SYMBOL = "WIN"

const SOURCE_DIR =
	process.env.HAWKS_SOURCE_DIR ?? "/Users/ygorbravim/Downloads/axion/WIN"
const RENKO_SIZES_PATH = resolve(process.cwd(), "data/hawks/renko-sizes.csv")

// CSV header (0-indexed columns):
//   0  datetime          1  date          2  time
//   3  open              4  high          5  low          6  close
//   7  ema9              8  ema17         9  ema27        10 ema44
//   11 ema55             12 ema200
//   13 kc1_sup           14 kc1_inf       15 kc2_sup      16 kc2_inf
//   17 tbd1              18 tbd2          19 tbd3
//   20 contador
//   21 vwap_d            22 vwap_w        23 vwap_m
//   24 ajuste            25 ajuste_adj
//   26 macd1_linha       27 macd1_histo   28 macd1_sinal
//   29 macd2_linha       30 macd2_histo   31 macd2_sinal
//   32 agr_saldo         33 quantidade    34 volume_fin
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
	// cols 24 (ajuste) + 25 (ajuste_adj) are FIXED for the day — they live
	// in asset_session_anchors instead of being duplicated across every
	// brick row. See ANCHOR_COLS below for the per-day extraction.
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
const CANDLE_INDEX_COL = 20 // contador

// Per-day anchor columns: extracted once per (date) and written to
// asset_session_anchors. Decoupled from per-brick JSONB to avoid
// duplicating a single daily value across thousands of candle rows.
const ANCHOR_COLS: { col: number; key: string }[] = [
	{ col: 24, key: "ajuste" },
	{ col: 25, key: "ajuste_adj" },
]

interface ParsedRow {
	timestamp: Date // UTC
	open: number
	high: number
	low: number
	close: number
	candleIndex: number | null
	indicators: Record<string, number>
	// Per-day anchor cells parsed from this row but NOT stored in JSONB.
	// First non-null value per (date, key) wins across all CSVs.
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

// Source CSVs use dot decimal; empty cells are blank.
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
	const sql = isNeonUrl(databaseUrl) ? neon(databaseUrl) : postgres(databaseUrl)

	// ─── Discover source CSVs ─────────────────────────────────────────────
	if (!existsSync(SOURCE_DIR)) {
		console.error(`HAWKS_SOURCE_DIR not found: ${SOURCE_DIR}`)
		process.exit(1)
	}
	const fileEntries = readdirSync(SOURCE_DIR)
		.filter((f) => /^\d+R\.csv$/.test(f))
		.map((f) => ({
			file: f,
			size: Number(f.replace(/R\.csv$/, "")),
			path: resolve(SOURCE_DIR, f),
		}))
		.sort((a, b) => a.size - b.size)

	if (fileEntries.length === 0) {
		console.error(`No <n>R.csv files found in ${SOURCE_DIR}`)
		process.exit(1)
	}
	console.log(
		`Discovered ${fileEntries.length} per-brick-size CSV(s) in ${SOURCE_DIR}`
	)
	console.log(`  sizes: ${fileEntries.map((e) => e.size).join(", ")}`)

	// ─── Resolve asset, accounts, refresh renko-sizes ─────────────────────
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

	// Refresh weekly brick sizes FIRST so the per-week cross-TF projection
	// step below can rely on it.
	const renkoCsv = readFileSync(RENKO_SIZES_PATH, "utf8")
	const renkoResult = await importHawksRenkoSizes(renkoCsv)
	if (!renkoResult.success) {
		throw new Error(`renko-sizes import failed: ${renkoResult.error}`)
	}
	console.log(`Refreshed ${renkoResult.imported} weekly Renko size rows`)

	// ─── Seed timeframes (R<n>) and account wiring ────────────────────────
	const timeframeIdBySize = new Map<number, string>()
	for (const entry of fileEntries) {
		const code = `R${entry.size}`
		const name = `Renko ${entry.size}R`
		const [{ id: tfId }] = (await sql`
			INSERT INTO timeframes (code, name, type, value, unit, sort_order, is_active)
			VALUES (${code}, ${name}, 'renko', ${entry.size}, 'points', ${entry.size}, true)
			ON CONFLICT (code) DO UPDATE SET
				name = EXCLUDED.name,
				type = EXCLUDED.type,
				value = EXCLUDED.value,
				unit = EXCLUDED.unit,
				sort_order = EXCLUDED.sort_order,
				is_active = true
			RETURNING id
		`) as Array<{ id: string }>
		timeframeIdBySize.set(entry.size, tfId)
	}
	console.log(
		`Seeded/refreshed ${timeframeIdBySize.size} R<n> timeframe row(s)`
	)

	for (const acc of accounts) {
		await sql`
			INSERT INTO account_assets (account_id, asset_id, is_enabled)
			VALUES (${acc.id}, ${assetId}, true)
			ON CONFLICT (account_id, asset_id) DO NOTHING
		`
		for (const tfId of timeframeIdBySize.values()) {
			await sql`
				INSERT INTO account_timeframes (account_id, timeframe_id, is_enabled)
				VALUES (${acc.id}, ${tfId}, true)
				ON CONFLICT (account_id, timeframe_id) DO NOTHING
			`
		}
	}
	console.log(
		`Wired ${accounts.length} account(s) → ${ASSET_SYMBOL} + ${timeframeIdBySize.size} timeframes`
	)

	// ─── Parse every CSV into memory ─────────────────────────────────────
	const rowsBySize = new Map<number, ParsedRow[]>()
	for (const entry of fileEntries) {
		const text = readFileSync(entry.path, "utf8")
		const lines = text.split(/\r?\n/).filter(Boolean)
		// First line is header.
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
		if (dupCount > 0) {
			console.log(
				`  R${entry.size}: dropped ${dupCount} duplicate (timestamp, candle_index) rows`
			)
		}
		rowsBySize.set(entry.size, deduped)
		console.log(`  parsed R${entry.size}: ${deduped.length} rows`)
	}

	// ─── Aggregate per-day anchors across ALL CSVs ────────────────────────
	// ajuste/ajuste_adj are FIXED for the day, so every brick row on the
	// same BRT date carries the same value. We take the first non-zero
	// value per (date, key) we encounter across all CSV files.
	// `0` is treated as "missing" because the source CSV reports 0 on rows
	// before the official D-1 settlement is published.
	const anchorByDate = new Map<string, Record<string, number>>()
	for (const rows of rowsBySize.values()) {
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

	// ─── Wipe session anchors only — candle data lives in Parquet now ────
	// Anchors are session-constant values keyed by (asset, BRT date). Re-
	// import truncates per asset and re-populates from the union of CSVs.
	// price_candles + price_data_versions used to live here but are now
	// served by R2 Parquet files (one per timeframe-asset combo).
	await sql`DELETE FROM asset_session_anchors WHERE asset_id = ${assetId}`
	console.log(`Wiped asset_session_anchors for ${ASSET_SYMBOL} (clean slate)`)

	// ─── Write Parquet per timeframe (local + R2) ─────────────────────────
	let totalRows = 0
	let totalBytes = 0
	for (const entry of fileEntries) {
		const rows = rowsBySize.get(entry.size) ?? []
		if (rows.length === 0) {
			continue
		}

		// Union of indicator keys present across this timeframe's rows.
		const indicatorKeysSet = new Set<string>()
		for (const r of rows) {
			for (const k of Object.keys(r.indicators)) {
				indicatorKeysSet.add(k)
			}
		}
		const indicatorKeys = [...indicatorKeysSet].sort()

		const result = await writeCandleParquet({
			timeframeCode: `R${entry.size}`,
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

		// Update registry so getAssetsWithPriceData + the UI can list this
		// (asset, timeframe) dataset. Candle bytes live in R2; the metadata
		// pointer stays on Postgres for transactional joins with trades.
		const tfId = timeframeIdBySize.get(entry.size)!
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
			`  R${entry.size}: ${result.rowCount} rows → ${(result.bytes / 1024).toFixed(1)} KB (${result.r2Key})`
		)
	}
	console.log(
		`Total Parquet bytes: ${(totalBytes / 1024 / 1024).toFixed(2)} MB across ${totalRows} rows`
	)

	// ─── Bulk insert session anchors ──────────────────────────────────────
	const anchorDates = [...anchorByDate.keys()].sort()
	let anchorsInserted = 0
	for (let i = 0; i < anchorDates.length; i += BATCH) {
		const slice = anchorDates.slice(i, i + BATCH)
		const dates = slice
		const payloads = slice.map((d) => JSON.stringify(anchorByDate.get(d) ?? {}))
		await sql`
			INSERT INTO asset_session_anchors (asset_id, date, payload, source)
			SELECT ${assetId}::uuid, d::date, p::jsonb, 'imported'
			FROM unnest(${dates}::text[], ${payloads}::text[]) AS u(d, p)
		`
		anchorsInserted += slice.length
	}
	console.log(`  asset_session_anchors: ${anchorsInserted} day(s)`)

	console.log("")
	console.log("=== INGEST SUMMARY ===")
	console.log(`Timeframes seeded:   ${timeframeIdBySize.size}`)
	console.log(`Total candles:       ${totalRows}`)
	console.log(`Session anchor days: ${anchorsInserted}`)
	console.log("")
	console.log(
		"Next: run scripts/materialize-hawks-timeframes.ts to build Hawk_5m_win / Hawk_15m_win / Hawk_60m_win."
	)

	if (!isNeonUrl(databaseUrl)) {
		await (sql as ReturnType<typeof postgres>).end()
	}
}

run().catch((err) => {
	console.error(err)
	process.exit(1)
})
