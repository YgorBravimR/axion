/**
 * Probe Hawks 5m Renko candles in R2/local Parquet for "monster" bricks.
 * Reads parquet via DuckDB directly to bypass the top-level-await in
 * @/db/drizzle that breaks tsx in CJS mode.
 *
 * Outputs:
 *   - Median brick range
 *   - Top-30 widest-range bricks
 *   - Out-of-order timestamps (if any)
 *   - Bricks whose body sits outside [low, high]
 *   - Bricks with huge open-to-prev-close jumps
 */
import "dotenv/config"
import { resolve } from "node:path"
import { existsSync } from "node:fs"
import { DuckDBInstance } from "@duckdb/node-api"

const ASSET = "WIN"
const TF_CODE = "hawk_5m_win"

const stripScheme = (e: string): string => e.replace(/^https?:\/\//i, "")

const main = async () => {
	const basePath =
		process.env.CANDLE_STORE_DUCKDB_BASE_PATH ?? "data/parquet/candles"
	const isRemote = basePath.startsWith("s3://")
	const parquetPath = isRemote
		? `${basePath}/${TF_CODE}/${ASSET}.parquet`
		: resolve(`${basePath}/${TF_CODE}/${ASSET}.parquet`)

	if (!isRemote && !existsSync(parquetPath)) {
		throw new Error(`local parquet not found: ${parquetPath}`)
	}

	console.log(`reading: ${parquetPath}`)

	const instance = await DuckDBInstance.create(":memory:")
	const conn = await instance.connect()

	if (isRemote) {
		await conn.run("INSTALL httpfs")
		await conn.run("LOAD httpfs")
		const endpoint = process.env.S3_ENDPOINT
		const accessKeyId = process.env.S3_ACCESS_KEY_ID
		const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY
		const region = process.env.S3_REGION ?? "auto"
		if (!endpoint || !accessKeyId || !secretAccessKey) {
			throw new Error("S3_* envs missing for remote read")
		}
		await conn.run(`SET s3_endpoint='${stripScheme(endpoint)}'`)
		await conn.run(`SET s3_region='${region}'`)
		await conn.run(`SET s3_url_style='path'`)
		await conn.run(`SET s3_use_ssl=true`)
		await conn.run(`SET s3_access_key_id='${accessKeyId}'`)
		await conn.run(`SET s3_secret_access_key='${secretAccessKey}'`)
	}

	const safe = parquetPath.replace(/'/g, "''")
	const result = await conn.runAndReadAll(
		`SELECT timestamp, open, high, low, close
		 FROM read_parquet('${safe}')
		 ORDER BY timestamp ASC`
	)
	const rows = result.getRowObjects() as Array<{
		timestamp: Date | string
		open: number | bigint
		high: number | bigint
		low: number | bigint
		close: number | bigint
	}>
	console.log(`Loaded ${rows.length} candles`)
	if (rows.length === 0) {
		process.exit(0)
	}

	// Normalize: bigint → number, Date → ISO string for stable diff math.
	const norm = rows.map((r) => ({
		ts:
			r.timestamp instanceof Date
				? r.timestamp.toISOString()
				: String(r.timestamp),
		tsMs:
			r.timestamp instanceof Date
				? r.timestamp.getTime()
				: new Date(String(r.timestamp)).getTime(),
		o: Number(r.open),
		h: Number(r.high),
		l: Number(r.low),
		c: Number(r.close),
	}))

	const ranges = norm.map((r) => r.h - r.l)
	const sortedRanges = [...ranges].sort((a, b) => a - b)
	const median = sortedRanges[Math.floor(sortedRanges.length / 2)]!
	const p99 = sortedRanges[Math.floor(sortedRanges.length * 0.99)]!
	const max = sortedRanges[sortedRanges.length - 1]!
	console.log(
		`Range stats — median=${median.toFixed(0)}, p99=${p99.toFixed(0)}, max=${max.toFixed(0)}`
	)

	const indexed = norm.map((r, i) => ({ i, ...r, range: r.h - r.l }))
	const widest = [...indexed].sort((a, b) => b.range - a.range).slice(0, 30)
	console.log("\nTop-30 widest bricks:")
	for (const w of widest) {
		console.log(
			`  i=${w.i} ts=${w.ts} O=${w.o.toFixed(0)} H=${w.h.toFixed(0)} L=${w.l.toFixed(0)} C=${w.c.toFixed(0)} range=${w.range.toFixed(0)}`
		)
	}

	let outOfOrder = 0
	for (let i = 1; i < norm.length; i++) {
		if (norm[i]!.tsMs <= norm[i - 1]!.tsMs) {
			outOfOrder += 1
			if (outOfOrder <= 10) {
				console.log(
					`  ⚠ out-of-order i=${i}: ${norm[i - 1]!.ts} → ${norm[i]!.ts}`
				)
			}
		}
	}
	console.log(`\nOut-of-order timestamps: ${outOfOrder}`)

	// Epoch-zero / pre-2020 / future bricks — the screenshot showed a
	// "01 Jan '70" tick label, which is unix epoch. Any candle whose ts
	// resolves to <2020 or >2030 is junk and almost certainly corrupted.
	let epochish = 0
	const EPOCH_MIN = new Date("2020-01-01").getTime()
	const EPOCH_MAX = new Date("2030-01-01").getTime()
	for (let i = 0; i < norm.length; i++) {
		const ms = norm[i]!.tsMs
		if (ms < EPOCH_MIN || ms > EPOCH_MAX) {
			epochish += 1
			if (epochish <= 10) {
				console.log(
					`  ⚠ ts out of [2020..2030] i=${i}: ${norm[i]!.ts}  O=${norm[i]!.o.toFixed(0)} C=${norm[i]!.c.toFixed(0)}`
				)
			}
		}
	}
	console.log(`Bricks with bad-range timestamps: ${epochish}`)

	// Duplicate-tick clusters — same exact ts repeated. Acceptable in
	// fast tape, but a HUGE cluster (>10) at the same ts is the kind
	// of corruption that lets a "01 Jan '70" label cover a wide range.
	const clusters = new Map<number, number>()
	for (const r of norm) {
		clusters.set(r.tsMs, (clusters.get(r.tsMs) ?? 0) + 1)
	}
	const bigClusters = [...clusters.entries()]
		.filter(([, n]) => n > 5)
		.sort((a, b) => b[1] - a[1])
	console.log(
		`\nDuplicate-ts clusters (>5 bricks at same ts): ${bigClusters.length}`
	)
	for (const [ms, n] of bigClusters.slice(0, 10)) {
		console.log(`  ${new Date(ms).toISOString()}  ×${n}`)
	}

	let bodyOutside = 0
	for (const r of norm) {
		if (r.o < r.l || r.o > r.h || r.c < r.l || r.c > r.h) {
			bodyOutside += 1
			if (bodyOutside <= 10) {
				console.log(
					`  ⚠ body outside H/L: ts=${r.ts} O=${r.o} H=${r.h} L=${r.l} C=${r.c}`
				)
			}
		}
	}
	console.log(`Bricks with body outside H/L: ${bodyOutside}`)

	let stepBack = 0
	for (let i = 1; i < norm.length; i++) {
		const prev = norm[i - 1]!
		const cur = norm[i]!
		const gap = Math.abs(cur.o - prev.c)
		if (gap > median * 10) {
			stepBack += 1
			if (stepBack <= 10) {
				console.log(
					`  ⚠ huge open-to-prev-close jump i=${i}: ${prev.ts} → ${cur.ts}, ${prev.c.toFixed(0)} → ${cur.o.toFixed(0)} (gap=${gap.toFixed(0)})`
				)
			}
		}
	}
	console.log(
		`\nBricks with huge open-to-prev-close jump (> 10× median): ${stepBack}`
	)

	process.exit(0)
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
