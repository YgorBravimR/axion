#!/usr/bin/env -S pnpm exec tsx
/**
 * Token fix — replaces invalid Axion tokens (that compile to nothing in
 * Tailwind v4) with valid ones from `src/app/globals.css @theme`.
 *
 * Catches the bug class documented in
 * `docs/scans/2026-05-07-cockpit-tokens.md` § Root causes #1.
 *
 * Adding a rule: append a `{ from, to, reason }` object to RULES. The
 * `from` field can be a string (exact word-bounded match) or a RegExp.
 *
 * Usage:
 *   pnpm exec tsx scripts/token-fix.ts          # apply
 *   pnpm exec tsx scripts/token-fix.ts --dry    # report only, exit 1 if matches
 */
import { readFileSync, writeFileSync } from "node:fs"
import { execSync } from "node:child_process"

interface Rule {
	category: string
	from: RegExp
	to: string
	reason: string
}

const SPACING_PROPS = [
	"gap",
	"gap-x",
	"gap-y",
	"p",
	"px",
	"py",
	"pt",
	"pb",
	"pl",
	"pr",
	"m",
	"mx",
	"my",
	"mt",
	"mb",
	"ml",
	"mr",
	"space-x",
	"space-y",
	"inset",
	"top",
	"bottom",
	"left",
	"right",
	"w",
	"h",
	"min-w",
	"min-h",
	"max-w",
	"max-h",
]

const wordBound = (literal: string): RegExp =>
	new RegExp(`\\b${literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w.-])`, "g")

const buildSpacingFixes = (): Rule[] => {
	const fixes: Rule[] = []
	const invalidSpacing: Record<string, string> = {
		"s-400": "m-400",
		"s-500": "m-500",
		"s-600": "m-600",
		"m-100": "s-100",
		"m-200": "s-200",
		"m-300": "s-300",
		"l-100": "s-100",
		"l-200": "s-200",
		"l-300": "s-300",
		"l-400": "m-400",
		"l-500": "m-500",
		"l-600": "m-600",
	}
	for (const prop of SPACING_PROPS) {
		for (const [bad, good] of Object.entries(invalidSpacing)) {
			fixes.push({
				category: "spacing",
				from: wordBound(`${prop}-${bad}`),
				to: `${prop}-${good}`,
				reason: `Axion spacing scale: s-100/200/300, m-400/500/600, l-700/800/900 only.`,
			})
		}
	}
	return fixes
}

