import "dotenv/config"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { neon } from "@neondatabase/serverless"
import postgres from "postgres"
import { isNeonUrl } from "@/db/url"
import { importHawksRenkoSizes } from "@/app/actions/hawks-renko"

const ADMIN_EMAIL = "admin@bravo.com"
const ASSET_SYMBOL = "WIN"

// In-repo CSV source root. CSVs are gitignored — kept local.
const DATA_ROOT = resolve(process.cwd(), "data/hawks")

// Per-file mapping from CSV column index → JSONB indicator key. The 60m file
// owns the 60m EMAs and the 60m MACD; the 15m file owns the 15m EMAs (the
// engine reads `mme27_15m` even when running on 60m candles, so we forward-fill
// that key onto each 60m row after both files are parsed). Indicator keys must
// match `hawks-presets.ts` exactly.
interface IndicatorColumn {
	index: number
	key: string
}

const FILES: {
	timeframeCode: string
	path: string
	candleIndexCol: number
	indicatorColumns: IndicatorColumn[]
}[] = [
	{
		timeframeCode: "5m",
		path: resolve(DATA_ROOT, "candles/5m.csv"),
		candleIndexCol: 12, // "INDEX DO CANDLE"
		// 5m header (2026-05-28 schema):
		//   0:Data 1:Abertura 2:Máxima 3:Mínima 4:Fechamento
		//   5:MME27 60m 6:MME55 60m 7:MME55 15m 8:MME27 15m
		//   9:VWAP D 10:VWAP M 11:VWAP S 12:INDEX DO CANDLE 13:AJUSTE
		//   14:TOPOS E FUNDOS [2]
		//   15:KELTNER SUPERIOR [12.50] 16:KELTNER INFERIOR [12.50]
		//   17:KELTNER SUPERIOR [16.50] 18:KELTNER INFERIOR [16.50]
		//   19:MACD 20:VOLUME 21:Agressão saldo
		indicatorColumns: [
			{ index: 5, key: "mme27_60m" },
			{ index: 6, key: "mme55_60m" },
			{ index: 7, key: "mme55_15m" },
			{ index: 8, key: "mme27_15m" },
			{ index: 9, key: "vwap_d_5m" },
			{ index: 10, key: "vwap_m_5m" },
			{ index: 11, key: "vwap_s_5m" },
			{ index: 13, key: "ajuste_d1" },
			// TOPOS E FUNDOS [2] = 2-brick-close confirmation pivot.
			// Sparse column: only present on confirmed pivots.
			{ index: 14, key: "topos_fundos" },
			{ index: 15, key: "keltner_sup_125" },
			{ index: 16, key: "keltner_inf_125" },
			{ index: 17, key: "keltner_sup_165" },
			{ index: 18, key: "keltner_inf_165" },
			{ index: 19, key: "macd" },
			{ index: 20, key: "volume" },
			{ index: 21, key: "aggression_balance" },
		],
	},
	{
		timeframeCode: "15m",
		path: resolve(DATA_ROOT, "candles/15m.csv"),
		candleIndexCol: 7, // "INDEX DO CANDLE"
		// 15m header (2026-05-28 schema):
		//   0:Data 1:Abertura 2:Máxima 3:Mínima 4:Fechamento
		//   5:MME 27 6:MME 55 7:INDEX DO CANDLE 8:TOPOS E FUNDOS [1]
		//   9-12: KELTNER 12.50/16.50 SUPERIOR/INFERIOR
		//   13:TOPOS E FUNDOS [2] 14:MACD
		indicatorColumns: [
			{ index: 5, key: "mme27_15m" },
			{ index: 6, key: "mme55_15m" },
			{ index: 8, key: "topos_fundos_p1" },
			{ index: 9, key: "keltner_sup_125" },
			{ index: 10, key: "keltner_inf_125" },
			{ index: 11, key: "keltner_sup_165" },
			{ index: 12, key: "keltner_inf_165" },
			{ index: 13, key: "topos_fundos_p2" },
			{ index: 14, key: "macd" },
		],
	},
	{
		timeframeCode: "1h",
		path: resolve(DATA_ROOT, "candles/60m.csv"),
		candleIndexCol: 7,
		// 60m header same shape as 15m (MME 27/55 are intrinsic to 60m).
		indicatorColumns: [
			{ index: 5, key: "mme27_60m" },
			{ index: 6, key: "mme55_60m" },
			{ index: 8, key: "topos_fundos_p1" },
			{ index: 9, key: "keltner_sup_125" },
			{ index: 10, key: "keltner_inf_125" },
			{ index: 11, key: "keltner_sup_165" },
			{ index: 12, key: "keltner_inf_165" },
			{ index: 13, key: "topos_fundos_p2" },
			{ index: 14, key: "macd" },
		],
	},
]

