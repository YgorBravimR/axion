#!/usr/bin/env tsx
/**
 * Rewrites `<Label id="label-X" ...>` → `<Label htmlFor="<target-id>" id="label-X" ...>`
 * across `src/components/**` by finding the next sibling form control's `id=`
 * within the next ~12 lines after the Label's `</Label>` closing tag.
 *
 * In `--dry` mode, prints per-Label candidate decisions:
 *   FIX    file:line   id="label-X"  →  htmlFor="<found-id>"
 *   SKIP   file:line   id="label-X"  (no candidate id within window)
 *
 * The window-and-pick approach handles inconsistent naming patterns where the
 * label id (`label-X`) does not match the input id (often a longer scoped name
 * like `dezk-zero-cross` or `csv-trade-strategy`). It also naturally skips
 * Labels that decorate readonly `<div>` displays (no nearby id).
 *
 * Usage:
 *   pnpm exec tsx scripts/label-htmlfor-fix.ts --dry        # report only
 *   pnpm exec tsx scripts/label-htmlfor-fix.ts              # apply
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const DRY = process.argv.includes("--dry")

const SKIP_FILES = new Set([
	"src/components/ui/label.tsx",
	"src/components/ui/form.tsx",
])

const WINDOW_LINES = 12

const walk = (dir: string, out: string[] = []): string[] => {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry)
		const stat = statSync(full)
		if (stat.isDirectory()) {
			walk(full, out)
		} else if (
			stat.isFile() &&
			full.endsWith(".tsx") &&
			!SKIP_FILES.has(full)
		) {
			out.push(full)
		}
	}
	return out
}

const files = walk("src/components")

let totalFixed = 0
let totalSkipped = 0
const perFile: Record<string, number> = {}
const decisions: string[] = []

for (const file of files) {
	const original = readFileSync(file, "utf8")
	if (!/<Label\b/.test(original)) {
		continue
	}

	const lines = original.split("\n")
	const labelOpenRe = /<Label\b/

	const replacements: Array<{
		start: number
		end: number
		text: string
	}> = []

	for (let i = 0; i < lines.length; i++) {
		if (!labelOpenRe.test(lines[i])) {
			continue
		}

		let openEnd = i
		while (openEnd < lines.length && !lines[openEnd].includes(">")) {
			openEnd++
		}
		if (openEnd >= lines.length) {
			continue
		}

		const tagSrc = lines.slice(i, openEnd + 1).join("\n")
		const headMatch = tagSrc.match(/<Label\b([\s\S]*?)>/)
		if (!headMatch) {
			continue
		}
		const attrs = headMatch[1]
		if (/\bhtmlFor=/.test(attrs)) {
			continue
		}

		const idAttrMatch = attrs.match(
			/\bid=("label-[^"]+"|\{`[^`]*label-[^`]*`\})/
		)
		if (!idAttrMatch) {
			continue
		}

		let closeIdx = -1
		for (let j = openEnd; j < lines.length && j <= openEnd + 8; j++) {
			if (lines[j].includes("</Label>")) {
				closeIdx = j
				break
			}
		}
		if (closeIdx === -1) {
			continue
		}

		const labelIdStaticMatch = attrs.match(/\bid="label-([^"]+)"/)
		const labelIdDynamicMatch = attrs.match(/\bid=\{`([^`]*)label-([^`]*)`\}/)
		const expectedStatic = labelIdStaticMatch ? labelIdStaticMatch[1] : null
		const expectedDynamicPrefix = labelIdDynamicMatch
			? labelIdDynamicMatch[1]
			: null
		const expectedDynamicSuffix = labelIdDynamicMatch
			? labelIdDynamicMatch[2]
			: null

		let foundId: string | null = null
		let foundIsDynamic = false
		for (
			let k = closeIdx + 1;
			k < lines.length && k <= closeIdx + WINDOW_LINES;
			k++
		) {
			const ln = lines[k]
			const staticIdMatch = ln.match(/\bid="([^"]+)"/)
			if (
				staticIdMatch &&
				expectedStatic &&
				staticIdMatch[1] === expectedStatic
			) {
				foundId = staticIdMatch[1]
				foundIsDynamic = false
				break
			}
			const dynIdMatch = ln.match(/\bid=\{`([^`]*)`\}/)
			if (
				dynIdMatch &&
				expectedDynamicPrefix !== null &&
				expectedDynamicSuffix !== null
			) {
				if (
					dynIdMatch[1] === `${expectedDynamicPrefix}${expectedDynamicSuffix}`
				) {
					foundId = dynIdMatch[1]
					foundIsDynamic = true
					break
				}
			}
		}

		if (!foundId) {
			decisions.push(
				`SKIP   ${file}:${i + 1}   ${idAttrMatch[0]}   (no candidate id within ${WINDOW_LINES} lines)`
			)
			totalSkipped++
			continue
		}

		const htmlForAttr = foundIsDynamic
			? `htmlFor={\`${foundId}\`}`
			: `htmlFor="${foundId}"`

		const idAttrRe = /\bid=("label-[^"]+"|\{`[^`]*label-[^`]*`\})/
		const newTag = tagSrc.replace(idAttrRe, `${htmlForAttr} $&`)

		decisions.push(
			`FIX    ${file}:${i + 1}   ${idAttrMatch[0]}   →   ${htmlForAttr}`
		)

		replacements.push({
			start: i,
			end: openEnd,
			text: newTag,
		})
	}

	if (replacements.length > 0) {
		const newLines = [...lines]
		for (let r = replacements.length - 1; r >= 0; r--) {
			const { start, end, text } = replacements[r]
			newLines.splice(start, end - start + 1, ...text.split("\n"))
		}
		perFile[file] = replacements.length
		totalFixed += replacements.length
		if (!DRY) {
			writeFileSync(file, newLines.join("\n"))
		}
	}
}

console.log(decisions.join("\n"))
console.log("\n--- summary ---")
const action = DRY ? "would fix" : "fixed"
for (const [file, n] of Object.entries(perFile).sort((a, b) => b[1] - a[1])) {
	console.log(`  ${n.toString().padStart(3)}  ${file}`)
}
console.log(
	`\nTotal: ${totalFixed} ${action} across ${Object.keys(perFile).length} files; skipped ${totalSkipped}`
)
