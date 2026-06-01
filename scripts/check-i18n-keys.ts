#!/usr/bin/env tsx
/**
 * Static i18n integrity check.
 *
 * Scans every `useTranslations(...)` / `getTranslations(...)` hook in src/**, composes the
 * full dotted key each `t("...")` call resolves to, and diffs against the flattened key set
 * of every messages/*.json. Reports:
 *  - missing keys (referenced in code, absent from one or more locales)
 *  - locale parity gaps (key in one locale, not the other)
 *  - similar-name typos (missing key with Levenshtein <= 3 to an existing key)
 *  - dynamic refs (template literals, variables — skipped, listed for awareness)
 *
 * Exit code: 1 if any missing key or locale parity gap is found, 0 otherwise.
 *
 * Catalogued anti-patterns this catches:
 *  - "t(\"key\") references with no matching JSON entry" (memory.md 2026-05-28)
 *  - "i18n wrong-key drift" (memory.md 2026-05-28)
 *  - locale parity drift
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const REPO_ROOT = process.cwd()
const SRC_DIR = join(REPO_ROOT, "src")
const MESSAGES_DIR = join(REPO_ROOT, "messages")

type Reference = {
	file: string
	line: number
	hookVar: string
	namespace: string
	leafKey: string
	fullKey: string
}

const flattenKeys = (
	obj: unknown,
	prefix = "",
	out = new Set<string>()
): Set<string> => {
	if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
		return out
	}
	for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
		const key = prefix ? `${prefix}.${k}` : k
		if (v !== null && typeof v === "object" && !Array.isArray(v)) {
			flattenKeys(v, key, out)
		} else {
			out.add(key)
		}
	}
	return out
}

const walk = (dir: string, out: string[] = []): string[] => {
	for (const entry of readdirSync(dir)) {
		if (entry === "node_modules" || entry.startsWith(".")) {
			continue
		}
		const full = join(dir, entry)
		const s = statSync(full)
		if (s.isDirectory()) {
			walk(full, out)
		} else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.|\.spec\./.test(entry)) {
			out.push(full)
		}
	}
	return out
}

type HookBinding = { line: number; hookVar: string; namespace: string }

const collectHookBindings = (src: string): HookBinding[] => {
	const lines = src.split("\n")
	const bindings: HookBinding[] = []
	const namedRe =
		/(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\s*\(\s*["']([^"']+)["']\s*\)/
	const bareRe =
		/(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\s*\(\s*\)/
	for (let i = 0; i < lines.length; i++) {
		const named = lines[i].match(namedRe)
		if (named) {
			bindings.push({ line: i + 1, hookVar: named[1], namespace: named[2] })
			continue
		}
		const bare = lines[i].match(bareRe)
		if (bare) {
			bindings.push({ line: i + 1, hookVar: bare[1], namespace: "" })
		}
	}
	return bindings
}

const resolveBinding = (
	bindings: HookBinding[],
	hookVar: string,
	callLine: number
): HookBinding | undefined => {
	let best: HookBinding | undefined
	for (const b of bindings) {
		if (b.hookVar !== hookVar) {
			continue
		}
		if (b.line > callLine) {
			break
		}
		best = b
	}
	return best
}

const collectRefs = (
	file: string
): { refs: Reference[]; dynamic: string[] } => {
	const src = readFileSync(file, "utf8")
	const lines = src.split("\n")
	const bindings = collectHookBindings(src)
	if (bindings.length === 0) {
		return { refs: [], dynamic: [] }
	}

	const refs: Reference[] = []
	const dynamic: string[] = []
	const hookVars = [...new Set(bindings.map((b) => b.hookVar))].join("|")
	const callStaticRe = new RegExp(
		`\\b(${hookVars})\\(\\s*["']([a-zA-Z][\\w.]*)["']`,
		"g"
	)
	const callDynRe = new RegExp(`\\b(${hookVars})\\(\\s*\`([^\`]+)\``, "g")

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]
		const callLine = i + 1
		for (const m of line.matchAll(callStaticRe)) {
			const hookVar = m[1]
			const leafKey = m[2]
			const binding = resolveBinding(bindings, hookVar, callLine)
			if (!binding) {
				continue
			}
			const namespace = binding.namespace
			const fullKey = namespace ? `${namespace}.${leafKey}` : leafKey
			refs.push({
				file: relative(REPO_ROOT, file),
				line: callLine,
				hookVar,
				namespace,
				leafKey,
				fullKey,
			})
		}
		for (const m of line.matchAll(callDynRe)) {
			dynamic.push(
				`${relative(REPO_ROOT, file)}:${callLine} → ${m[1]}(\`${m[2]}\`)`
			)
		}
	}
	return { refs, dynamic }
}

const levenshtein = (a: string, b: string): number => {
	const m = a.length
	const n = b.length
	if (Math.abs(m - n) > 4) {
		return 5
	}
	const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j)
	for (let i = 1; i <= m; i++) {
		let prev = dp[0]
		dp[0] = i
		for (let j = 1; j <= n; j++) {
			const tmp = dp[j]
			dp[j] =
				a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1])
			prev = tmp
		}
	}
	return dp[n]
}

const main = (): void => {
	const localeFiles = readdirSync(MESSAGES_DIR).filter((f) =>
		f.endsWith(".json")
	)
	const localeKeys = new Map<string, Set<string>>()
	for (const f of localeFiles) {
		const data = JSON.parse(readFileSync(join(MESSAGES_DIR, f), "utf8"))
		localeKeys.set(f, flattenKeys(data))
	}

	const srcFiles = walk(SRC_DIR)
	const allRefs: Reference[] = []
	const allDynamic: string[] = []
	for (const f of srcFiles) {
		const { refs, dynamic } = collectRefs(f)
		allRefs.push(...refs)
		allDynamic.push(...dynamic)
	}

	const uniqueKeys = new Set(allRefs.map((r) => r.fullKey))
	const missingByLocale = new Map<string, Reference[]>()
	for (const f of localeFiles) {
		missingByLocale.set(f, [])
	}

	for (const ref of allRefs) {
		for (const f of localeFiles) {
			if (!localeKeys.get(f)!.has(ref.fullKey)) {
				missingByLocale.get(f)!.push(ref)
			}
		}
	}

	const parityGaps: {
		key: string
		presentIn: string[]
		missingFrom: string[]
	}[] = []
	const allLocaleKeys = new Set<string>()
	for (const keys of localeKeys.values()) {
		for (const k of keys) {
			allLocaleKeys.add(k)
		}
	}
	for (const k of allLocaleKeys) {
		const presentIn: string[] = []
		const missingFrom: string[] = []
		for (const f of localeFiles) {
			if (localeKeys.get(f)!.has(k)) {
				presentIn.push(f)
			} else {
				missingFrom.push(f)
			}
		}
		if (missingFrom.length > 0 && presentIn.length > 0) {
			parityGaps.push({ key: k, presentIn, missingFrom })
		}
	}

	const allMissingKeys = new Set<string>()
	for (const refs of missingByLocale.values()) {
		for (const r of refs) {
			allMissingKeys.add(r.fullKey)
		}
	}

	const typoSuggestions = new Map<string, string[]>()
	if (allMissingKeys.size > 0) {
		const referenceLocale = localeFiles.includes("en.json")
			? "en.json"
			: localeFiles[0]
		const candidateKeys = [...localeKeys.get(referenceLocale)!]
		for (const missing of allMissingKeys) {
			const sameNamespace = candidateKeys.filter((k) => {
				const dotIdx = missing.lastIndexOf(".")
				if (dotIdx === -1) {
					return false
				}
				return k.startsWith(`${missing.slice(0, dotIdx)}.`)
			})
			const close = sameNamespace
				.map((c) => ({ k: c, d: levenshtein(missing, c) }))
				.filter((x) => x.d > 0 && x.d <= 3)
				.sort((a, b) => a.d - b.d)
				.slice(0, 3)
				.map((x) => `${x.k} (distance ${x.d})`)
			if (close.length > 0) {
				typoSuggestions.set(missing, close)
			}
		}
	}

	const totalMissing = [...missingByLocale.values()].reduce(
		(n, refs) => n + refs.length,
		0
	)

	console.log("================================================")
	console.log(" i18n integrity check")
	console.log("================================================")
	console.log(`source files scanned: ${srcFiles.length}`)
	console.log(`static t(...) references: ${allRefs.length}`)
	console.log(`unique resolved keys referenced: ${uniqueKeys.size}`)
	console.log(`dynamic t(...) references (skipped): ${allDynamic.length}`)
	console.log("")

	console.log("locale files:")
	for (const f of localeFiles) {
		console.log(`  ${f}: ${localeKeys.get(f)!.size} keys`)
	}
	console.log("")

	console.log(`locale parity gaps: ${parityGaps.length}`)
	if (parityGaps.length > 0) {
		for (const gap of parityGaps.slice(0, 50)) {
			console.log(
				`  ${gap.key}  (in: ${gap.presentIn.join(",")} | missing: ${gap.missingFrom.join(",")})`
			)
		}
		if (parityGaps.length > 50) {
			console.log(`  ... and ${parityGaps.length - 50} more`)
		}
	}
	console.log("")

	console.log(`missing key references: ${totalMissing}`)
	for (const [f, refs] of missingByLocale) {
		if (refs.length === 0) {
			continue
		}
		console.log(`  in ${f}: ${refs.length}`)
		for (const r of refs.slice(0, 50)) {
			const suggestion = typoSuggestions.get(r.fullKey)
			const tail = suggestion ? `  ⇒ did you mean: ${suggestion[0]}` : ""
			console.log(`    ${r.file}:${r.line}  ${r.fullKey}${tail}`)
		}
		if (refs.length > 50) {
			console.log(`    ... and ${refs.length - 50} more`)
		}
	}
	console.log("")

	if (allDynamic.length > 0 && process.argv.includes("--verbose")) {
		console.log("dynamic references (review manually):")
		for (const d of allDynamic.slice(0, 30)) {
			console.log(`  ${d}`)
		}
		if (allDynamic.length > 30) {
			console.log(`  ... and ${allDynamic.length - 30} more`)
		}
	}

	const fail = totalMissing > 0 || parityGaps.length > 0
	console.log(fail ? "FAIL" : "OK")
	process.exit(fail ? 1 : 0)
}

main()