const RENKO_SIZES_PATH = resolve(DATA_ROOT, "renko-sizes.csv")

const decodeLatin1 = (path: string) => {
	const buf = readFileSync(path)
	const decoder = new TextDecoder("latin1")
	return decoder.decode(buf)
}

// "13/05/2026 14:04:10.703" → Date. BR market data is UTC-3 (no DST since 2019).
const parseDate = (raw: string): Date => {
	const m = raw.match(
		/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/
	)
	if (!m) {
		throw new Error(`Bad date: ${raw}`)
	}
	const [, dd, mm, yyyy, hh, mi, ss, ms] = m
	const utc = Date.UTC(
		Number(yyyy),
		Number(mm) - 1,
		Number(dd),
		Number(hh) + 3,
		Number(mi),
		Number(ss),
		ms ? Number(ms.padEnd(3, "0")) : 0
	)
	return new Date(utc)
}

// BR numeric literals use `.` as thousand separator and `,` as decimal point
// ("183460,44", "1.234,56"). Returns null for empty / unparseable cells so the
// caller can drop them from the JSONB blob (the engine treats missing keys as
// "no signal", which is the right behaviour for sparse columns like AJUSTE).
const parseBrNumber = (raw: string | undefined): number | null => {
	if (!raw) {
		return null
	}
	const cleaned = raw.trim().replace(/\./g, "").replace(",", ".")
	if (cleaned === "") {
		return null
	}
	const n = Number(cleaned)
	return Number.isFinite(n) ? n : null
}

interface ParsedRow {
	timestamp: Date
	open: number
	high: number
	low: number
	close: number
	// ProfitChart "CANDLE" column (col 12): per-day 1-indexed brick counter.
	// Used as candle_index so same-millisecond bricks have a stable sort key
	// and the unique index (timestamp, candle_index) is effective.
	candleIndex: number | null
	indicators: Record<string, number>
}

const parseRow = (
	line: string,
	indicatorColumns: IndicatorColumn[],
	candleIndexCol: number
): ParsedRow | null => {
	const cols = line.split(";")
	if (cols.length < 5) {
		return null
	}
	const date = cols[0]
	if (!date) {
		return null
	}
	const open = parseBrNumber(cols[1])
	const high = parseBrNumber(cols[2])
	const low = parseBrNumber(cols[3])
	const close = parseBrNumber(cols[4])
	if (open === null || high === null || low === null || close === null) {
		return null
	}
	// ProfitChart per-day brick counter ("INDEX DO CANDLE"). Position differs
	// between the 5m file (col 12) and the 15m/60m files (col 7).
	const candleIndex = cols[candleIndexCol]
		? Math.round(Number(cols[candleIndexCol])) || null
		: null
	const indicators: Record<string, number> = {}
	for (const { index, key } of indicatorColumns) {
		const v = parseBrNumber(cols[index])
		if (v !== null) {
			indicators[key] = v
		}
	}
	return {
		timestamp: parseDate(date),
		open,
		high,
		low,
		close,
		candleIndex,
		indicators,
	}
}

// Largest index ≤ target. Returns -1 when target precedes all rows.
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

