/**
 * backfill-pivots.ts — populate `asset_pivots` for every (asset, Renko TF)
 * pair currently present on disk.
 *
 * For each `data/parquet/candles/<tf_code>/<asset_symbol>.parquet`:
 *   1. Resolve `(asset_id, timeframe_id)` from the DB.
 *   2. Read the parquet stream (timestamp + OHLC only — pivots ignore
 *      indicators).
 *   3. Run `detectRenkoPivots(bricks, N)` for N in 1..6 in a single sweep
 *      via `detectRenkoPivotsAllN`.
 *   4. Upsert rows with `ON CONFLICT (asset_id, timeframe_id,
 *      confirmation_n, brick_index) DO NOTHING` so re-runs are idempotent.
 *      Schema-level cascade-delete is the right path to reset stale rows
 *      after an algorithm-version bump — this script does NOT delete.
 *   5. After every (asset, tf) finishes, assert the price-match
 *      invariant + count-monotonicity invariant on the freshly-written
 *      rows. Throws on violation.
 *
 * Scope (v1, Renko only): timeframe codes matching `^(R\d+|hawk_)`. Other
 * codes are skipped — time-based detection is a separate algorithm filed
 * in the backlog.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-pivots.ts                      # backfill everything
 *   pnpm tsx scripts/backfill-pivots.ts hawk_5m_win          # one TF only
 *   pnpm tsx scripts/backfill-pivots.ts hawk_5m_win WIN      # one (TF, asset)
 *
 * The script is idempotent. To rerun against a new algorithm version,
 * delete the existing rows for that (asset, tf) first (or wait for the
 * scheduled cascade-on-reload trigger when that ships).
 */

import "dotenv/config"
import { existsSync, readdirSync, statSync } from "node:fs"
import { resolve } from "node:path"
import { DuckDBInstance } from "@duckdb/node-api"
import { neon } from "@neondatabase/serverless"
import postgres from "postgres"
import { isNeonUrl } from "@/db/url"
import {
	ALGORITHM_VERSION,
	detectRenkoPivotsAllN,
	type PivotBrick,
} from "@/lib/pivots/detect-renko"

const PARQUET_ROOT = resolve(process.cwd(), "data/parquet/candles")
const RENKO_CODE_REGEX = /^(R\d+|hawk_)/

interface Brick extends PivotBrick {
	timestamp: string
}

const toNumber = (v: unknown): number => {
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
	return Number(v)
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
		const { micros } = v as { micros: number | bigint }
		return new Date(Number(micros) / 1000).toISOString()
	}
	throw new Error(`unparseable timestamp ${String(v)}`)
}

const readBricks = async (parquetPath: string): Promise<Brick[]> => {
	const instance = await DuckDBInstance.create(":memory:")
	const conn = await instance.connect()
	const reader = await conn.runAndReadAll(
		`SELECT timestamp, open, high, low, close
		 FROM read_parquet('${parquetPath.replace(/'/g, "''")}')
		 ORDER BY timestamp ASC`
	)
	const rows = reader.getRowObjects()
	return rows.map((row) => ({
		timestamp: toIsoString(row.timestamp),
		open: toNumber(row.open),
		high: toNumber(row.high),
		low: toNumber(row.low),
		close: toNumber(row.close),
	}))
}

const listParquetTargets = (
	filterTfCode?: string,
	filterAssetSymbol?: string
): Array<{ tfCode: string; assetSymbol: string; parquetPath: string }> => {
	if (!existsSync(PARQUET_ROOT)) {
		throw new Error(`parquet root missing: ${PARQUET_ROOT}`)
	}
	const tfDirs = readdirSync(PARQUET_ROOT).filter((dir) => {
		if (!RENKO_CODE_REGEX.test(dir)) {
			return false
		}
		if (filterTfCode && dir !== filterTfCode) {
			return false
		}
		return statSync(resolve(PARQUET_ROOT, dir)).isDirectory()
	})
	const out: Array<{
		tfCode: string
		assetSymbol: string
		parquetPath: string
	}> = []
	for (const tfCode of tfDirs) {
		const tfDir = resolve(PARQUET_ROOT, tfCode)
		for (const file of readdirSync(tfDir)) {
			if (!file.endsWith(".parquet")) {
				continue
			}
			const assetSymbol = file.replace(/\.parquet$/, "")
			if (filterAssetSymbol && assetSymbol !== filterAssetSymbol) {
				continue
			}
			out.push({
				tfCode,
				assetSymbol,
				parquetPath: resolve(tfDir, file),
			})
		}
	}
	return out
}

