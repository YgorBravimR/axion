import "dotenv/config"
import { readFileSync } from "node:fs"
import { neon } from "@neondatabase/serverless"
import postgres from "postgres"
import { isNeonUrl } from "@/db/url"

const ADMIN_EMAIL = "admin@axion.com"
const ASSET_SYMBOL = "WIN"

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
	indicatorColumns: IndicatorColumn[]
}[] = [
	{
		timeframeCode: "5m",
		path: "/Users/ygorbravim/Downloads/hawk-renkos(5m).csv",
		// 5m file is pre-joined and carries direct cross-timeframe columns
		// (`MME27 60m`, `MME55 60m`, `MME55 15m`, `MME27 15m`). Hawks v0 doesn't
		// run on this timeframe, but we capture them so future presets that key
		// off 5m don't need a second ingest pass.
		indicatorColumns: [
			{ index: 5, key: "mme27_60m" },
			{ index: 6, key: "mme55_60m" },
			{ index: 7, key: "mme55_15m" },
			{ index: 8, key: "mme27_15m" },
			{ index: 17, key: "macd" },
		],
	},
	{
		timeframeCode: "15m",
		path: "/Users/ygorbravim/Downloads/hawk-renkos(15m).csv",
		indicatorColumns: [
			{ index: 5, key: "mme27_15m" },
			{ index: 6, key: "mme55_15m" },
			{ index: 9, key: "macd_15m" },
		],
	},
	{
		timeframeCode: "1h",
		path: "/Users/ygorbravim/Downloads/hawk-renkos(60m).csv",
		indicatorColumns: [
			{ index: 5, key: "mme27_60m" },
			{ index: 6, key: "mme55_60m" },
			{ index: 10, key: "macd" },
		],
	},
]

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
	indicators: Record<string, number>
}

const parseRow = (
	line: string,
	indicatorColumns: IndicatorColumn[]
): ParsedRow | null => {
	const cols = line.split(";")
	if (cols.length < 5) {
		return null
	}
	const date = cols[0]
	if (!date) {
		return null
	}
	const open = Number(cols[1])
	const high = Number(cols[2])
	const low = Number(cols[3])
	const close = Number(cols[4])
	if ([open, high, low, close].some((v) => !Number.isFinite(v))) {
		return null
	}
	const indicators: Record<string, number> = {}
	for (const { index, key } of indicatorColumns) {
		const v = parseBrNumber(cols[index])
		if (v !== null) {
			indicators[key] = v
		}
	}
	return { timestamp: parseDate(date), open, high, low, close, indicators }
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
	for (const { timeframeCode, path, indicatorColumns } of FILES) {
		const text = decodeLatin1(path)
		const lines = text.split(/\r?\n/).filter(Boolean)
		const rows = lines
			.slice(1)
			.map((line) => parseRow(line, indicatorColumns))
			.filter((r): r is ParsedRow => r !== null)
			.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
		parsedByTf.set(timeframeCode, rows)
	}

	// Forward-fill: each 60m candle needs `mme27_15m` from the most-recent 15m
	// row at-or-before its timestamp. The Hawks engine reads all four required
	// keys from a single candle's JSONB, so this join has to happen at ingest
	// — the runtime never crosses timeframes.
	const fifteenMinRows = parsedByTf.get("15m") ?? []
	const sixtyMinRows = parsedByTf.get("1h") ?? []
	let filled = 0
	for (const row of sixtyMinRows) {
		const idx = findFloorIndex(fifteenMinRows, row.timestamp.getTime())
		if (idx < 0) {
			continue
		}
		const src = fifteenMinRows[idx]!.indicators
		if (typeof src.mme27_15m === "number") {
			row.indicators.mme27_15m = src.mme27_15m
			filled++
		}
		if (typeof src.mme55_15m === "number") {
			row.indicators.mme55_15m = src.mme55_15m
		}
	}
	console.log(
		`Forward-filled mme27_15m onto ${filled}/${sixtyMinRows.length} 60m candles`
	)

	for (const { timeframeCode } of FILES) {
		const tfId = timeframeIdByCode.get(timeframeCode)!
		const rows = parsedByTf.get(timeframeCode) ?? []

		// Idempotent wipe for this (asset, timeframe)
		await sql`
			DELETE FROM price_candles
			WHERE asset_id = ${assetId} AND timeframe_id = ${tfId}
		`

		// Insert one row at a time — local-dev script, simplicity beats throughput
		// at 5K rows. Both postgres-js and neon support parameterised inserts.
		let inserted = 0
		for (const r of rows) {
			// Pass the JS object directly. postgres-js auto-encodes objects to
			// jsonb wire format; pre-stringifying causes a double-encode that
			// stores `"{...}"` as a JSON string scalar instead of a JSON object,
			// which breaks all `->`/`->>` access at read time.
			await sql`
				INSERT INTO price_candles (asset_id, timeframe_id, timestamp, open, high, low, close, indicators)
				VALUES (${assetId}, ${tfId}, ${r.timestamp.toISOString()}, ${r.open}, ${r.high}, ${r.low}, ${r.close}, ${r.indicators as never})
			`
			inserted++
		}
		console.log(`  ${timeframeCode}: ${inserted} candles`)
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
