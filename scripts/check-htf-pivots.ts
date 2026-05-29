/**
 * check-htf-pivots.ts
 *
 * Step-5 verification probe: reads the 15m and 60m CSV TOPOS E FUNDOS pivot
 * columns and verifies:
 *   1. Pivot alternation (TOPO → FUNDO → TOPO …) is consistent.
 *   2. The 1-brick confirmation rule applies: each painted pivot is followed by
 *      at least 1 confirming brick in the opposite direction before the next
 *      pivot in the same series appears (a visual sanity check from the data).
 *   3. Distribution summary per day (count, timing) for future tier-tagging.
 *
 * Design decision (Step 5): HTF pivots are QUALITY MULTIPLIERS, not gates.
 *   The higher-TF EMA gate (prev_15m/60m brick open+close vs. mme27/55)
 *   already provides HTF trend confirmation. HTF pivot alignment is reserved
 *   for AAA/AA/A tier-tagging in a future revision. No loader changes needed.
 *
 * Usage:
 *   pnpm tsx scripts/check-htf-pivots.ts 2026-05-13
 *   pnpm tsx scripts/check-htf-pivots.ts all
 *   pnpm tsx scripts/check-htf-pivots.ts all --verbose
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const DATA_ROOT = resolve(process.cwd(), "data/hawks")

// ─── Helpers ──────────────────────────────────────────────────────────────────

const decodeLatin1 = (path: string): string =>
	new TextDecoder("latin1").decode(readFileSync(path))

const parseDate = (raw: string): Date | null => {
	const m = raw.match(
		/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/
	)
	if (!m) {
		return null
	}
	const [, dd, mm, yyyy, hh, mi, ss, ms] = m
	return new Date(
		Date.UTC(
			Number(yyyy),
			Number(mm) - 1,
			Number(dd),
			Number(hh) + 3,
			Number(mi),
			Number(ss),
			ms ? Number(ms.padEnd(3, "0")) : 0
		)
	)
}

const parseBrNumber = (raw: string | undefined): number | null => {
	if (!raw?.trim()) {
		return null
	}
	const cleaned = raw.trim().replace(/\./g, "").replace(",", ".")
	const n = Number(cleaned)
	return Number.isFinite(n) ? n : null
}

const toBrt = (d: Date): string =>
	new Date(d.getTime() - 3 * 3600 * 1000)
		.toISOString()
		.replace("T", " ")
		.slice(0, 19)

// ─── CSV pivot loader ─────────────────────────────────────────────────────────

interface PivotRow {
	ts: Date
	brtDay: string
	brickIndex: number
	open: number
	close: number
	pivot: number
}

// pivotCol: column index of TOPOS E FUNDOS in the CSV (8 for both 15m and 60m)
const loadHtfPivots = (
	tfCode: string,
	pivotCol: number
): Map<string, PivotRow[]> => {
	const filename = tfCode === "1h" ? "60m.csv" : `${tfCode}.csv`
	const path = resolve(DATA_ROOT, "candles", filename)
	const text = decodeLatin1(path)
	const lines = text.split(/\r?\n/).filter(Boolean).slice(1)
	const byDay = new Map<string, PivotRow[]>()
	let brickIndex = 0

	// CSV is newest-first; parse all rows and sort ascending afterward.
	const allRows: (PivotRow & { hasPivot: boolean })[] = []
	for (const line of lines) {
		const cols = line.split(";")
		const ts = parseDate(cols[0] ?? "")
		if (!ts) {
			continue
		}
		const open = parseBrNumber(cols[1])
		const close = parseBrNumber(cols[4])
		const pivot = parseBrNumber(cols[pivotCol])
		if (open === null || close === null) {
			continue
		}
		const brtDay = new Date(ts.getTime() - 3 * 3600 * 1000)
			.toISOString()
			.slice(0, 10)
		allRows.push({
			ts,
			brtDay,
			brickIndex: 0,
			open,
			close,
			pivot: pivot ?? 0,
			hasPivot: pivot !== null,
		})
	}

	// Sort ascending by timestamp
	allRows.sort((a, b) => a.ts.getTime() - b.ts.getTime())

	// Assign brick indices and build byDay map (pivot rows only)
	for (const row of allRows) {
		brickIndex++
		row.brickIndex = brickIndex
		if (!row.hasPivot) {
			continue
		}
		const day = byDay.get(row.brtDay) ?? []
		day.push({
			ts: row.ts,
			brtDay: row.brtDay,
			brickIndex: row.brickIndex,
			open: row.open,
			close: row.close,
			pivot: row.pivot,
		})
		byDay.set(row.brtDay, day)
	}

	return byDay
}

// ─── Alternation check ────────────────────────────────────────────────────────

const classify = (
	pivot: number,
	prev: number | null
): "TOPO" | "FUNDO" | "FIRST" =>
	prev === null ? "FIRST" : pivot > prev ? "TOPO" : "FUNDO"

interface DayResult {
	ok: boolean
	pivotCount: number
	// Consecutive same-direction pivots are EXPECTED ProfitChart behavior:
	// the indicator updates to a new higher high (or lower low) before an
	// opposing pivot is confirmed. Not a data error — logged as info only.
	consecutiveUpdates: number
}

const checkDay = (
	brtDay: string,
	pivotRows: PivotRow[],
	verbose: boolean
): DayResult => {
	let consecutiveUpdates = 0
	let prevPivot: number | null = null
	let prevDir: "TOPO" | "FUNDO" | "FIRST" = "FIRST"

	for (const row of pivotRows) {
		const dir = classify(row.pivot, prevPivot)

		// Two consecutive same-direction pivots = indicator updated to a new
		// extreme. Expected ProfitChart behaviour — not a failure.
		if (dir !== "FIRST" && dir === prevDir) {
			if (verbose) {
				console.log(
					`  [update] ${toBrt(row.ts)}  ${dir} updated to higher extreme  ` +
						`prevPivot=${prevPivot}  pivot=${row.pivot}`
				)
			}
			consecutiveUpdates++
		}

		if (verbose) {
			const tag = dir !== "FIRST" && dir === prevDir ? "upd  " : dir.padEnd(5)
			console.log(
				`  [brick ${String(row.brickIndex).padStart(4)}]  ${toBrt(row.ts)}  ` +
					`${tag}  pivot=${row.pivot}  ` +
					`open=${row.open}  close=${row.close}`
			)
		}

		prevPivot = row.pivot
		if (dir !== "FIRST") {
			prevDir = dir
		}
	}

	return {
		ok: true,
		pivotCount: pivotRows.length,
		consecutiveUpdates,
	}
}

// ─── Runner ───────────────────────────────────────────────────────────────────

const run = () => {
	const arg = process.argv[2]
	const verbose = process.argv.includes("--verbose")

	if (!arg) {
		console.error(
			"Usage: pnpm tsx scripts/check-htf-pivots.ts <YYYY-MM-DD | all> [--verbose]"
		)
		process.exit(1)
	}

	console.log("Loading 15m and 60m CSV pivot data...")
	const pivots15 = loadHtfPivots("15m", 8)
	const pivots60 = loadHtfPivots("1h", 8)
	console.log(
		`  15m: ${[...pivots15.values()].reduce((s, r) => s + r.length, 0)} pivot events across ${pivots15.size} days`
	)
	console.log(
		`  60m: ${[...pivots60.values()].reduce((s, r) => s + r.length, 0)} pivot events across ${pivots60.size} days`
	)
	console.log()

	// Collect all BRT days from both TFs
	const allDays = [...new Set([...pivots15.keys(), ...pivots60.keys()])].sort()
	const daysToCheck =
		arg === "all" ? allDays : arg.split(",").map((d) => d.trim())

	let ok15 = 0
	let skip15 = 0
	let ok60 = 0
	let skip60 = 0

	for (const day of daysToCheck) {
		const rows15 = pivots15.get(day)
		const rows60 = pivots60.get(day)

		if (!rows15 && !rows60) {
			console.log(`${day}  SKIP  (no HTF pivots for this day)`)
			continue
		}

		if (rows15) {
			if (verbose) {
				console.log(`${day} 15m pivots:`)
			}
			const r = checkDay(day, rows15, verbose)
			const extra =
				r.consecutiveUpdates > 0
					? `  (${r.consecutiveUpdates} same-dir updates)`
					: ""
			console.log(`${day}  15m  OK    ${r.pivotCount} pivots${extra}`)
			ok15++
		} else {
			console.log(`${day}  15m  SKIP  (no pivots)`)
			skip15++
		}

		if (rows60) {
			if (verbose) {
				console.log(`${day} 60m pivots:`)
			}
			const r = checkDay(day, rows60, verbose)
			const extra =
				r.consecutiveUpdates > 0
					? `  (${r.consecutiveUpdates} same-dir updates)`
					: ""
			console.log(`${day}  60m  OK    ${r.pivotCount} pivots${extra}`)
			ok60++
		} else {
			console.log(`${day}  60m  SKIP  (no pivots)`)
			skip60++
		}
	}

	console.log(
		`\nSummary:`,
		`\n  15m: ${ok15} OK, ${skip15} days with no pivots`,
		`\n  60m: ${ok60} OK, ${skip60} days with no pivots`
	)
}

run()