type Sql = ReturnType<typeof neon> | ReturnType<typeof postgres>

const resolveIds = async (
	sql: Sql,
	assetSymbol: string,
	tfCode: string
): Promise<{ assetId: string; timeframeId: string } | null> => {
	const assetRows = (await sql`
		SELECT id FROM assets WHERE symbol = ${assetSymbol} LIMIT 1
	`) as Array<{ id: string }>
	const tfRows = (await sql`
		SELECT id FROM timeframes WHERE code = ${tfCode} LIMIT 1
	`) as Array<{ id: string }>
	if (assetRows.length === 0 || tfRows.length === 0) {
		return null
	}
	return { assetId: assetRows[0]!.id, timeframeId: tfRows[0]!.id }
}

const writePivots = async (
	sql: Sql,
	assetId: string,
	timeframeId: string,
	bricks: ReadonlyArray<Brick>,
	allN: Record<
		number,
		ReadonlyArray<{
			type: "topo" | "fundo"
			price: number
			peakBrickIdx: number
			confirmationBrickIdx: number
		}>
	>
): Promise<number> => {
	let written = 0
	for (let n = 1; n <= 6; n++) {
		const pivots = allN[n] ?? []
		if (pivots.length === 0) {
			continue
		}
		// Batch into chunks of ~500 rows to keep statement size sane.
		const CHUNK = 500
		for (let i = 0; i < pivots.length; i += CHUNK) {
			const chunk = pivots.slice(i, i + CHUNK)
			const rows = chunk.map((p) => {
				const brick = bricks[p.peakBrickIdx]!
				return {
					assetId,
					timeframeId,
					confirmationN: n,
					brickIndex: p.peakBrickIdx,
					pivotType: p.type,
					pivotPrice: p.price.toString(),
					pivotTimestamp: brick.timestamp,
					algorithmVersion: ALGORITHM_VERSION,
				}
			})
			// neon's tagged-template SQL doesn't trivially do bulk insert with
			// a single placeholder; build a multi-row VALUES clause manually.
			// All values are pre-validated (uuids from DB, finite numbers,
			// fixed enum strings) so injection surface is minimal — but still
			// use parameterized placeholders.
			const placeholders: string[] = []
			const params: unknown[] = []
			let p = 1
			for (const r of rows) {
				placeholders.push(
					`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`
				)
				params.push(
					r.assetId,
					r.timeframeId,
					r.confirmationN,
					r.brickIndex,
					r.pivotType,
					r.pivotPrice,
					r.pivotTimestamp,
					r.algorithmVersion
				)
			}
			const stmt = `INSERT INTO asset_pivots
				(asset_id, timeframe_id, confirmation_n, brick_index,
				 pivot_type, pivot_price, pivot_timestamp, algorithm_version)
				VALUES ${placeholders.join(", ")}
				ON CONFLICT (asset_id, timeframe_id, confirmation_n, brick_index)
				DO NOTHING`
			if ("query" in sql) {
				await (sql as ReturnType<typeof neon>).query(stmt, params)
			} else {
				await (sql as ReturnType<typeof postgres>).unsafe(stmt, params)
			}
			written += rows.length
		}
	}
	return written
}