const run = async () => {
	const databaseUrl = process.env.DATABASE_URL
	if (!databaseUrl) {
		console.error("DATABASE_URL missing")
		process.exit(1)
	}
	const sql = isNeonUrl(databaseUrl) ? neon(databaseUrl) : postgres(databaseUrl)

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

	const tfRows = (await sql`SELECT id, code FROM timeframes`) as {
		id: string
		code: string
	}[]
	const timeframeIdByCode = new Map(tfRows.map((r) => [r.code, r.id]))

	for (const acc of accounts) {
		await sql`
			INSERT INTO account_assets (account_id, asset_id, is_enabled)
			VALUES (${acc.id}, ${assetId}, true)
			ON CONFLICT (account_id, asset_id) DO NOTHING
		`
		for (const { timeframeCode } of FILES) {
			const tfId = timeframeIdByCode.get(timeframeCode)
			if (!tfId) {
				throw new Error(`Timeframe ${timeframeCode} not found`)
			}
			await sql`
				INSERT INTO account_timeframes (account_id, timeframe_id, is_enabled)
				VALUES (${acc.id}, ${tfId}, true)
				ON CONFLICT (account_id, timeframe_id) DO NOTHING
			`
		}
	}
	console.log(
		`Wired ${accounts.length} account(s) → ${ASSET_SYMBOL} + ${FILES.length} timeframes`
	)

	// Parse every file up front so we can do cross-timeframe forward-fill before
	// any DB writes. Memory is fine — these CSVs cap out around 5K rows each.
	const parsedByTf = new Map<string, ParsedRow[]>()
	for (const {
		timeframeCode,
		path,
		indicatorColumns,
		candleIndexCol,
	} of FILES) {
		const text = decodeLatin1(path)
		const lines = text.split(/\r?\n/).filter(Boolean)
		const parsed = lines
			.slice(1)
			.map((line) => parseRow(line, indicatorColumns, candleIndexCol))
			.filter((r): r is ParsedRow => r !== null)
			.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

		// Dedupe by (timestamp, candle_index). ProfitChart's 15m/60m exports emit
		// the same brick row twice in some session-open bursts (April 2026 window).
		// The duplicate row carries identical OHLC + indicators, so first-wins is
		// safe; the alternative — dropping the unique index — would mask real dups.
		const seen = new Set<string>()
		const rows: ParsedRow[] = []
		let dupCount = 0
		for (const r of parsed) {
			const key = `${r.timestamp.getTime()}:${r.candleIndex}`
			if (seen.has(key)) {
				dupCount++
				continue
			}
			seen.add(key)
			rows.push(r)
		}
		if (dupCount > 0) {
			console.log(
				`  ${timeframeCode}: dropped ${dupCount} duplicate (timestamp, candle_index) rows`
			)
		}
		parsedByTf.set(timeframeCode, rows)
	}

	// Forward-fill cross-timeframe indicators. The Hawks engine reads all
	// required keys from a single candle's JSONB regardless of which timeframe
	// it's iterating, so each timeframe's rows must carry every indicator the
	// engine might ask for. The 5m CSV ships pre-joined; the 15m and 60m files
	// only know their own keys, so we project across them at ingest time.
	const fifteenMinRows = parsedByTf.get("15m") ?? []
	const sixtyMinRows = parsedByTf.get("1h") ?? []

	// 15m → 60m: each 60m row picks up `mme27_15m` and `mme55_15m`
	let filled60 = 0
	for (const row of sixtyMinRows) {
		const idx = findFloorIndex(fifteenMinRows, row.timestamp.getTime())
		if (idx < 0) {
			continue
		}
		const src = fifteenMinRows[idx]!.indicators
		if (typeof src.mme27_15m === "number") {
			row.indicators.mme27_15m = src.mme27_15m
			filled60++
		}
		if (typeof src.mme55_15m === "number") {
			row.indicators.mme55_15m = src.mme55_15m
		}
	}

	// 60m → 15m: each 15m row picks up `mme27_60m` and `mme55_60m`
	let filled15 = 0
	for (const row of fifteenMinRows) {
		const idx = findFloorIndex(sixtyMinRows, row.timestamp.getTime())
		if (idx < 0) {
			continue
		}
		const src = sixtyMinRows[idx]!.indicators
		if (typeof src.mme27_60m === "number") {
			row.indicators.mme27_60m = src.mme27_60m
			filled15++
		}
		if (typeof src.mme55_60m === "number") {
			row.indicators.mme55_60m = src.mme55_60m
		}
	}

	console.log(
		`Forward-filled 15m→60m on ${filled60}/${sixtyMinRows.length} 60m rows; 60m→15m on ${filled15}/${fifteenMinRows.length} 15m rows`
	)

	// Project the most-recently-CLOSED 15m and 60m **Renko brick**'s OHLC onto
	// every 5m row so the Hawks engine can run its "previous-brick below both
	// EMAs" gate without doing a cross-TF join at backtest time.
	//
	// The 15m and 60m CSVs are Renko brick data — each row is a brick, not a
	// time-window candle. The `timestamp` is the brick's CLOSE time (the tick
	// that triggered the brick). So "most recently closed brick at 5m time T"
	// = the higher-TF brick with the largest timestamp strictly less than T.
	// We use `T - 1ms` as the floor target to prevent look-ahead bias when a
	// brick closes in the same instant as a 5m bar.
	const fiveMinRows = parsedByTf.get("5m") ?? []
	const projectPrev = (
		fiveRow: ParsedRow,
		higherRows: ParsedRow[],
		openKey: string,
		closeKey: string
	) => {
		const targetMs = fiveRow.timestamp.getTime() - 1
		const idx = findFloorIndex(higherRows, targetMs)
		if (idx < 0) {
			return
		}
		const src = higherRows[idx]!
		fiveRow.indicators[openKey] = src.open
		fiveRow.indicators[closeKey] = src.close
	}
	let projected15 = 0
	let projected60 = 0
	for (const row of fiveMinRows) {
		const before15Open = row.indicators.prev_15m_open
		projectPrev(row, fifteenMinRows, "prev_15m_open", "prev_15m_close")
		if (row.indicators.prev_15m_open !== before15Open) {
			projected15++
		}
		const before60Open = row.indicators.prev_60m_open
		projectPrev(row, sixtyMinRows, "prev_60m_open", "prev_60m_close")
		if (row.indicators.prev_60m_open !== before60Open) {
			projected60++
		}
	}
	console.log(
		`Projected previous-closed Renko brick OHLC onto 5m rows — 15m: ${projected15}/${fiveMinRows.length}, 60m: ${projected60}/${fiveMinRows.length}`
	)

	for (const { timeframeCode } of FILES) {
		const tfId = timeframeIdByCode.get(timeframeCode)!
		const rows = parsedByTf.get(timeframeCode) ?? []

		// Idempotent wipe for this (asset, timeframe)
		await sql`
			DELETE FROM price_candles
			WHERE asset_id = ${assetId} AND timeframe_id = ${tfId}
		`

		// Batched insert via UNNEST — Neon's network RTT makes one-row inserts
		// painfully slow on 16K-row 5m files. UNNEST sends arrays once and the
		// server expands them into rows. Keeps the same per-row column shape so
		// the existing JSONB indicators encoding still works.
		const BATCH = 500
		let inserted = 0
		for (let i = 0; i < rows.length; i += BATCH) {
			const slice = rows.slice(i, i + BATCH)
			const timestamps = slice.map((r) => r.timestamp.toISOString())
			const opens = slice.map((r) => r.open)
			const highs = slice.map((r) => r.high)
			const lows = slice.map((r) => r.low)
			const closes = slice.map((r) => r.close)
			const candleIndexes = slice.map((r) => r.candleIndex)
			const indicatorsJson = slice.map((r) => JSON.stringify(r.indicators))
			await sql`
				INSERT INTO price_candles (asset_id, timeframe_id, timestamp, open, high, low, close, candle_index, indicators)
				SELECT ${assetId}::uuid, ${tfId}::uuid, t::timestamptz, o, h, l, c, ci, ind::jsonb
				FROM unnest(
					${timestamps}::text[],
					${opens}::numeric[],
					${highs}::numeric[],
					${lows}::numeric[],
					${closes}::numeric[],
					${candleIndexes}::int[],
					${indicatorsJson}::text[]
				) AS u(t, o, h, l, c, ci, ind)
			`
			inserted += slice.length
		}

		// Register the freshly-loaded (asset, timeframe) in the catalog so the
		// backtest UI's asset/timeframe picker can find it. Without this row the
		// dropdown stays empty even though price_candles is fully populated.
		await sql`
			INSERT INTO price_data_versions (asset_id, timeframe_id, version, row_count, last_imported_at, updated_at)
			VALUES (${assetId}, ${tfId}, 1, ${inserted}, NOW(), NOW())
			ON CONFLICT (asset_id, timeframe_id) DO UPDATE SET
				version = price_data_versions.version + 1,
				row_count = EXCLUDED.row_count,
				last_imported_at = EXCLUDED.last_imported_at,
				updated_at = EXCLUDED.updated_at
		`

		console.log(`  ${timeframeCode}: ${inserted} candles`)
	}

	// Renko brick sizes (weekly). Reuses the production server action so the
	// upsert logic stays in one place. The action's `dbWs` connection picks up
	// the same DATABASE_URL we just read.
	try {
		const csvText = readFileSync(RENKO_SIZES_PATH, "utf8")
		const result = await importHawksRenkoSizes(csvText)
		if (result.success) {
			console.log(`  renko-sizes: ${result.imported} weeks`)
		} else {
			console.error(`  renko-sizes FAILED: ${result.error}`)
		}
	} catch (err) {
		console.error(
			`  renko-sizes FAILED to read ${RENKO_SIZES_PATH}:`,
			err instanceof Error ? err.message : err
		)
	}

	// Close postgres-js pool so the process exits
	if (!isNeonUrl(databaseUrl)) {
		await (sql as ReturnType<typeof postgres>).end()
	}
}

run().catch((err) => {
	console.error(err)
	process.exit(1)
})
