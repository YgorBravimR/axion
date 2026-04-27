#!/usr/bin/env bun
/**
 * Token sweep — replaces raw Tailwind spacing utilities with Axion design tokens
 * across src/ TSX/TS files. Idempotent.
 *
 * Mapping rationale: Tailwind's default scale uses 0.25rem increments (4px steps).
 * Axion tokens are: s-100=4, s-200=8, s-300=12, m-400=16, m-500=20, m-600=24,
 * l-700=32, l-800=48, l-900=64.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { execSync } from "node:child_process"

const SPACING_MAP: Record<string, string> = {
	"1": "s-100",
	"2": "s-200",
	"3": "s-300",
	"4": "m-400",
	"5": "m-500",
	"6": "m-600",
	"8": "l-700",
}

const PROPERTIES = [
	"gap",
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
]

const buildPatterns = (): Array<{ from: RegExp; to: string }> => {
	const patterns: Array<{ from: RegExp; to: string }> = []
	for (const prop of PROPERTIES) {
		for (const [num, token] of Object.entries(SPACING_MAP)) {
			// Word boundary on both sides; allow only Tailwind-class context (whitespace, ", ', `)
			// Negative lookahead `(?![\d.])` excludes half-step utilities like
			// `gap-1.5` — without it, `\b1\b` matched the `1` in `1.5` because
			// `.` is a non-word character.
			const escaped = `${prop}-${num}`
			const regex = new RegExp(`\\b${escaped}(?![\\w.])`, "g")
			patterns.push({ from: regex, to: `${prop}-${token}` })
		}
	}
	return patterns
}

const PATTERNS = buildPatterns()

const listFiles = (): string[] => {
	const out = execSync(
		`find src -type f \\( -name "*.tsx" -o -name "*.ts" \\) -not -path "*/node_modules/*"`,
		{ encoding: "utf8" }
	)
	return out.split("\n").filter(Boolean)
}

const processFile = (path: string): boolean => {
	const original = readFileSync(path, "utf8")
	let modified = original
	for (const { from, to } of PATTERNS) {
		modified = modified.replace(from, to)
	}
	if (modified !== original) {
		writeFileSync(path, modified, "utf8")
		return true
	}
	return false
}

const files = listFiles()
let changed = 0
for (const file of files) {
	if (processFile(file)) {
		changed += 1
		console.log(`✓ ${file}`)
	}
}
console.log(`\n${changed} / ${files.length} files updated.`)