const assertInvariants = (
	bricks: ReadonlyArray<Brick>,
	allN: Record<
		number,
		ReadonlyArray<{
			type: "topo" | "fundo"
			price: number
			peakBrickIdx: number
		}>
	>,
	label: string
): void => {
	// Price-match invariant: every emitted price equals the brick's high/low.
	for (let n = 1; n <= 6; n++) {
		for (const p of allN[n] ?? []) {
			const brick = bricks[p.peakBrickIdx]
			if (!brick) {
				throw new Error(
					`${label} N=${n}: peakBrickIdx ${p.peakBrickIdx} out of range (bricks.length=${bricks.length})`
				)
			}
			const expected = p.type === "topo" ? brick.high : brick.low
			if (p.price !== expected) {
				throw new Error(
					`${label} N=${n} brick=${p.peakBrickIdx} type=${p.type}: price ${p.price} ≠ expected ${expected}`
				)
			}
		}
	}
	// Count-monotonicity invariant.
	for (let k = 1; k <= 5; k++) {
		const lower = allN[k]?.length ?? 0
		const higher = allN[k + 1]?.length ?? 0
		if (higher > lower) {
			throw new Error(
				`${label} count-monotonicity: |N=${k + 1}|=${higher} > |N=${k}|=${lower}`
			)
		}
	}
}

const main = async () => {
	const databaseUrl = process.env.DATABASE_URL
	if (!databaseUrl) {
		console.error("DATABASE_URL missing")
		process.exit(1)
	}
	const sql = isNeonUrl(databaseUrl) ? neon(databaseUrl) : postgres(databaseUrl)

	const tfFilter = process.argv[2]
	const assetFilter = process.argv[3]
	const targets = listParquetTargets(tfFilter, assetFilter)
	if (targets.length === 0) {
		console.error(
			`No targets matched ${tfFilter ?? "<any tf>"} / ${assetFilter ?? "<any asset>"}`
		)
		process.exit(1)
	}

	console.log(
		`Backfilling pivots for ${targets.length} (asset, tf) pair(s), algorithm=${ALGORITHM_VERSION}\n`
	)
	let totalWritten = 0
	const skipped: string[] = []

	for (const t of targets) {
		const label = `${t.assetSymbol}/${t.tfCode}`
		const ids = await resolveIds(sql, t.assetSymbol, t.tfCode)
		if (!ids) {
			console.log(`  ${label}: skipped (no DB row for asset/timeframe)`)
			skipped.push(label)
			continue
		}
		const t0 = performance.now()
		const bricks = await readBricks(t.parquetPath)
		const tRead = performance.now() - t0
		if (bricks.length === 0) {
			console.log(`  ${label}: skipped (empty parquet)`)
			continue
		}
		const t1 = performance.now()
		const allN = detectRenkoPivotsAllN(bricks)
		const tDetect = performance.now() - t1
		assertInvariants(bricks, allN, label)
		const t2 = performance.now()
		const written = await writePivots(
			sql,
			ids.assetId,
			ids.timeframeId,
			bricks,
			allN
		)
		const tWrite = performance.now() - t2

		const counts = Array.from(
			{ length: 6 },
			(_, idx) => allN[idx + 1]?.length ?? 0
		)
		console.log(
			`  ${label}: bricks=${bricks.length} pivots(N=1..6)=[${counts.join(",")}] ` +
				`read=${tRead.toFixed(0)}ms detect=${tDetect.toFixed(0)}ms ` +
				`write=${tWrite.toFixed(0)}ms wrote=${written}`
		)
		totalWritten += written
	}

	console.log(
		`\nDone. Wrote ${totalWritten} pivot rows across ${targets.length - skipped.length} (asset, tf) pair(s).`
	)
	if (skipped.length > 0) {
		console.log(`Skipped ${skipped.length}: ${skipped.join(", ")}`)
	}

	// Final cross-table sanity check: confirm written counts match detector output.
	const verifyRows = (await sql`
		SELECT confirmation_n, COUNT(*)::int AS n
		FROM asset_pivots
		WHERE algorithm_version = ${ALGORITHM_VERSION}
		GROUP BY confirmation_n
		ORDER BY confirmation_n ASC
	`) as Array<{ confirmation_n: number; n: number }>
	console.log(
		`\nDB pivot counts by N (algorithm_version=${ALGORITHM_VERSION}):`
	)
	for (const r of verifyRows) {
		console.log(`  N=${r.confirmation_n}: ${r.n}`)
	}

	process.exit(0)
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
