/**
 * probe-catalog-coverage.ts
 *
 * Audits the user-entries catalog as the matchRate denominator. Answers:
 *   - How many (date, brickIndex) targets does any Hawks engine have to hit
 *     to score matchRate = 1.0?
 *   - What is the per-day catalog density (entries / day)?
 *   - What direction split do those targets carry?
 *   - Which days have NO catalog entries (matchRate will silently penalize
 *     engine fires on those days as false positives)?
 *
 * Why this exists: the 8,352-run audit showed best matchRate = 0.56% across
 * the entire sweep. Before pair-tuning the Hawks gate with Pedro, we need to
 * see the denominator clearly — a sparse catalog ceiling-caps matchRate
 * regardless of engine quality, and `audit-catalog-results.ts` only looks at
 * outcomes (GA/BE/ST), not entry coverage.
 *
 * Pure script — no DB, no engine. Just JSON + filesystem.
 *
 * Usage:
 *   pnpm tsx scripts/probe-catalog-coverage.ts
 *   pnpm tsx scripts/probe-catalog-coverage.ts 2026-03-01 2026-03-31
 */
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

const ENTRIES_DIR = resolve(process.cwd(), "data/hawks/user-entries")

interface CatalogEntry {
	date: string
	brickIndex: number
	direction: "long" | "short"
	label?: string
	expectedResult?: "GA" | "BE" | "ST"
}

const [from, to] = process.argv.slice(2)

const allFiles = readdirSync(ENTRIES_DIR)
	.filter((f) => f.endsWith(".json"))
	.sort()

const inRange = (day: string): boolean => {
	if (from && day < from) {
		return false
	}
	if (to && day > to) {
		return false
	}
	return true
}

const entries: CatalogEntry[] = []
const days: string[] = []
for (const file of allFiles) {
	const day = file.replace(/\.json$/, "")
	if (!inRange(day)) {
		continue
	}
	days.push(day)
	const parsed = JSON.parse(
		readFileSync(resolve(ENTRIES_DIR, file), "utf8")
	) as CatalogEntry[]
	for (const e of parsed) {
		entries.push(e)
	}
}

console.log(
	`\n${"=".repeat(70)}\n  Catalog Coverage — ${days.length} day(s)${from || to ? `  (${from ?? "—"} → ${to ?? "—"})` : ""}\n${"=".repeat(70)}`
)
console.log(`Total catalog entries: ${entries.length}`)
console.log(`Days covered:          ${days.length}`)
console.log(
	`Avg entries/day:       ${(entries.length / Math.max(days.length, 1)).toFixed(2)}`
)

const byDir = entries.reduce<Record<string, number>>((acc, e) => {
	acc[e.direction] = (acc[e.direction] ?? 0) + 1
	return acc
}, {})
console.log(
	`Direction split:       long=${byDir.long ?? 0}  short=${byDir.short ?? 0}`
)

const byResult = entries.reduce<Record<string, number>>((acc, e) => {
	const r = e.expectedResult ?? "—"
	acc[r] = (acc[r] ?? 0) + 1
	return acc
}, {})
console.log(
	`Expected outcomes:     ${Object.entries(byResult)
		.map(([k, v]) => `${k}=${v}`)
		.join("  ")}`
)

console.log(`\n${"─".repeat(70)}\n  Per-day breakdown\n${"─".repeat(70)}`)
console.log(`day          n  brickIndices              dirs       expected`)
for (const day of days) {
	const dayEntries = entries.filter((e) => e.date === day)
	const idxs = dayEntries.map((e) => e.brickIndex).join(",")
	const dirs = dayEntries.map((e) => e.direction[0]).join("")
	const exps = dayEntries.map((e) => e.expectedResult ?? "·").join("")
	console.log(
		`${day}  ${String(dayEntries.length).padStart(2)}  ${idxs.padEnd(24)}  ${dirs.padEnd(8)}   ${exps}`
	)
}

// MatchRate ceiling math:
// matchRate = matches / max(catalogN, tradesN)
// To hit 1.0, an engine must fire exactly N trades on the catalog's (date, brick)
// pairs and NO false positives on any other (date, brick) combination.
console.log(
	`\n${"─".repeat(70)}\n  matchRate ceiling — what a perfect engine would do\n${"─".repeat(70)}`
)
console.log(
	`Targets to hit:        ${entries.length} unique (date, brickIndex) pairs`
)
console.log(`Allowed false positives for matchRate ≥ 0.5: ${entries.length}`)
console.log(
	`Allowed false positives for matchRate ≥ 0.9: ${Math.floor(entries.length * (1 / 0.9 - 1))}`
)
console.log(`Allowed false positives for matchRate = 1.0: 0`)

// Outliers — same day clusters, long brick gaps within a day
console.log(`\n${"─".repeat(70)}\n  Density signals\n${"─".repeat(70)}`)
const counts = days.map((d) => ({
	day: d,
	n: entries.filter((e) => e.date === d).length,
}))
const maxDay = counts.reduce((a, b) => (b.n > a.n ? b : a), { day: "—", n: 0 })
const minDay = counts.reduce((a, b) => (b.n < a.n ? b : a), {
	day: "—",
	n: Infinity,
})
console.log(`Densest day:           ${maxDay.day} (${maxDay.n} entries)`)
console.log(`Sparsest day:          ${minDay.day} (${minDay.n} entries)`)

const allDirsAllDays = days.every((d) => {
	const dayEntries = entries.filter((e) => e.date === d)
	const has = new Set(dayEntries.map((e) => e.direction))
	return has.size > 1
})
console.log(
	`Both directions/day:   ${allDirsAllDays ? "yes" : "no — most days are single-direction (engine bias matters)"}`
)

console.log(``)
