#!/usr/bin/env -S pnpm exec tsx
/**
 * Token fix — replaces invalid Axion tokens (that compile to nothing in
 * Tailwind v4) with valid ones from `src/app/globals.css @theme`.
 *
 * Catches the bug class documented in
 * `docs/scans/2026-05-07-cockpit-tokens.md` § Root causes #1.
 *
 * RULES are imported from `eslint-rules/token-rules.mjs` so this script
 * and the `axion/enforce-token-usage` ESLint rule share one catalog.
 *
 * Usage:
 *   pnpm exec tsx scripts/token-fix.ts          # apply
 *   pnpm exec tsx scripts/token-fix.ts --dry    # report only, exit 1 if matches
 */
import { readFileSync, writeFileSync } from "node:fs"
import { execSync } from "node:child_process"
// @ts-expect-error — .mjs without .d.ts; runtime-only catalog shared with ESLint plugin
import { RULES } from "../eslint-rules/token-rules.mjs"

interface Rule {
	category: string
	from: RegExp
	to: string
	reason: string
}

const listFiles = (): string[] => {
	const out = execSync(
		`find src -type f \\( -name "*.tsx" -o -name "*.ts" \\) -not -path "*/node_modules/*"`,
		{ encoding: "utf8" }
	)
	return out.split("\n").filter(Boolean)
}

interface FileChange {
	path: string
	hits: Map<string, number>
}

const processFile = (path: string, dry: boolean): FileChange | null => {
	const original = readFileSync(path, "utf8")
	let modified = original
	const hits = new Map<string, number>()
	for (const rule of RULES as Rule[]) {
		const before = modified
		modified = modified.replace(rule.from, rule.to)
		if (before !== modified) {
			const matches = before.match(rule.from)
			const count = matches ? matches.length : 0
			const key = `${rule.category}: ${rule.from.source}`
			hits.set(key, (hits.get(key) ?? 0) + count)
		}
	}
	if (modified === original) {
		return null
	}
	if (!dry) {
		writeFileSync(path, modified, "utf8")
	}
	return { path, hits }
}

const main = (): void => {
	const dry = process.argv.includes("--dry")
	const files = listFiles()
	const changes: FileChange[] = []
	for (const file of files) {
		const change = processFile(file, dry)
		if (change) {
			changes.push(change)
		}
	}

	const totals = new Map<string, number>()
	for (const change of changes) {
		console.log(`${dry ? "✗" : "✓"} ${change.path}`)
		for (const [rule, count] of change.hits) {
			console.log(`    ${count}× ${rule}`)
			totals.set(rule, (totals.get(rule) ?? 0) + count)
		}
	}

	console.log(
		`\n${changes.length} / ${files.length} files ${dry ? "would change" : "updated"}.`
	)
	if (totals.size > 0) {
		console.log("\nTotals by rule:")
		for (const [rule, count] of [...totals].sort((a, b) => b[1] - a[1])) {
			console.log(`  ${count}× ${rule}`)
		}
	}

	if (dry && changes.length > 0) {
		process.exit(1)
	}
}

main()
