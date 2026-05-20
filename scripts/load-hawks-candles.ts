import "dotenv/config"
import { readFileSync } from "node:fs"
import { neon } from "@neondatabase/serverless"
import postgres from "postgres"
import { isNeonUrl } from "@/db/url"

const ADMIN_EMAIL = "admin@axion.com"
const ASSET_SYMBOL = "WIN"

const FILES: { timeframeCode: string; path: string }[] = [
	{
		timeframeCode: "5m",
		path: "/Users/ygorbravim/Downloads/hawk-renkos(5m).csv",
	},
	{
		timeframeCode: "15m",
		path: "/Users/ygorbravim/Downloads/hawk-renkos(15m).csv",
	},
	{
		timeframeCode: "1h",
		path: "/Users/ygorbravim/Downloads/hawk-renkos(60m).csv",
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

const parseRow = (line: string) => {
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
	return { timestamp: parseDate(date), open, high, low, close }
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

	for (const { timeframeCode, path } of FILES) {
		const tfId = timeframeIdByCode.get(timeframeCode)!
		const text = decodeLatin1(path)
		const lines = text.split(/\r?\n/).filter(Boolean)
		const rows = lines
			.slice(1)
			.map(parseRow)
			.filter((r): r is NonNullable<ReturnType<typeof parseRow>> => r !== null)
			.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

		// Idempotent wipe for this (asset, timeframe)
		await sql`
			DELETE FROM price_candles
			WHERE asset_id = ${assetId} AND timeframe_id = ${tfId}
		`

		// Insert one row at a time — local-dev script, simplicity beats throughput
		// at 5K rows. Both postgres-js and neon support parameterised inserts.
		let inserted = 0
		for (const r of rows) {
			await sql`
				INSERT INTO price_candles (asset_id, timeframe_id, timestamp, open, high, low, close)
				VALUES (${assetId}, ${tfId}, ${r.timestamp.toISOString()}, ${r.open}, ${r.high}, ${r.low}, ${r.close})
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