const RULES: Rule[] = [
	// Radius — only --radius defined; use Tailwind built-ins.
	{
		category: "radius",
		from: wordBound("rounded-m-200"),
		to: "rounded-md",
		reason: "No `--radius-m-*` token; use `rounded-md`.",
	},
	{
		category: "radius",
		from: wordBound("rounded-m-300"),
		to: "rounded-md",
		reason: "No `--radius-m-*` token; use `rounded-md`.",
	},
	{
		category: "radius",
		from: wordBound("rounded-m-400"),
		to: "rounded-lg",
		reason: "No `--radius-m-*` token; use `rounded-lg`.",
	},
	{
		category: "radius",
		from: wordBound("rounded-s-100"),
		to: "rounded-sm",
		reason: "No `--radius-s-*` token; use `rounded-sm`.",
	},
	{
		category: "radius",
		from: wordBound("rounded-s-200"),
		to: "rounded-sm",
		reason: "No `--radius-s-*` token; use `rounded-sm`.",
	},
	{
		category: "radius",
		from: wordBound("rounded-l-700"),
		to: "rounded-lg",
		reason: "No `--radius-l-*` token; use `rounded-lg`.",
	},
	{
		category: "radius",
		from: wordBound("rounded-l-800"),
		to: "rounded-xl",
		reason: "No `--radius-l-*` token; use `rounded-xl`.",
	},

	// Text scale — h1/h2/h3/body/small/tiny/micro only.
	{
		category: "typography",
		from: wordBound("text-h4"),
		to: "text-h3",
		reason: "No `--text-h4` token; demote to `text-h3` or use `text-body font-semibold`.",
	},
	{
		category: "typography",
		from: /\btext-heading-(\d+)\b/g,
		to: "text-h$1",
		reason: "Use Axion `text-h{N}` (matches `--text-h{N}` token), not `text-heading-{N}`.",
	},

	// Tailwind v4 deprecated utilities (still common from v3 muscle memory).
	{
		category: "v3-deprecated",
		from: wordBound("flex-shrink-0"),
		to: "shrink-0",
		reason: "v4 deprecated `flex-shrink-0`; use `shrink-0`.",
	},
	{
		category: "v3-deprecated",
		from: wordBound("flex-shrink"),
		to: "shrink",
		reason: "v4 deprecated `flex-shrink`; use `shrink`.",
	},
	{
		category: "v3-deprecated",
		from: /\btransition-colors\s+transition-opacity\b/g,
		to: "transition",
		reason: "Conflicting transition-* utilities both set `transition-property`; use `transition` (covers all).",
	},
	{
		category: "typography",
		from: /\btext-\[10px\]/g,
		to: "text-micro",
		reason: "Use design-system `text-micro` instead of arbitrary `text-[10px]`.",
	},
	{
		category: "typography",
		from: /\btext-\[11px\]/g,
		to: "text-tiny",
		reason: "Use design-system `text-tiny` instead of arbitrary `text-[11px]`.",
	},
	{
		category: "typography",
		from: /\btext-\[12px\]/g,
		to: "text-small",
		reason: "Use design-system `text-small` instead of arbitrary `text-[12px]`.",
	},

	// Semantic colors — fb-error/warning/success.
	{
		category: "semantic-color",
		from: /\b(text|bg|border|ring|fill|stroke|outline)-err-\d{2,3}\b/g,
		to: "$1-fb-error",
		reason: "No `err-*` token; use `fb-error`.",
	},
	{
		category: "semantic-color",
		from: /\b(text|bg|border|ring|fill|stroke|outline)-warn-\d{2,3}\b/g,
		to: "$1-warning",
		reason: "No `warn-*` token; use `warning` (CSS var `--color-warning`).",
	},
	{
		category: "semantic-color",
		from: /\b(text|bg|border|ring|fill|stroke|outline)-fb-warning\b/g,
		to: "$1-warning",
		reason: "No `fb-warning` token (only `fb-error` and `fb-success` exist with `fb-` prefix); use `warning`.",
	},
	{
		category: "semantic-color",
		from: /\b(text|bg|border|ring|fill|stroke|outline)-success-\d{2,3}\b/g,
		to: "$1-fb-success",
		reason: "No `success-*` token; use `fb-success`.",
	},

	// Spacing namespace mistakes — generated.
	...buildSpacingFixes(),
]

const listFiles = (): string[] => {
	const out = execSync(
		`find src -type f \\( -name "*.tsx" -o -name "*.ts" \\) -not -path "*/node_modules/*"`,
		{ encoding: "utf8" },
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
	for (const rule of RULES) {
		const before = modified
		modified = modified.replace(rule.from, rule.to)
		if (before !== modified) {
			const matches = before.match(rule.from)
			const count = matches ? matches.length : 0
			const key = `${rule.category}: ${rule.from.source}`
			hits.set(key, (hits.get(key) ?? 0) + count)
		}
	}
	if (modified === original) return null
	if (!dry) writeFileSync(path, modified, "utf8")
	return { path, hits }
}

const main = (): void => {
	const dry = process.argv.includes("--dry")
	const files = listFiles()
	const changes: FileChange[] = []
	for (const file of files) {
		const change = processFile(file, dry)
		if (change) changes.push(change)
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
		`\n${changes.length} / ${files.length} files ${dry ? "would change" : "updated"}.`,
	)
	if (totals.size > 0) {
		console.log("\nTotals by rule:")
		for (const [rule, count] of [...totals].sort((a, b) => b[1] - a[1])) {
			console.log(`  ${count}× ${rule}`)
		}
	}

	if (dry && changes.length > 0) process.exit(1)
}

main()
